export interface MicrophoneStreamParams {
  /**
   * Leave the browser's voice processing on. Off by default — see below.
   */
  processing?: boolean;
  deviceId?: string;
}

/**
 * Microphone input, unprocessed by default.
 *
 * The default matters more than it looks. Browsers enable echo cancellation,
 * noise suppression and automatic gain control unless told otherwise, because
 * the assumed use is a voice call. For anything that *measures* the signal —
 * pitch detection, chroma analysis, level metering — those are actively
 * destructive: noise suppression eats sustained tones it decides are
 * background, and AGC rewrites the amplitude you were trying to read.
 *
 * So `processing` defaults to false. Turn it on for speech.
 */
export class MicrophoneStream {
  stream: MediaStream | null = null;
  devices: MediaDeviceInfo[] = [];
  label = "";

  private processing: boolean;
  private deviceId?: string;

  constructor({ processing = false, deviceId }: MicrophoneStreamParams = {}) {
    this.processing = processing;
    this.deviceId = deviceId;
  }

  async start(): Promise<MediaStream> {
    this.stop();

    const audio: MediaTrackConstraints = this.processing
      ? {}
      : {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        };
    if (this.deviceId) audio.deviceId = { exact: this.deviceId };

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio,
      video: false,
    });
    const track = this.stream.getAudioTracks()[0];
    this.label = (track?.label || "microphone").slice(0, 28);
    return this.stream;
  }

  async refreshDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      this.devices = all.filter((device) => device.kind === "audioinput");
    } catch {
      this.devices = [];
    }
    return this.devices;
  }

  stop(): void {
    if (!this.stream) return;
    for (const track of this.stream.getTracks()) track.stop();
    this.stream = null;
  }
}
