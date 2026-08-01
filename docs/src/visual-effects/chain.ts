/**
 * PROTOTYPE — a pass-chain runtime for GPU visual effects.
 *
 * A generator synthesises an image from uniforms. A filter transforms an image
 * it is handed. They differ in whether they sample an input, and in nothing
 * else, so a pass says which it is by setting `inputs.source` or leaving it
 * off. The chain feeds each pass's output to the next either way.
 *
 * Nothing here knows about audio, video, or colour. A pass declares what it
 * reads, what it compiles to, and how to turn params into uniforms. Domain data
 * is adapted at the call site.
 *
 * Lives in docs/ rather than packages/ until it earns a name.
 */

// ── Public types ─────────────────────────────────────────────────────────────

/** Per-frame facts every pass may read. No domain data. */
export interface FrameContext {
  /** Seconds since the chain started. */
  time: number;
  /** Seconds since the previous frame, clamped — safe to integrate against. */
  dt: number;
  /** Frames rendered since start. */
  frame: number;
  /** Final output size in device pixels. */
  width: number;
  height: number;
  /** width / height. */
  aspect: number;
}

export type UniformValue = number | Float32Array | number[];
export type Defines = Record<string, string | number>;

export type BufferFormat = "rgba8" | "rgba16f" | "rgba32f";

/**
 * A private render target owned by a pass — simulation state, a half-res
 * scratch buffer, anything that isn't the pass's output.
 */
export interface BufferDef {
  /** Bound as a sampler2D of this name in every step of the owning pass. */
  name: string;
  /** Fixed square size in px. Mutually exclusive with `scale`. */
  size?: number;
  /** Size relative to the pass's own output. Default 1. */
  scale?: number;
  format?: BufferFormat;
  /** Tried in order if `format` fails to make a complete framebuffer. */
  fallback?: BufferFormat[];
  /** Allocate two and expose swap() — required if a step reads what it writes. */
  pingPong?: boolean;
}

export interface DrawOpts {
  /** Where to render. Defaults to the pass's output target. */
  target?: RenderTarget;
  /** Extra uniforms for this step only, merged over the pass-level ones. */
  uniforms?: Record<string, UniformValue>;
  /** Extra textures for this step only, merged over the pass-level ones. */
  textures?: Record<string, WebGLTexture>;
  /** "triangle" (default) draws a fullscreen triangle; "points" draws `count` GL_POINTS. */
  mode?: "triangle" | "points";
  count?: number;
  blend?: "none" | "add";
  /** Clear the target before drawing. */
  clear?: boolean;
}

/** What a pass's `draw` hook is handed. */
export interface PassRuntime {
  gl: WebGL2RenderingContext;
  /** The target the pass's finished image must end up in. */
  output: RenderTarget;
  /** A private buffer declared in `buffers`. */
  buffer(name: string): PingPong;
  /** Run one compiled step. `step` is a key of what `frag` returned. */
  run(step: string, opts?: DrawOpts): void;
}

export interface PassDef<P> {
  name: string;
  /**
   * Output size relative to the canvas. Default 1. A CRT chain wants its signal
   * passes low (0.5) and its screen pass at 1, which is why `uRes` and
   * `uOutRes` are separate uniforms.
   */
  scale?: number;
  /**
   * Compile-time specialisation. The program cache is keyed by name + these, so
   * changing one recompiles rather than rebranching in the shader. AVVA's
   * N_HUES is this.
   */
  defines?: (params: P) => Defines;
  inputs?: {
    /** Sample the previous pass's output (or the chain's source) as `uSrc`. */
    source?: boolean;
    /** Sample this pass's own previous-frame output as `uPrev`. */
    feedback?: boolean;
  };
  /**
   * Fragment source, body only — the preamble is prepended. Return a string for
   * a single-draw pass, or a record of named steps for a multi-step pass (which
   * must then also supply `draw`).
   */
  frag: (defines: Defines) => string | Record<string, string>;
  /** Optional per-step vertex overrides, keyed the same way as `frag`. */
  vert?: (defines: Defines) => Record<string, string>;
  /** Neutral params + context → uniform values. The only door domain data enters by. */
  uniforms?: (params: P, ctx: FrameContext) => Record<string, UniformValue>;
  buffers?: BufferDef[];
  /** Replaces the default single draw into `output`. */
  draw?: (rt: PassRuntime, params: P, ctx: FrameContext) => void;
  /** Capability gate. A false result skips the pass and reports it on the chain. */
  supported?: (gl: WebGL2RenderingContext) => boolean;
}

export interface RenderTarget {
  tex: WebGLTexture;
  fb: WebGLFramebuffer;
  w: number;
  h: number;
}

export interface PingPong {
  front: RenderTarget;
  back: RenderTarget;
  swap(): void;
}

// ── Shader preamble ──────────────────────────────────────────────────────────

const VERT_FULLSCREEN = `#version 300 es
out vec2 vUV;
void main() {
  vec2 p;
  if      (gl_VertexID == 0) p = vec2(-1.0, -1.0);
  else if (gl_VertexID == 1) p = vec2( 3.0, -1.0);
  else                       p = vec2(-1.0,  3.0);
  vUV         = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

/**
 * Value noise + fbm, lifted from AVVA's GLSL_NOISE so field styles port over
 * unchanged. Every pass gets it; unused functions cost nothing after compile.
 */
const GLSL_NOISE = `vec2 _h2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123) * 2.0 - 1.0;
}
float snoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = dot(_h2(i),                 f);
  float b = dot(_h2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(_h2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(_h2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float snoiseN(vec2 p) { return snoise(p) * 0.5 + 0.5; }
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * snoise(p); p *= 2.0; a *= 0.5; }
  return v;
}`;

function preamble(
  defines: Defines,
  wantsSource: boolean,
  wantsFeedback: boolean,
  bufferNames: string[],
): string {
  const defLines = Object.entries(defines)
    .map(([k, v]) => `#define ${k} ${v}`)
    .join("\n");
  // Declared here rather than in each step's body: a pass's buffers are visible
  // to every one of its steps, and making each step redeclare them would mean a
  // step that only writes a buffer still has to name it.
  const bufLines = bufferNames.map((n) => `uniform sampler2D ${n};`).join("\n");
  return `#version 300 es
precision highp float;

in  vec2 vUV;
out vec4 outColor;

${defLines}

// Size of the buffer THIS pass renders into, in device px. A pass at scale 0.5
// sees half of uOutRes here. Grain, scanlines and blur taps want this one.
uniform vec2  uRes;
// Size of the chain's final output, regardless of this pass's scale.
uniform vec2  uOutRes;
uniform float uTime;
uniform float uDt;
uniform int   uFrame;
${wantsSource ? "uniform sampler2D uSrc;" : ""}
${wantsFeedback ? "uniform sampler2D uPrev;" : ""}
${bufLines}

${GLSL_NOISE}

`;
}

// ── Internals ────────────────────────────────────────────────────────────────

interface UniformInfo {
  loc: WebGLUniformLocation;
  type: number;
  size: number;
  /** Assigned texture unit, for samplers only. */
  unit: number;
}

interface CompiledStep {
  prog: WebGLProgram;
  uniforms: Map<string, UniformInfo>;
  samplers: string[];
}

interface PassState<P> {
  def: PassDef<P>;
  defines: Defines;
  key: string;
  steps: Map<string, CompiledStep>;
  io: PingPong;
  buffers: Map<string, PingPong>;
  skipped: boolean;
  reason?: string;
}

const FORMATS: Record<BufferFormat, { internal: keyof WebGL2RenderingContext; type: keyof WebGL2RenderingContext }> = {
  rgba8: { internal: "RGBA8", type: "UNSIGNED_BYTE" },
  rgba16f: { internal: "RGBA16F", type: "HALF_FLOAT" },
  rgba32f: { internal: "RGBA32F", type: "FLOAT" },
};

// ── EffectChain ──────────────────────────────────────────────────────────────

export class EffectChain<P> {
  readonly canvas: HTMLCanvasElement;

  private readonly _gl: WebGL2RenderingContext;
  private readonly _vao: WebGLVertexArrayObject;
  private readonly _progCache = new Map<string, CompiledStep>();
  private _passes: PassState<P>[] = [];
  private _defs: PassDef<P>[] = [];
  private _sourceTex: WebGLTexture;
  private _blackTex: WebGLTexture;
  private _w = 0;
  private _h = 0;
  private _startT = 0;
  private _lastT = 0;
  private _frame = 0;
  private _lost = false;
  private _disposed = false;
  private _msaa = false;
  private _copy: CompiledStep | null = null;

  /** Passes skipped by their `supported` gate, with the reason. Read after render. */
  readonly skipped: { name: string; reason: string }[] = [];

  constructor(canvas: HTMLCanvasElement, passes: PassDef<P>[]) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error("EffectChain: WebGL2 is not available.");
    this._gl = gl;

    // Without this, a float render target is never framebuffer-complete and the
    // probe in _makePingPongProbed would reject rgba32f/rgba16f on hardware that
    // in fact supports them.
    gl.getExtension("EXT_color_buffer_float");

    // We ask for antialias:false, but the first getContext on a canvas wins —
    // if anything called getContext("webgl2") before us with the defaults, the
    // drawing buffer is multisampled and we cannot blit a single-sample FBO
    // into it. Every frame would fail with INVALID_OPERATION and the canvas
    // would stay black, silently. Check rather than assume, and copy with a
    // draw when we have to.
    this._msaa = ((gl.getParameter(gl.SAMPLES) as number) | 0) > 0;

    // main.js had no equivalent of this, so a lost context meant a silently dead
    // canvas that kept burning a rAF forever.
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this._lost = true;
    });

    this._vao = gl.createVertexArray()!;
    gl.bindVertexArray(this._vao);

    this._blackTex = this._makeTex(1, 1, "rgba8");
    gl.bindTexture(gl.TEXTURE_2D, this._blackTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255]));
    // Mutable storage, unlike every other texture here: an incoming frame
    // changes size whenever the source does, and texImage2D is an
    // INVALID_OPERATION against a texStorage2D-allocated texture.
    this._sourceTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this._sourceTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    this._startT = performance.now() / 1000;
    this._lastT = this._startT;
    this.setPasses(passes);
  }

  get contextLost(): boolean {
    return this._lost;
  }

  /**
   * Swap the chain. Programs are cached by name+defines across calls, so
   * reordering or toggling a pass costs nothing to recompile.
   */
  setPasses(passes: PassDef<P>[]): void {
    this._defs = passes;
    for (const p of this._passes) this._freePass(p);
    this._passes = [];
    this.skipped.length = 0;
    this._resize(true);
  }

  render(source: TexImageSource | null, params: P): void {
    if (this._disposed || this._lost) return;
    const gl = this._gl;

    this._resize(false);
    if (!this._passes.length) return;

    const now = performance.now() / 1000;
    const ctx: FrameContext = {
      time: now - this._startT,
      // Clamped so a backgrounded tab resuming doesn't leap anything that
      // integrates against dt.
      dt: Math.min(0.1, Math.max(0, now - this._lastT)),
      frame: this._frame,
      width: this._w,
      height: this._h,
      aspect: this._w / Math.max(1, this._h),
    };
    this._lastT = now;
    this._frame++;

    let incoming = this._blackTex;
    if (source) {
      gl.bindTexture(gl.TEXTURE_2D, this._sourceTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      incoming = this._sourceTex;
    }

    gl.bindVertexArray(this._vao);

    let last: RenderTarget | null = null;
    for (const pass of this._passes) {
      if (pass.skipped) continue;

      // A `defines` change recompiles here rather than at a separate call site,
      // so there is never a frame where the program and the params disagree.
      this._ensureSteps(pass, params);

      const passUniforms = pass.def.uniforms?.(params, ctx) ?? {};
      const passTextures: Record<string, WebGLTexture> = {};
      if (pass.def.inputs?.source) passTextures.uSrc = incoming;
      if (pass.def.inputs?.feedback) passTextures.uPrev = pass.io.front.tex;

      const rt = this._runtimeFor(pass, passUniforms, passTextures, ctx);

      if (pass.def.draw) pass.def.draw(rt, params, ctx);
      else rt.run("main");

      pass.io.swap();
      last = pass.io.front;
      incoming = last.tex;
    }

    if (!last) return;
    this._present(last);
  }

  /**
   * Last pass to the screen. Blit is the cheap path — no extra program, no
   * extra sampling, and the driver can fast-path it — but it is illegal into a
   * multisampled drawing buffer, so a canvas whose context was created by
   * someone else with the default antialias:true needs a copy draw instead.
   */
  private _present(last: RenderTarget): void {
    const gl = this._gl;

    if (!this._msaa) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, last.fb);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.blitFramebuffer(0, 0, last.w, last.h, 0, 0, this._w, this._h,
        gl.COLOR_BUFFER_BIT, last.w === this._w ? gl.NEAREST : gl.LINEAR);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return;
    }

    if (!this._copy) {
      this._copy = this._compile(
        VERT_FULLSCREEN,
        `#version 300 es
precision highp float;
in  vec2 vUV;
out vec4 outColor;
uniform sampler2D uSrc;
void main() { outColor = vec4(texture(uSrc, vUV).rgb, 1.0); }`,
        "present",
      );
    }
    gl.useProgram(this._copy.prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this._w, this._h);
    gl.disable(gl.BLEND);
    this._bindTextures(this._copy, { uSrc: last.tex });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    const gl = this._gl;
    for (const p of this._passes) this._freePass(p);
    this._passes = [];
    for (const [, step] of this._progCache) gl.deleteProgram(step.prog);
    this._progCache.clear();
    if (this._copy) {
      gl.deleteProgram(this._copy.prog);
      this._copy = null;
    }
    gl.deleteTexture(this._sourceTex);
    gl.deleteTexture(this._blackTex);
    gl.deleteVertexArray(this._vao);
  }

  // ── Runtime handed to a pass's draw hook ───────────────────────────────────

  private _runtimeFor(
    pass: PassState<P>,
    passUniforms: Record<string, UniformValue>,
    passTextures: Record<string, WebGLTexture>,
    ctx: FrameContext,
  ): PassRuntime {
    const gl = this._gl;
    const chain = this;
    return {
      gl,
      output: pass.io.back,
      buffer(name: string): PingPong {
        const pp = pass.buffers.get(name);
        if (!pp) throw new Error(`EffectChain: pass "${pass.def.name}" has no buffer "${name}".`);
        return pp;
      },
      run(step: string, opts: DrawOpts = {}): void {
        const compiled = pass.steps.get(step);
        if (!compiled) {
          throw new Error(`EffectChain: pass "${pass.def.name}" has no step "${step}".`);
        }
        const target = opts.target ?? pass.io.back;
        gl.useProgram(compiled.prog);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
        gl.viewport(0, 0, target.w, target.h);

        chain._setUniforms(compiled, {
          uRes: [target.w, target.h],
          uOutRes: [ctx.width, ctx.height],
          uTime: ctx.time,
          uDt: ctx.dt,
          uFrame: ctx.frame,
          ...passUniforms,
          ...(opts.uniforms ?? {}),
        });
        // Buffer textures resolve at draw time, not once per frame: a step that
        // swaps a ping-pong buffer mid-pass must have the next step see the
        // result, which a snapshot taken before draw() cannot do.
        const bufferTextures: Record<string, WebGLTexture> = {};
        for (const [name, pp] of pass.buffers) bufferTextures[name] = pp.front.tex;

        chain._bindTextures(compiled, {
          ...passTextures,
          ...bufferTextures,
          ...(opts.textures ?? {}),
        });

        if (opts.blend === "add") {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE);
        } else {
          gl.disable(gl.BLEND);
        }
        if (opts.clear) {
          gl.clearColor(0, 0, 0, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        if (opts.mode === "points") {
          gl.drawArrays(gl.POINTS, 0, opts.count ?? 1);
        } else {
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        gl.disable(gl.BLEND);
      },
    };
  }

  // ── Uniforms by introspection ──────────────────────────────────────────────

  /**
   * Types come from the linked program, not from the caller, so `uniforms()`
   * can return a plain bag of names→values. A Float32Array is a float[] or a
   * vec3[] depending on what the shader declared, and only the shader knows.
   * Names the program dropped are ignored, so a pass can hand over more than a
   * given step uses.
   */
  private _setUniforms(step: CompiledStep, values: Record<string, UniformValue>): void {
    const gl = this._gl;
    for (const name in values) {
      const info = step.uniforms.get(name);
      if (!info) continue;
      const v = values[name];
      switch (info.type) {
        case gl.FLOAT:
          if (typeof v === "number") gl.uniform1f(info.loc, v);
          else gl.uniform1fv(info.loc, v as Float32Array);
          break;
        case gl.FLOAT_VEC2:
          gl.uniform2fv(info.loc, v as Float32Array);
          break;
        case gl.FLOAT_VEC3:
          gl.uniform3fv(info.loc, v as Float32Array);
          break;
        case gl.FLOAT_VEC4:
          gl.uniform4fv(info.loc, v as Float32Array);
          break;
        case gl.INT:
        case gl.BOOL:
          gl.uniform1i(info.loc, v as number);
          break;
        default:
          break;
      }
    }
  }

  private _bindTextures(step: CompiledStep, textures: Record<string, WebGLTexture>): void {
    const gl = this._gl;
    for (const name of step.samplers) {
      const info = step.uniforms.get(name)!;
      const tex = textures[name] ?? this._blackTex;
      gl.activeTexture(gl.TEXTURE0 + info.unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(info.loc, info.unit);
    }
  }

  // ── Compilation ────────────────────────────────────────────────────────────

  private _compile(vertSrc: string, fragSrc: string, label: string): CompiledStep {
    const gl = this._gl;
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, vertSrc);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      throw new Error(`EffectChain [${label}] vertex:\n${gl.getShaderInfoLog(vs)}`);
    }
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fragSrc);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      throw new Error(`EffectChain [${label}] fragment:\n${gl.getShaderInfoLog(fs)}`);
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`EffectChain [${label}] link:\n${gl.getProgramInfoLog(prog)}`);
    }

    const uniforms = new Map<string, UniformInfo>();
    const samplers: string[] = [];
    let unit = 0;
    const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const active = gl.getActiveUniform(prog, i);
      if (!active) continue;
      // Array uniforms report as "uName[0]".
      const name = active.name.replace(/\[0\]$/, "");
      const loc = gl.getUniformLocation(prog, active.name);
      if (!loc) continue;
      const isSampler = active.type === gl.SAMPLER_2D;
      uniforms.set(name, {
        loc,
        type: active.type,
        size: active.size,
        unit: isSampler ? unit++ : -1,
      });
      if (isSampler) samplers.push(name);
    }
    return { prog, uniforms, samplers };
  }

  private _stepProgram(
    passName: string,
    stepName: string,
    defines: Defines,
    body: string,
    vertSrc: string,
    wantsSource: boolean,
    wantsFeedback: boolean,
    bufferNames: string[],
  ): CompiledStep {
    const key = `${passName}:${stepName}:${JSON.stringify(defines)}`;
    const hit = this._progCache.get(key);
    if (hit) return hit;
    const full = preamble(defines, wantsSource, wantsFeedback, bufferNames) + body;
    const step = this._compile(vertSrc, full, key);
    this._progCache.set(key, step);
    return step;
  }

  // ── Allocation ─────────────────────────────────────────────────────────────

  private _resize(force: boolean): void {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (!force && w === this._w && h === this._h && this._passes.length) return;

    this.canvas.width = w;
    this.canvas.height = h;
    this._w = w;
    this._h = h;

    for (const p of this._passes) this._freePass(p);
    this._passes = this._defs.map((def) => this._buildPass(def));
    this.skipped.length = 0;
    for (const p of this._passes) {
      if (p.skipped) this.skipped.push({ name: p.def.name, reason: p.reason ?? "unsupported" });
    }
  }

  /**
   * Compile (or fetch from cache) the steps matching this frame's defines.
   * Cheap on the steady path: one function call, one JSON.stringify, one string
   * compare. Recompiles only when a define actually changed, and even then the
   * program cache usually already holds it — flipping N_HUES back and forth
   * costs nothing after the first time each value is seen.
   */
  private _ensureSteps(pass: PassState<P>, params: P): void {
    const defines = pass.def.defines?.(params) ?? {};
    const key = JSON.stringify(defines);
    if (key === pass.key && pass.steps.size) return;
    pass.defines = defines;
    pass.key = key;
    pass.steps = this._buildSteps(pass.def, defines);
  }

  private _buildSteps(def: PassDef<P>, defines: Defines): Map<string, CompiledStep> {
    const fragOut = def.frag(defines);
    const bodies = typeof fragOut === "string" ? { main: fragOut } : fragOut;
    const verts = def.vert?.(defines) ?? {};
    const steps = new Map<string, CompiledStep>();
    for (const stepName in bodies) {
      steps.set(
        stepName,
        this._stepProgram(
          def.name,
          stepName,
          defines,
          bodies[stepName],
          verts[stepName] ?? VERT_FULLSCREEN,
          !!def.inputs?.source,
          !!def.inputs?.feedback,
          (def.buffers ?? []).map((b) => b.name),
        ),
      );
    }
    return steps;
  }

  private _buildPass(def: PassDef<P>): PassState<P> {
    const gl = this._gl;
    const scale = def.scale ?? 1;
    const w = Math.max(1, Math.round(this._w * scale));
    const h = Math.max(1, Math.round(this._h * scale));

    const base: PassState<P> = {
      def,
      defines: {},
      key: "",
      steps: new Map(),
      io: null as unknown as PingPong,
      buffers: new Map(),
      skipped: false,
    };

    if (def.supported && !def.supported(gl)) {
      base.skipped = true;
      base.reason = "GPU capability gate returned false";
      base.io = this._makePingPong(1, 1, "rgba8", false);
      return base;
    }

    base.io = this._makePingPong(w, h, "rgba8", !!def.inputs?.feedback);

    for (const bd of def.buffers ?? []) {
      const bw = bd.size ?? Math.max(1, Math.round(w * (bd.scale ?? 1)));
      const bh = bd.size ?? Math.max(1, Math.round(h * (bd.scale ?? 1)));
      const pp = this._makePingPongProbed(bw, bh, bd);
      if (!pp) {
        base.skipped = true;
        base.reason = `buffer "${bd.name}" could not be allocated in any of its formats`;
        return base;
      }
      base.buffers.set(bd.name, pp);
    }

    // Steps are built lazily on the first render, once params exist to derive
    // `defines` from. Nothing is compiled against a placeholder.
    return base;
  }

  private _makeTex(w: number, h: number, format: BufferFormat): WebGLTexture {
    const gl = this._gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Float targets are not filterable without EXT_float_blend/linear support;
    // NEAREST is the safe choice for state buffers and is what they want anyway.
    const filter = format === "rgba8" ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    const f = FORMATS[format];
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl[f.internal] as number, w, h);
    return tex;
  }

  private _makeTarget(w: number, h: number, format: BufferFormat): RenderTarget | null {
    const gl = this._gl;
    const tex = this._makeTex(w, h, format);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) {
      gl.deleteFramebuffer(fb);
      gl.deleteTexture(tex);
      return null;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  }

  private _makePingPong(w: number, h: number, format: BufferFormat, dual: boolean): PingPong {
    const a = this._makeTarget(w, h, format)!;
    const b = dual ? this._makeTarget(w, h, format)! : a;
    const pp: PingPong = {
      front: a,
      back: b,
      swap() {
        if (this.front === this.back) return;
        const t = this.front;
        this.front = this.back;
        this.back = t;
      },
    };
    // A single-target pass writes and is then read from the same texture, so
    // front must be what the next pass samples.
    if (!dual) pp.swap = () => {};
    return pp;
  }

  /** Try `format`, then each `fallback` in order. Null if none is complete. */
  private _makePingPongProbed(w: number, h: number, bd: BufferDef): PingPong | null {
    const candidates: BufferFormat[] = [bd.format ?? "rgba8", ...(bd.fallback ?? [])];
    for (const format of candidates) {
      const probe = this._makeTarget(w, h, format);
      if (!probe) continue;
      const gl = this._gl;
      gl.deleteFramebuffer(probe.fb);
      gl.deleteTexture(probe.tex);
      return this._makePingPong(w, h, format, !!bd.pingPong);
    }
    return null;
  }

  private _freePass(pass: PassState<P>): void {
    const gl = this._gl;
    const free = (pp: PingPong | null) => {
      if (!pp) return;
      const seen = new Set<RenderTarget>();
      for (const t of [pp.front, pp.back]) {
        if (seen.has(t)) continue;
        seen.add(t);
        gl.deleteFramebuffer(t.fb);
        gl.deleteTexture(t.tex);
      }
    };
    free(pass.io);
    for (const [, pp] of pass.buffers) free(pp);
    pass.buffers.clear();
    // Programs stay in the chain-level cache; they survive resizes.
  }
}
