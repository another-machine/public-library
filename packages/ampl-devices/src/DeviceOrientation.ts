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

  initialize() {
    window.addEventListener(
      "deviceorientation",
      ({ absolute, alpha, beta, gamma }) =>
        this.handler({ absolute, alpha, beta, gamma }),
      true
    );
  }
}
