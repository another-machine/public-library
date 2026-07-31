export interface ScreenStreamParams {
  /**
   * Which surface the picker should offer first. "browser" opens on tabs,
   * which is usually what you want when capturing another page.
   */
  displaySurface?: "browser" | "window" | "monitor";
  audio?: boolean;
}

/**
 * A screen, window or tab capture.
 *
 * Separate from CameraStream because it behaves differently in the one way
 * that matters: the user can end it from browser chrome at any time, without
 * touching your UI. Anything relying on the stream has to hear about that, so
 * `onEnded` is part of the API rather than an afterthought — without it the
 * app sits on a dead stream showing a frozen last frame.
 */
export class ScreenStream {
  stream: MediaStream | null = null;
  label = "";
  /** Called when the user stops sharing from browser chrome. */
  onEnded: (() => void) | null = null;

  private displaySurface: "browser" | "window" | "monitor";
  private audio: boolean;

  constructor({
    displaySurface = "browser",
    audio = false,
  }: ScreenStreamParams = {}) {
    this.displaySurface = displaySurface;
    this.audio = audio;
  }

  /** Opens the browser's picker. Must be called from a user gesture. */
  async start(): Promise<MediaStream> {
    this.stop();

    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: this.displaySurface } as MediaTrackConstraints,
      audio: this.audio,
    });

    const track = this.stream.getVideoTracks()[0];
    this.label = (track?.label || "screen").slice(0, 28);

    // `once` because a track only ends once, and the stream is discarded here
    // so a stale listener would otherwise outlive what it refers to.
    track?.addEventListener(
      "ended",
      () => {
        this.stream = null;
        this.onEnded?.();
      },
      { once: true },
    );

    return this.stream;
  }

  stop(): void {
    if (!this.stream) return;
    for (const track of this.stream.getTracks()) track.stop();
    this.stream = null;
  }
}
