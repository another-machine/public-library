import {
  FRAG_ACCUMULATE,
  FRAG_BLUR,
  FRAG_BRIGHT,
  FRAG_COMPOSITE,
  FRAG_MOTION,
  FRAG_RESOLVE,
  VERT,
} from "./shaders";
import type { DevelopParams, ExposureParams, StackMode } from "./schema";

export interface ExposeOptions extends ExposureParams {
  /** Flip horizontally, for a front-facing camera the user sees mirrored. */
  mirror?: boolean;
  /**
   * Keep the burst on the GPU — the negative — so `restack` can change
   * `frames` and `stack` after the fact. Costs 4 bytes per pixel per frame
   * (a 720p 32-frame burst is ~118 MB), freed by the next expose.
   */
  keepNegative?: boolean;
  /** Called after each frame lands. */
  onProgress?: (stacked: number, total: number) => void;
  signal?: AbortSignal;
}

export interface Exposure {
  width: number;
  height: number;
  /** Frames actually stacked. */
  frames: number;
  stack: "mean" | "max";
}

interface Target {
  tex: WebGLTexture;
  fb: WebGLFramebuffer;
  w: number;
  h: number;
}

/**
 * The accumulator: three moment textures behind one MRT framebuffer — s0 the
 * weighted sum of frames, s1 the same sum weighted by burst position (what
 * lets trail resolve at develop time), s2 the sum of squares (what lets the
 * ghost defocus read the burst's motion as temporal variance).
 */
interface Accum {
  fb: WebGLFramebuffer;
  s0: WebGLTexture;
  s1: WebGLTexture;
  s2: WebGLTexture;
  w: number;
  h: number;
}

function abortError(message: string): Error {
  const e = new Error(message);
  e.name = "AbortError";
  return e;
}

/**
 * Exposing and developing share one WebGL2 context, because they must: the
 * accumulation stays on the GPU as a float texture and the develop chain reads
 * it directly. Handing it back as pixels between the two halves would cost a
 * readback per shot and throw away everything above 1.0 that the halation needs.
 *
 * ```ts
 * const darkroom = new Darkroom();
 * await darkroom.expose(video, { frames: 8, stack: "mean", keepNegative: true });
 * darkroom.develop(params); // params include trail — develop-time, not capture
 * darkroom.restack({ frames: 4 }); // shorter shutter from the kept negative
 * const blob = await darkroom.toBlob();
 * ```
 */
export class Darkroom {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  /** False when EXT_color_buffer_float is missing; highlights then clip at 1.0. */
  readonly floatTargets: boolean;

  private programs: Record<string, WebGLProgram> = {};
  private uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation>>();
  private vao: WebGLVertexArrayObject;
  private frameTex: WebGLTexture;
  private targets = new Map<string, Target>();
  private internalFormat: number;
  private texType: number;

  /** What lets `trail` resolve at develop time — see Accum. */
  private accum: Accum | null = null;
  /** The kept burst, oldest first, when the last expose asked for it. */
  private negative: WebGLTexture[] = [];
  private negativeMirror = false;

  /** Exposure resolution — the accumulator's size. */
  private w = 0;
  private h = 0;
  /** Current develop resolution. */
  private rw = 0;
  private rh = 0;
  private seed = 0;
  private current: Exposure | null = null;
  private lastParams: DevelopParams | null = null;
  private lastScale = 1;
  private busy = false;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement = document.createElement("canvas")) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      // toBlob and toDataURL read the drawing buffer after the frame it was
      // drawn in, which is only defined with this on.
      preserveDrawingBuffer: true,
      alpha: false,
      antialias: false,
    });
    if (!gl) throw new Error("Darkroom: WebGL2 is not available.");
    this.gl = gl;

    this.floatTargets = !!gl.getExtension("EXT_color_buffer_float");
    this.internalFormat = this.floatTargets ? gl.RGBA16F : gl.RGBA8;
    this.texType = this.floatTargets ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    this.programs = {
      accumulate: this.compile(FRAG_ACCUMULATE),
      resolve: this.compile(FRAG_RESOLVE),
      motion: this.compile(FRAG_MOTION),
      blur: this.compile(FRAG_BLUR),
      bright: this.compile(FRAG_BRIGHT),
      composite: this.compile(FRAG_COMPOSITE),
    };

    this.frameTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.frameTex);
    for (const [k, v] of [
      [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
      [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    ] as const) {
      gl.texParameteri(gl.TEXTURE_2D, k, v);
    }
  }

  /** The exposure currently held, or null before the first one. */
  get exposure(): Exposure | null {
    return this.current;
  }

  // ── exposing ───────────────────────────────────────────────────────────────

  /**
   * Stack frames straight off a playing video.
   *
   * Rejects with an `AbortError` rather than returning a torn image if the
   * source changes size mid-burst (a device turn, which would stitch two
   * orientations together), if the signal aborts, or if the page is hidden —
   * a backgrounded tab stops producing frames, and stacking the same stale one
   * eight times looks like a photograph rather than a failure.
   */
  async expose(video: HTMLVideoElement, options: ExposeOptions): Promise<Exposure> {
    if (this.busy) throw new Error("Darkroom: an exposure is already running.");
    if (!video.videoWidth) throw new Error("Darkroom: the video has no frames yet.");

    this.busy = true;
    const kept: WebGLTexture[] = [];
    try {
      const total = Math.max(1, Math.round(options.frames));
      this.freeNegative();
      this.beginAccumulation(video.videoWidth, video.videoHeight, options);

      const track = (video.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
      for (let i = 0; i < total; i++) {
        await this.nextFrame(video);
        if (options.signal?.aborted) throw abortError("Exposure aborted.");
        if (video.videoWidth !== this.w || video.videoHeight !== this.h) {
          throw abortError("The camera changed orientation mid-exposure.");
        }
        if (typeof document !== "undefined" && document.hidden) {
          throw abortError("The page was hidden mid-exposure.");
        }
        if (track && track.readyState !== "live") {
          throw abortError("The camera stream ended mid-exposure.");
        }
        this.stackFrame(video, i, total, options, kept);
        options.onProgress?.(i + 1, total);
      }

      this.seed = Math.random() * 1000;
      return this.endAccumulation(total, options, kept);
    } catch (error) {
      for (const tex of kept) this.gl.deleteTexture(tex);
      throw error;
    } finally {
      this.endBlend();
      this.busy = false;
    }
  }

  /**
   * Stack an array of already-decoded frames. The same accumulation as
   * `expose`, without the wait on a live source — a burst of stills, or frames
   * pulled from a decoded video.
   */
  exposeFrames(frames: TexImageSource[], options: ExposeOptions): Exposure {
    if (!frames.length) throw new Error("Darkroom: no frames to stack.");
    const size = this.sizeOf(frames[0]);
    const kept: WebGLTexture[] = [];
    this.freeNegative();
    this.beginAccumulation(size.width, size.height, options);
    try {
      frames.forEach((frame, i) => {
        this.stackFrame(frame, i, frames.length, options, kept);
        options.onProgress?.(i + 1, frames.length);
      });
      this.seed = Math.random() * 1000;
      return this.endAccumulation(frames.length, options, kept);
    } catch (error) {
      for (const tex of kept) this.gl.deleteTexture(tex);
      throw error;
    } finally {
      this.endBlend();
    }
  }

  /** Frames of the kept negative, or 0 when the last expose did not keep one. */
  get negativeFrames(): number {
    return this.negative.length;
  }

  /**
   * Re-stack the held negative with a different frame count or stack mode —
   * the capture-time half of the exposure, revisited without recapturing.
   * Uses the first `frames` of the burst (the shutter closing earlier),
   * clamped to what was kept. The grain seed is kept, so only what was asked
   * to change changes. Requires an expose with `keepNegative: true`.
   */
  restack({ frames, stack }: { frames?: number; stack?: StackMode } = {}): Exposure {
    if (this.disposed) throw new Error("Darkroom: disposed.");
    if (this.busy) throw new Error("Darkroom: an exposure is already running.");
    if (!this.negative.length) {
      throw new Error("Darkroom: no negative held — expose with keepNegative: true.");
    }
    const mode = stack ?? this.current?.stack ?? "mean";
    const total = Math.min(
      this.negative.length,
      Math.max(1, Math.round(frames ?? this.negative.length)),
    );
    const options: ExposeOptions = { frames: total, stack: mode, mirror: this.negativeMirror };
    this.beginAccumulation(this.w, this.h, options);
    try {
      for (let i = 0; i < total; i++) {
        this.drawAccumulate(this.negative[i], i, total, mode, this.negativeMirror);
      }
    } finally {
      this.endBlend();
    }
    return this.endAccumulation(total, options);
  }

  private beginAccumulation(width: number, height: number, options: ExposeOptions): void {
    const gl = this.gl;
    if (!this.accum || width !== this.w || height !== this.h) {
      this.w = width;
      this.h = height;
      this.freeAccum();
      this.accum = this.makeAccum(width, height);
      // Develop targets were sized against the old exposure.
      this.rw = this.rh = 0;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accum.fb);
    gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    // `mean` sums weighted frames, which also cuts sensor noise by about
    // sqrt(N). `max` keeps the brightest value each pixel ever reached, so a
    // moving light holds full intensity instead of being divided by N.
    gl.blendEquation(options.stack === "max" ? gl.MAX : gl.FUNC_ADD);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  }

  /** Upload a frame — into the kept negative when asked — and accumulate it. */
  private stackFrame(
    frame: TexImageSource,
    index: number,
    total: number,
    options: ExposeOptions,
    kept: WebGLTexture[],
  ): void {
    const gl = this.gl;
    let tex = this.frameTex;
    if (options.keepNegative) {
      tex = this.newTexture();
      kept.push(tex);
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    this.drawAccumulate(tex, index, total, options.stack, options.mirror ?? false);
  }

  /** One already-uploaded frame into the two moments. */
  private drawAccumulate(
    tex: WebGLTexture,
    index: number,
    total: number,
    stack: StackMode,
    mirror: boolean,
  ): void {
    const gl = this.gl;
    const prog = this.programs.accumulate;
    const mean = stack !== "max";
    // Weights pre-scaled by 1/n so an 8-bit fallback accumulator stays in
    // range; the scale cancels at resolve, which divides by the summed weight.
    // Under max every frame carries full weight and the ramp moment is unused.
    const w = mean ? 1 / total : 1;
    const rampW = mean ? (total > 1 ? index / (total - 1) : 1) / total : 0;
    gl.useProgram(prog);
    this.bindTexture(prog, "uFrame", tex, 0);
    gl.uniform1f(this.loc(prog, "uW"), w);
    gl.uniform1f(this.loc(prog, "uRampW"), rampW);
    gl.uniform1f(this.loc(prog, "uMirror"), mirror ? 1 : 0);
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accum!.fb);
    gl.viewport(0, 0, this.accum!.w, this.accum!.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private endAccumulation(
    frames: number,
    options: ExposeOptions,
    kept?: WebGLTexture[],
  ): Exposure {
    if (kept && options.keepNegative) {
      this.negative = kept;
      this.negativeMirror = options.mirror ?? false;
    }
    this.current = {
      width: this.w,
      height: this.h,
      frames,
      stack: options.stack,
    };
    return this.current;
  }

  private endBlend(): void {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  }

  /**
   * requestVideoFrameCallback is the accurate clock, but a stalled stream never
   * fires it and an unraced await would hang the burst with no way back. Racing
   * it against a couple of frame intervals degrades a stall into duplicated
   * frames, which the checks in `expose` then catch.
   */
  private nextFrame(video: HTMLVideoElement): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      const rate = video.srcObject
        ? ((video.srcObject as MediaStream).getVideoTracks()[0]?.getSettings().frameRate ?? 30)
        : 30;
      const timer = setTimeout(finish, Math.max(34, Math.round(2000 / Math.max(rate, 1))));
      if (typeof video.requestVideoFrameCallback === "function") {
        video.requestVideoFrameCallback(() => {
          clearTimeout(timer);
          finish();
        });
      }
    });
  }

  // ── developing ─────────────────────────────────────────────────────────────

  /**
   * Render the held exposure to the canvas.
   *
   * `scale` below 1 renders the whole chain smaller rather than a cheaper
   * approximation of it — every kernel is a fraction of the image, so a 0.5
   * render is the same photograph at half size. That is what makes it usable
   * as a live preview while a control is being dragged.
   */
  develop(params: DevelopParams, scale = 1): void {
    if (this.disposed) throw new Error("Darkroom: disposed.");
    if (!this.current) throw new Error("Darkroom: nothing has been exposed yet.");
    const gl = this.gl;

    const rw = Math.max(1, Math.round(this.w * scale));
    const rh = Math.max(1, Math.round(this.h * scale));
    this.allocDevelopTargets(rw, rh);
    this.lastParams = params;
    this.lastScale = scale;

    const lin = this.targets.get("lin")!;
    const soft1 = this.targets.get("soft1")!;
    const soft2 = this.targets.get("soft2")!;
    const bloomA = this.targets.get("bloomA")!;
    const bloomB = this.targets.get("bloomB")!;
    const defocusA = this.targets.get("defocusA")!;
    const defocusB = this.targets.get("defocusB")!;
    const motionA = this.targets.get("motionA")!;
    const motionB = this.targets.get("motionB")!;

    // Normalise the two accumulated moments into the linear image, and
    // downsample if this is a preview. The per-frame trail weight is linear
    // in burst position — A + B·ramp — so any trail value resolves as a mix
    // of the sum and the position-weighted sum: develop-time by construction.
    // Negative trail mirrors the ramp, so trails lead instead of follow.
    // Under max there are no weights; the moment mix is forced to identity.
    const t = this.current.stack === "mean" ? params.trail : 0;
    const resolve = this.programs.resolve;
    gl.useProgram(resolve);
    this.bindTexture(resolve, "uS0", this.accum!.s0, 0);
    this.bindTexture(resolve, "uS1", this.accum!.s1, 1);
    gl.uniform1f(this.loc(resolve, "uA"), t >= 0 ? 1 : 1 - 6 * t);
    gl.uniform1f(this.loc(resolve, "uB"), 6 * t);
    this.draw(resolve, lin);

    // softness: separable, radius as a fraction of the image
    const blur = this.programs.blur;
    const softRadius = (1 + params.softness * 2.6) / this.w;
    gl.useProgram(blur);
    this.bindTexture(blur, "uSrc", lin.tex, 0);
    gl.uniform2f(this.loc(blur, "uDir"), softRadius, 0);
    this.draw(blur, soft1);

    gl.useProgram(blur);
    this.bindTexture(blur, "uSrc", soft1.tex, 0);
    gl.uniform2f(this.loc(blur, "uDir"), 0, (softRadius * this.w) / this.h);
    this.draw(blur, soft2);

    // bloom: bright pass then two widening separable iterations
    const bright = this.programs.bright;
    gl.useProgram(bright);
    this.bindTexture(bright, "uSrc", lin.tex, 0);
    gl.uniform1f(this.loc(bright, "uHeadroom"), params.headroom);
    this.draw(bright, bloomA);

    const qw = Math.max(1, this.w >> 2);
    const qh = Math.max(1, this.h >> 2);
    for (let i = 1; i <= 2; i++) {
      gl.useProgram(blur);
      this.bindTexture(blur, "uSrc", bloomA.tex, 0);
      gl.uniform2f(this.loc(blur, "uDir"), i / qw, 0);
      this.draw(blur, bloomB);

      gl.useProgram(blur);
      this.bindTexture(blur, "uSrc", bloomB.tex, 0);
      gl.uniform2f(this.loc(blur, "uDir"), 0, i / qh);
      this.draw(blur, bloomA);
    }

    // Depth of field's two masks read the same wide quarter-res blur. Under
    // max there is no mean for motion to deviate from, so ghost is forced
    // quiet the way trail is. Both passes are skipped when the params ask for
    // nothing — the composite still samples the targets, but multiplied by 0.
    const ghost = this.current.stack === "mean" ? params.ghost : 0;
    if (params.aperture > 0 || ghost !== 0) {
      // defocus: downsample-and-blur lin at quarter res, then one widening
      // iteration — ping-pong ending in defocusA
      const steps: Array<[Target, Target, number, number]> = [
        [lin, defocusB, 1 / qw, 0],
        [defocusB, defocusA, 0, 1 / qh],
        [defocusA, defocusB, 2 / qw, 0],
        [defocusB, defocusA, 0, 2 / qh],
      ];
      for (const [src, dst, dx, dy] of steps) {
        gl.useProgram(blur);
        this.bindTexture(blur, "uSrc", src.tex, 0);
        gl.uniform2f(this.loc(blur, "uDir"), dx, dy);
        this.draw(blur, dst);
      }
    }
    if (ghost !== 0) {
      // motion: temporal deviation from the moments, blurred to regions
      const motion = this.programs.motion;
      gl.useProgram(motion);
      this.bindTexture(motion, "uS0", this.accum!.s0, 0);
      this.bindTexture(motion, "uS2", this.accum!.s2, 1);
      this.draw(motion, motionA);

      gl.useProgram(blur);
      this.bindTexture(blur, "uSrc", motionA.tex, 0);
      gl.uniform2f(this.loc(blur, "uDir"), 1.5 / qw, 0);
      this.draw(blur, motionB);
      gl.useProgram(blur);
      this.bindTexture(blur, "uSrc", motionB.tex, 0);
      gl.uniform2f(this.loc(blur, "uDir"), 0, 1.5 / qh);
      this.draw(blur, motionA);
    }

    const comp = this.programs.composite;
    gl.useProgram(comp);
    this.bindTexture(comp, "uLin", lin.tex, 0);
    this.bindTexture(comp, "uSoftTex", soft2.tex, 1);
    this.bindTexture(comp, "uBloom", bloomA.tex, 2);
    this.bindTexture(comp, "uDefocus", defocusA.tex, 3);
    this.bindTexture(comp, "uMotion", motionA.tex, 4);
    gl.uniform2f(this.loc(comp, "uRes"), rw, rh);
    gl.uniform1f(this.loc(comp, "uSeed"), this.seed);
    for (const [name, value] of [
      ["uExposure", params.exposure],
      ["uRolloff", params.rolloff],
      ["uHalation", params.halation],
      ["uHalationHue", params.halationHue],
      ["uBlack", params.black],
      ["uSoftness", params.softness],
      ["uGrain", params.grain],
      ["uDrift", params.drift],
      ["uSplit", params.split],
      ["uShadowHue", params.shadowHue],
      ["uHighlightHue", params.highlightHue],
      ["uVignette", params.vignette],
      ["uAperture", params.aperture],
      ["uFocalPlane", params.focalPlane],
      ["uGhost", ghost],
    ] as const) {
      gl.uniform1f(this.loc(comp, name), value);
    }
    this.draw(comp, null, rw, rh);
  }

  /**
   * Both encoders re-develop at full resolution first if the last render was a
   * preview — saving the half-size version is never what was meant.
   */
  toDataURL(type = "image/jpeg", quality = 0.94): string {
    this.ensureFullResolution();
    return this.canvas.toDataURL(type, quality);
  }

  toBlob(type = "image/jpeg", quality = 0.94): Promise<Blob | null> {
    this.ensureFullResolution();
    return new Promise((resolve) => this.canvas.toBlob(resolve, type, quality));
  }

  private ensureFullResolution(): void {
    if (this.lastScale !== 1 && this.lastParams) this.develop(this.lastParams, 1);
  }

  // ── plumbing ───────────────────────────────────────────────────────────────

  private allocDevelopTargets(rw: number, rh: number): void {
    if (rw === this.rw && rh === this.rh) return;
    this.rw = rw;
    this.rh = rh;
    this.canvas.width = rw;
    this.canvas.height = rh;
    const bw = Math.max(1, rw >> 2);
    const bh = Math.max(1, rh >> 2);
    for (const name of ["lin", "soft1", "soft2"]) {
      this.free(name);
      this.targets.set(name, this.makeTarget(name, rw, rh));
    }
    for (const name of ["bloomA", "bloomB", "defocusA", "defocusB", "motionA", "motionB"]) {
      this.free(name);
      this.targets.set(name, this.makeTarget(name, bw, bh));
    }
  }

  /** A LINEAR/CLAMP texture with no storage yet. */
  private newTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private makeRenderTexture(w: number, h: number): WebGLTexture {
    const gl = this.gl;
    const tex = this.newTexture();
    gl.texImage2D(gl.TEXTURE_2D, 0, this.internalFormat, w, h, 0, gl.RGBA, this.texType, null);
    return tex;
  }

  private makeTarget(name: string, w: number, h: number): Target {
    const gl = this.gl;
    const tex = this.makeRenderTexture(w, h);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Darkroom: could not allocate the "${name}" target at ${w}x${h}.`);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  }

  private makeAccum(w: number, h: number): Accum {
    const gl = this.gl;
    const s0 = this.makeRenderTexture(w, h);
    const s1 = this.makeRenderTexture(w, h);
    const s2 = this.makeRenderTexture(w, h);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, s0, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, s1, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, s2, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Darkroom: could not allocate the accumulator at ${w}x${h}.`);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, s0, s1, s2, w, h };
  }

  private freeAccum(): void {
    if (!this.accum) return;
    this.gl.deleteFramebuffer(this.accum.fb);
    this.gl.deleteTexture(this.accum.s0);
    this.gl.deleteTexture(this.accum.s1);
    this.gl.deleteTexture(this.accum.s2);
    this.accum = null;
  }

  private freeNegative(): void {
    for (const tex of this.negative) this.gl.deleteTexture(tex);
    this.negative = [];
  }

  private free(name: string): void {
    const t = this.targets.get(name);
    if (!t) return;
    this.gl.deleteFramebuffer(t.fb);
    this.gl.deleteTexture(t.tex);
    this.targets.delete(name);
  }

  private draw(prog: WebGLProgram, target: Target | null, w?: number, h?: number): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, target ? target.w : w!, target ? target.h : h!);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private compile(fragSource: string): WebGLProgram {
    const gl = this.gl;
    const prog = gl.createProgram()!;
    for (const [type, source] of [
      [gl.VERTEX_SHADER, VERT],
      [gl.FRAGMENT_SHADER, fragSource],
    ] as const) {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(`Darkroom: shader failed to compile.\n${gl.getShaderInfoLog(shader)}`);
      }
      gl.attachShader(prog, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Darkroom: program failed to link.\n${gl.getProgramInfoLog(prog)}`);
    }
    this.uniforms.set(prog, new Map());
    return prog;
  }

  /** getUniformLocation is a string lookup into the driver; cache it. */
  private loc(prog: WebGLProgram, name: string): WebGLUniformLocation | null {
    const cache = this.uniforms.get(prog)!;
    if (!cache.has(name)) {
      const found = this.gl.getUniformLocation(prog, name);
      if (found) cache.set(name, found);
      else return null;
    }
    return cache.get(name)!;
  }

  private bindTexture(
    prog: WebGLProgram,
    name: string,
    tex: WebGLTexture,
    unit: number,
  ): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.loc(prog, name), unit);
  }

  private sizeOf(frame: TexImageSource): { width: number; height: number } {
    const any = frame as unknown as Record<string, number>;
    const width = any.videoWidth || any.naturalWidth || any.width || 0;
    const height = any.videoHeight || any.naturalHeight || any.height || 0;
    if (!width || !height) throw new Error("Darkroom: could not measure the frame.");
    return { width, height };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    for (const name of [...this.targets.keys()]) this.free(name);
    this.freeAccum();
    this.freeNegative();
    for (const prog of Object.values(this.programs)) gl.deleteProgram(prog);
    gl.deleteTexture(this.frameTex);
    gl.deleteVertexArray(this.vao);
    this.current = null;
  }
}
