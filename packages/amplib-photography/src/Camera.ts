import { CameraStream } from "@amplib/devices";

export interface CameraParams {
  facingMode?: "environment" | "user";
  width?: number;
  height?: number;
  /**
   * Cap the camera's frame rate. Dropping it usually makes the sensor lengthen
   * its per-frame integration time, which is the only indirect exposure lever
   * the web offers. Treated as a request — read `fps` for what was granted.
   */
  frameRate?: number;
  /**
   * Restart the stream when the device turns and the frames come back the wrong
   * way round. Default true.
   */
  followOrientation?: boolean;
  /**
   * The element to play into, when there is already one on the page. Sampling
   * and preview then read the same element, which is what keeps the photograph
   * and the viewfinder from disagreeing. One is created if this is omitted.
   */
  video?: HTMLVideoElement;
}

/**
 * A camera framed as a camera rather than as a stream.
 *
 * `CameraStream` from @amplib/devices does the hard part — acquiring,
 * enumerating, cycling, and stopping the previous tracks so the indicator light
 * goes out. What is added here is what a photograph needs and a stream has no
 * opinion about: a playing video element to sample, the frame rate that was
 * actually granted, whether the image should be mirrored, and shutter time
 * expressed in the only currency available — frames.
 */
export class Camera {
  readonly video: HTMLVideoElement;

  /** The frame rate in force, read back from the track rather than requested. */
  fps = 30;

  private source: CameraStream;
  private facingMode: "environment" | "user";
  private width: number;
  private height: number;
  private requestedFrameRate?: number;
  private followOrientation: boolean;
  private orientationTimer: ReturnType<typeof setTimeout> | null = null;
  private listening = false;
  private onOrientation = () => this.handleOrientation();

  constructor({
    facingMode = "environment",
    width = 1920,
    height = 1080,
    frameRate,
    followOrientation = true,
    video,
  }: CameraParams = {}) {
    this.facingMode = facingMode;
    this.width = width;
    this.height = height;
    this.requestedFrameRate = frameRate;
    this.followOrientation = followOrientation;
    this.source = this.makeStream();

    this.video = video ?? document.createElement("video");
    // Set even on a supplied element: without playsInline iOS takes the stream
    // fullscreen, and without muted the autoplay is refused outright.
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.autoplay = true;
  }

  /** The underlying @amplib/devices stream, for device enumeration and the like. */
  get stream(): CameraStream {
    return this.source;
  }

  /** True when the preview and the capture should both be flipped. */
  get mirrored(): boolean {
    return this.facingMode === "user";
  }

  get size(): { width: number; height: number } {
    return { width: this.video.videoWidth, height: this.video.videoHeight };
  }

  get running(): boolean {
    return !!this.source.stream;
  }

  /** Whether cycling would reach a different camera. */
  get canCycle(): boolean {
    return this.source.canCycle;
  }

  /** How long a burst of `frames` holds the shutter open, in milliseconds. */
  shutterMs(frames: number): number {
    return Math.round((frames * 1000) / Math.max(this.fps, 1));
  }

  async start(): Promise<void> {
    await this.attach(await this.source.start());
    if (this.followOrientation) this.listen();
  }

  /** Move to the next camera the device reports. */
  async cycle(): Promise<void> {
    const next = await this.source.cycle();
    if (next) await this.attach(next);
  }

  /**
   * Swap between front and back. Distinct from `cycle`, which walks every
   * camera reported — on a phone with three rear lenses those are not the same
   * journey.
   */
  async flip(): Promise<void> {
    this.facingMode = this.facingMode === "user" ? "environment" : "user";
    this.source.stop();
    this.source = this.makeStream();
    await this.attach(await this.source.start());
  }

  stop(): void {
    this.source.stop();
    if (this.orientationTimer) clearTimeout(this.orientationTimer);
    this.orientationTimer = null;
    if (this.listening) {
      window.removeEventListener("orientationchange", this.onOrientation);
      window.removeEventListener("resize", this.onOrientation);
      screen.orientation?.removeEventListener?.("change", this.onOrientation);
      this.listening = false;
    }
  }

  private makeStream(): CameraStream {
    return new CameraStream({
      facingMode: this.facingMode,
      width: this.width,
      height: this.height,
    });
  }

  /**
   * Ask the running camera for a different frame rate, or pass nothing to drop
   * the cap. Applied to the live track rather than by re-acquiring, so the
   * preview does not blink; `fps` afterwards is what was granted, which on
   * Safari is often not what was asked for.
   */
  async setFrameRate(frameRate?: number): Promise<number> {
    this.requestedFrameRate = frameRate;
    const track = (this.video.srcObject as MediaStream | null)?.getVideoTracks()[0];
    if (!track) return this.fps;
    try {
      await track.applyConstraints(
        frameRate ? { frameRate: { ideal: frameRate, max: frameRate } } : {},
      );
    } catch {
      // Unsupported here; the readback below reports what actually happened.
    }
    this.fps = track.getSettings().frameRate ?? frameRate ?? 30;
    return this.fps;
  }

  private async attach(media: MediaStream): Promise<void> {
    this.video.srcObject = media;
    await this.video.play();
    // Requested on the live track rather than in the original constraints, so
    // CameraStream keeps owning acquisition.
    await this.setFrameRate(this.requestedFrameRate);
  }

  private listen(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener("orientationchange", this.onOrientation);
    window.addEventListener("resize", this.onOrientation);
    screen.orientation?.addEventListener?.("change", this.onOrientation);
  }

  /**
   * Uploading the video element captures exactly the frame the preview shows,
   * so the two can never disagree about rotation — what breaks on a device turn
   * is a platform that keeps handing out landscape frames while the device is
   * portrait. That is visible in the preview too, so it is renegotiated rather
   * than rotated after the fact: the rotation direction cannot be derived
   * reliably, and a wrong guess is worse than a restart.
   */
  private handleOrientation(): void {
    if (this.orientationTimer) clearTimeout(this.orientationTimer);
    this.orientationTimer = setTimeout(() => {
      if (!this.running || !this.video.videoWidth) return;
      const streamLandscape = this.video.videoWidth > this.video.videoHeight;
      const screenLandscape = window.innerWidth > window.innerHeight;
      if (streamLandscape !== screenLandscape) {
        this.source
          .start()
          .then((media) => this.attach(media))
          .catch(() => {});
      }
    }, 350);
  }
}
