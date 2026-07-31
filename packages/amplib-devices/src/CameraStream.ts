export interface CameraStreamParams {
  /** Which camera to prefer when no specific device is named. */
  facingMode?: "environment" | "user";
  /** Requested resolution. The browser treats these as hints, not demands. */
  width?: number;
  height?: number;
}

/**
 * A camera feed you can switch between devices.
 *
 * `UserMediaStream` covers acquiring a stream once; this covers living with one
 * — enumerating what is available, cycling to the next camera, and stopping the
 * previous tracks when it does. That last part is the one that bites: calling
 * getUserMedia again without stopping the old tracks leaves the previous camera
 * held open, and on a phone the indicator light stays on.
 *
 * Devices are only enumerable in a useful form after permission is granted —
 * before that, labels come back empty and the list may be incomplete — so
 * enumeration happens after `start`, not before it.
 */
export class CameraStream {
  stream: MediaStream | null = null;
  devices: MediaDeviceInfo[] = [];
  /** A short human-readable name for the active track. */
  label = "";

  private facingMode: "environment" | "user";
  private width: number;
  private height: number;
  private deviceIndex = 0;

  constructor({
    facingMode = "environment",
    width = 1280,
    height = 720,
  }: CameraStreamParams = {}) {
    this.facingMode = facingMode;
    this.width = width;
    this.height = height;
  }

  /** Whether cycling would reach a different camera. */
  get canCycle(): boolean {
    return this.devices.length > 1;
  }

  /**
   * Start the camera. Pass a deviceId to open a specific one, otherwise the
   * preferred facing mode decides.
   */
  async start(deviceId?: string): Promise<MediaStream> {
    this.stop();

    const constraints: MediaStreamConstraints = deviceId
      ? { video: { deviceId: { exact: deviceId } }, audio: false }
      : {
          video: {
            facingMode: this.facingMode,
            width: { ideal: this.width },
            height: { ideal: this.height },
          },
          audio: false,
        };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.label = this.readLabel();
    await this.refreshDevices();
    if (deviceId) {
      const index = this.devices.findIndex((d) => d.deviceId === deviceId);
      if (index >= 0) this.deviceIndex = index;
    }
    return this.stream;
  }

  /** Move to the next camera. No-op with fewer than two. */
  async cycle(): Promise<MediaStream | null> {
    if (!this.canCycle) return this.stream;
    this.deviceIndex = (this.deviceIndex + 1) % this.devices.length;
    return this.start(this.devices[this.deviceIndex].deviceId);
  }

  async refreshDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      this.devices = all.filter((device) => device.kind === "videoinput");
    } catch {
      // Enumeration is a convenience; a failure here should not take down a
      // stream that is already running.
      this.devices = [];
    }
    return this.devices;
  }

  stop(): void {
    if (!this.stream) return;
    for (const track of this.stream.getTracks()) track.stop();
    this.stream = null;
  }

  private readLabel(): string {
    const track = this.stream?.getVideoTracks()[0];
    return (track?.label || "camera").slice(0, 28);
  }
}
