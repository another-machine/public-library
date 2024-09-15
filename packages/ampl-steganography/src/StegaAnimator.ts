import { imageOrCanvasIsImage } from "./utilities";

export interface StegaAnimatorParams {
  resolution: number;
  source: HTMLImageElement | HTMLCanvasElement;
}

export interface StegaAnimatorTransform {
  rotation: number;
  scale: number;
  x: number;
  y: number;
}

export interface StegaAnimatorAnimateParams {
  from: StegaAnimatorTransform;
  to: StegaAnimatorTransform;
  rate: number;
  easing?: (n: number) => number;
}

export class StegaAnimator {
  canvas = document.createElement("canvas");
  context = this.canvas.getContext("2d") as CanvasRenderingContext2D;
  resolution: number;
  source: HTMLImageElement | HTMLCanvasElement;
  sourceHeight: number;
  sourceWidth: number;

  constructor({ source, resolution }: StegaAnimatorParams) {
    this.resolution = resolution;
    this.source = source;
    this.sourceHeight = imageOrCanvasIsImage(this.source)
      ? this.source.naturalHeight
      : this.source.height;
    this.sourceWidth = imageOrCanvasIsImage(this.source)
      ? this.source.naturalWidth
      : this.source.width;
  }

  animationLoop(sequences: StegaAnimatorAnimateParams[]) {
    let running = true;
    let i = 0;
    const self = this;

    async function loop() {
      await self.animate(sequences[i % sequences.length]);
      i++;
      if (running) {
        return loop();
      }
    }

    loop();

    return () => (running = false);
  }

  animate({
    from,
    to,
    rate,
    easing = (x: number) => x,
  }: StegaAnimatorAnimateParams) {
    return new Promise<HTMLImageElement | HTMLCanvasElement>((resolve) => {
      const sizeStart = this.resolution * from.scale;
      const sizeEnd = this.resolution * to.scale;
      const sizeDiff = sizeEnd - sizeStart;
      const rotationStart = from.rotation;
      const rotationEnd = to.rotation;
      const rotationDiff = rotationEnd - rotationStart;
      const rotationOffset = Math.PI * 0.5 + (rotationEnd % Math.PI) * 2;
      const sourceDiameter = Math.min(this.sourceWidth, this.sourceHeight);
      this.canvas.width = this.canvas.height = this.resolution;
      let position = 0;

      const animate = () => {
        const progress = easing(position);
        this.context.setTransform({
          a: 1,
          c: 0,
          e: 0,
          b: 0,
          d: 1,
          f: 0,
        });
        const canvas = document.createElement("canvas");
        canvas.height = this.canvas.height;
        canvas.width = this.canvas.width;
        canvas.getContext("2d")?.drawImage(this.canvas, 0, 0);
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.context.globalAlpha = 0.7;
        this.context.drawImage(canvas, 0, 0);
        this.context.globalAlpha = 1;

        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const diameter = sizeStart + sizeDiff * progress;
        const radius = diameter / 2;
        const rotation = progress * rotationDiff + rotationStart;
        const axisX = Math.cos(rotation + rotationOffset);
        const axisY = Math.sin(rotation + rotationOffset);
        const axisLength = Math.hypot(axisX, axisY);
        const normalizedX = axisX / axisLength;
        const normalizedY = axisY / axisLength;

        // Scale along image x to match rotation
        const xScaling = Math.cos(rotation);
        this.context.setTransform({
          a: normalizedY * xScaling,
          b: -normalizedX * xScaling,
          c: normalizedX,
          d: normalizedY,
          e: centerX,
          f: centerY,
        });

        this.context.drawImage(
          this.source,
          0,
          0,
          sourceDiameter,
          sourceDiameter,
          -radius,
          -radius,
          diameter,
          diameter
        );

        if (position >= 1) {
          resolve(this.source);
        } else {
          requestAnimationFrame(animate);
        }
        position = Math.min(position + rate, 1);
      };

      animate();
    });
  }
}
