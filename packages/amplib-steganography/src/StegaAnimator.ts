import {
  createCanvasAndContext,
  dimensionsFromSource,
  fillCanvasWithImage,
  getContext,
} from "./utilities";

export interface StegaAnimatorParams {
  resolution: number;
  source: HTMLImageElement | HTMLCanvasElement;
  fadeAmount?: number;
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
  context = getContext(this.canvas);
  resolution: number;
  source: HTMLImageElement | HTMLCanvasElement;
  sourceAspectRatio: number;
  fadeAmount: number;

  constructor({ source, resolution, fadeAmount = 0 }: StegaAnimatorParams) {
    this.resolution = resolution;
    const { width, height } = dimensionsFromSource(source);
    this.sourceAspectRatio = width / height;
    const newWidth = Math.ceil(resolution);
    const newHeight = Math.ceil(resolution / this.sourceAspectRatio);
    const { canvas, context } = createCanvasAndContext(newWidth, newHeight);
    fillCanvasWithImage(canvas, context, source);
    this.source = canvas;
    this.canvas.width = newWidth;
    this.canvas.height = newHeight;
    this.fadeAmount = fadeAmount;
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

  renderFrame(transform: StegaAnimatorTransform) {
    this.context.setTransform({
      a: 1,
      c: 0,
      e: 0,
      b: 0,
      d: 1,
      f: 0,
    });
    const { canvas, context } = createCanvasAndContext();
    canvas.height = this.canvas.height;
    canvas.width = this.canvas.width;
    context.drawImage(this.canvas, 0, 0);
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.globalAlpha = this.fadeAmount;
    this.context.drawImage(canvas, 0, 0);
    this.context.globalAlpha = 1;

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const diameterWidth = this.canvas.width * transform.scale;
    const diameterHeight = this.canvas.height * transform.scale;
    const rotation = transform.rotation;

    // Use a default rotation offset logic similar to animate but based on current rotation
    // or just 0 if we want simple rotation.
    // The original logic used rotationEnd to determine the axis.
    // We'll use the current rotation as the "target" effectively.
    const rotationOffset = Math.PI * 0.5 + (rotation % Math.PI) * 2;

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
      this.canvas.width,
      this.canvas.height,
      diameterWidth / -2,
      diameterHeight / -2,
      diameterWidth,
      diameterHeight
    );
  }

  animate({
    from,
    to,
    rate,
    easing = (x: number) => x,
  }: StegaAnimatorAnimateParams) {
    return new Promise<HTMLImageElement | HTMLCanvasElement>((resolve) => {
      const sizeWidthStart = this.canvas.width * from.scale;
      const sizeWidthEnd = this.canvas.width * to.scale;
      const sizeWidthDiff = sizeWidthEnd - sizeWidthStart;
      const sizeHeightStart = this.canvas.height * from.scale;
      const sizeHeightEnd = this.canvas.height * to.scale;
      const sizeHeightDiff = sizeHeightEnd - sizeHeightStart;
      const rotationStart = from.rotation;
      const rotationEnd = to.rotation;
      const rotationDiff = rotationEnd - rotationStart;
      const rotationOffset = Math.PI * 0.5 + (rotationEnd % Math.PI) * 2;
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
        const { canvas, context } = createCanvasAndContext();
        canvas.height = this.canvas.height;
        canvas.width = this.canvas.width;
        context.drawImage(this.canvas, 0, 0);
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.context.globalAlpha = this.fadeAmount;
        this.context.drawImage(canvas, 0, 0);
        this.context.globalAlpha = 1;

        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const diameterWidth = sizeWidthStart + sizeWidthDiff * progress;
        const diameterHeight = sizeHeightStart + sizeHeightDiff * progress;
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
          this.canvas.width,
          this.canvas.height,
          diameterWidth / -2,
          diameterHeight / -2,
          diameterWidth,
          diameterHeight
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
