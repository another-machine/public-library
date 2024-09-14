export interface DeviceMovementEventArgs {
  acceleration: DeviceMotionEventAcceleration | null;
  accelerationIncludingGravity: DeviceMotionEventAcceleration | null;
  rotationRate: DeviceMotionEventRotationRate | null;
  interval: number;
}

export interface DeviceMovementParams {
  handler: (args: DeviceMovementEventArgs) => void;
}

export class DeviceMovement {
  handler: (args: DeviceMovementEventArgs) => void;

  constructor({ handler }: DeviceMovementParams) {
    this.handler = handler;
  }

  initialize() {
    window.addEventListener(
      "devicemotion",
      ({
        acceleration,
        accelerationIncludingGravity,
        rotationRate,
        interval,
      }) => {
        this.handler({
          acceleration,
          accelerationIncludingGravity,
          rotationRate,
          interval,
        });
      },
      true
    );
  }
}
