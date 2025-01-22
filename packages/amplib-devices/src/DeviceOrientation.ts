export interface DeviceOrientationEventArgs {
  absolute: boolean;
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
}

export interface DeviceOrientationParams {
  handler: (args: DeviceOrientationEventArgs) => void;
}

export class DeviceOrientation {
  handler: (args: DeviceOrientationEventArgs) => void;

  constructor({ handler }: DeviceOrientationParams) {
    this.handler = handler;
  }

  async initialize() {
    // @ts-ignore
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      // @ts-ignore
      const permissionState = await DeviceOrientationEvent.requestPermission();
      if (permissionState === "granted") {
        window.addEventListener(
          "deviceorientation",
          ({ absolute, alpha, beta, gamma }) =>
            this.handler({ absolute, alpha, beta, gamma }),
          true
        );
      }
    }
  }
}
