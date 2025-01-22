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

  async initialize() {
    // @ts-ignore
    if (typeof DeviceMotionEvent.requestPermission === "function") {
      // @ts-ignore
      const permissionState = await DeviceMotionEvent.requestPermission();
      if (permissionState === "granted") {
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
  }
}
