export class UserMediaStream {
  stream?: MediaStream;
  devices: MediaDeviceInfo[] = [];

  constructor() {}

  async start(constraints: MediaStreamConstraints) {
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    await this.refreshDevices();
    return this.stream;
  }

  async refreshDevices() {
    this.devices = await navigator.mediaDevices.enumerateDevices();
  }

  get audioInputDevices() {
    return this.devices.filter((device) => device.kind === "audioinput");
  }

  get videoInputDevices() {
    return this.devices.filter((device) => device.kind === "videoinput");
  }
}
