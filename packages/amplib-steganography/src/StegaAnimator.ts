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
  rotationMode?: "2d" | "3d";
  shape?: "circle" | "square" | "implicit";
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
  rotationMode: "2d" | "3d";
  shape: "circle" | "square" | "implicit";

  constructor({
    source,
    resolution,
    fadeAmount = 0,
    rotationMode = "3d",
    shape = "implicit",
  }: StegaAnimatorParams) {
    this.resolution = resolution;
    this.rotationMode = rotationMode;
    this.shape = shape;
    const { width, height } = dimensionsFromSource(source);
    this.sourceAspectRatio = width / height;

    let targetAspectRatio = this.sourceAspectRatio;
    if (shape === "square" || shape === "circle") {
      targetAspectRatio = 1;
    }

    const newWidth = Math.ceil(resolution);
    const newHeight = Math.ceil(resolution / targetAspectRatio);
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
    // 1. Snapshot current state for trail
    const { canvas: trailCanvas, context: trailContext } =
      createCanvasAndContext(this.canvas.width, this.canvas.height);
    trailContext.drawImage(this.canvas, 0, 0);

    // 2. Clear main canvas
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 3. Draw trail
    this.context.globalAlpha = this.fadeAmount;
    this.context.drawImage(trailCanvas, 0, 0);
    this.context.globalAlpha = 1;

    // 4. Prepare new frame content
    const diameterWidth = this.canvas.width * transform.scale;
    const diameterHeight = this.canvas.height * transform.scale;
    const rotation = transform.rotation;
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;

    // Use offscreen canvas for the new frame to apply clipping cleanly
    const { canvas: frameCanvas, context: frameContext } =
      createCanvasAndContext(this.canvas.width, this.canvas.height);

    if (this.shape === "circle") {
      frameContext.beginPath();
      frameContext.arc(centerX, centerY, diameterWidth / 2, 0, Math.PI * 2);
      frameContext.clip();
    }

    if (this.rotationMode === "2d") {
      frameContext.translate(centerX, centerY);
      frameContext.rotate(rotation);
      frameContext.translate(-centerX, -centerY);
      frameContext.drawImage(
        this.source,
        centerX - diameterWidth / 2,
        centerY - diameterHeight / 2,
        diameterWidth,
        diameterHeight
      );
    } else {
      const rotationOffset = Math.PI * 0.5 + (rotation % Math.PI) * 2;
      const axisX = Math.cos(rotation + rotationOffset);
      const axisY = Math.sin(rotation + rotationOffset);
      const axisLength = Math.hypot(axisX, axisY);
      const normalizedX = axisX / axisLength;
      const normalizedY = axisY / axisLength;
      const xScaling = Math.cos(rotation);

      frameContext.setTransform({
        a: normalizedY * xScaling,
        b: -normalizedX * xScaling,
        c: normalizedX,
        d: normalizedY,
        e: centerX,
        f: centerY,
      });

      frameContext.drawImage(
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

    // 5. Composite offscreen canvas to main canvas
    this.context.drawImage(frameCanvas, 0, 0);
  }

  animate({
    from,
    to,
    rate,
    easing = (x: number) => x,
  }: StegaAnimatorAnimateParams) {
    return new Promise<HTMLImageElement | HTMLCanvasElement>((resolve) => {
      let position = 0;

      const animate = () => {
        const progress = easing(position);
        const currentScale = from.scale + (to.scale - from.scale) * progress;
        const currentRotation =
          from.rotation + (to.rotation - from.rotation) * progress;

        this.renderFrame({
          scale: currentScale,
          rotation: currentRotation,
          x: 0,
          y: 0,
        });

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
