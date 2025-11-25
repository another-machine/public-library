import { StegaCassetteChannels } from "./StegaCassette";

export function getContext(canvas: HTMLCanvasElement) {
  return canvas.getContext("2d", {
    colorSpace: "display-p3",
    willReadFrequently: true,
  })!;
}

/**
 * Creating a canvas and context.
 */
export function createCanvasAndContext(width?: number, height?: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width || 0;
  canvas.height = height || 0;
  const context = getContext(canvas);
  context.imageSmoothingEnabled = false;
  return { canvas, context };
}

/**
 * Drawing a source at a size considering minimum pixel count, width, and height, as well as an aspect ratio.
 */

export function createCanvasAndContextForImageWithMinimums({
  source,
  messageLength,
  minWidth,
  minHeight,
  aspectRatio,
  borderWidth = 0,
  internalBorderMode = "none",
}: {
  source: HTMLImageElement | HTMLCanvasElement;
  messageLength: number;
  minWidth: number;
  minHeight: number;
  aspectRatio?: number;
  borderWidth?: number;
  internalBorderMode?: "none" | "vertical" | "horizontal" | "cross";
}) {
  const { width: sourceWidth, height: sourceHeight } =
    dimensionsFromSource(source);

  // Use provided aspect ratio, or if undefined use the source image's natural ratio
  const targetAspectRatio =
    aspectRatio === undefined ? sourceWidth / sourceHeight : aspectRatio;

  const sourceTransparency = getTransparencyRatio({
    source,
    sourceWidth,
    sourceHeight,
  });

  // Get canvas dimensions that respect the target aspect ratio
  const sourceDimensions = canvasWidthAndHeight({
    minWidth,
    minHeight,
    minPixelCount:
      2 * Math.ceil(messageLength / 3) * (1 / (1 - sourceTransparency)),
    aspectRatio: targetAspectRatio,
    borderWidth,
    internalBorderMode,
  });

  const { canvas, context } = createCanvasAndContext(
    sourceDimensions.width,
    sourceDimensions.height
  );

  // Calculate dimensions for background-size: cover behavior
  const scale = Math.max(
    canvas.width / sourceWidth,
    canvas.height / sourceHeight
  );

  const scaledWidth = sourceWidth * scale;
  const scaledHeight = sourceHeight * scale;

  // Center the image (background-position: center)
  const x = (canvas.width - scaledWidth) / 2;
  const y = (canvas.height - scaledHeight) / 2;

  context.drawImage(source, x, y, scaledWidth, scaledHeight);

  const preciseTransparency = getTransparencyRatio({
    source: canvas,
    sourceHeight: canvas.height,
    sourceWidth: canvas.width,
  });

  const preciseDimensions = canvasWidthAndHeight({
    minWidth,
    minHeight,
    minPixelCount:
      2 *
      Math.ceil(Math.ceil(messageLength / 3) * (1 / (1 - preciseTransparency))),
    aspectRatio: targetAspectRatio,
    borderWidth,
    internalBorderMode,
  });

  canvas.width = preciseDimensions.width;
  canvas.height = preciseDimensions.height;

  // Apply the same cover/center behavior to final dimensions
  const finalScale = Math.max(
    canvas.width / sourceWidth,
    canvas.height / sourceHeight
  );

  const finalScaledWidth = sourceWidth * finalScale;
  const finalScaledHeight = sourceHeight * finalScale;

  const finalX = (canvas.width - finalScaledWidth) / 2;
  const finalY = (canvas.height - finalScaledHeight) / 2;

  context.drawImage(
    source,
    finalX,
    finalY,
    finalScaledWidth,
    finalScaledHeight
  );

  return { canvas, context };
}

/**
 * Getting a precise width and height filling minimum requirements.
 */
function canvasWidthAndHeight({
  minWidth,
  minHeight,
  minPixelCount,
  aspectRatio,
  borderWidth = 0,
  internalBorderMode = "none",
}: {
  minWidth: number;
  minHeight: number;
  minPixelCount: number;
  aspectRatio: number;
  borderWidth?: number;
  internalBorderMode?: "none" | "vertical" | "horizontal" | "cross";
}) {
  const SAFETY_FACTOR = 1.0;
  const targetArea = minPixelCount * SAFETY_FACTOR;

  let widthBorderMultiplier = 2;
  let heightBorderMultiplier = 2;

  if (internalBorderMode === "vertical") {
    widthBorderMultiplier = 3;
  } else if (internalBorderMode === "horizontal") {
    heightBorderMultiplier = 3;
  } else if (internalBorderMode === "cross") {
    widthBorderMultiplier = 3;
    heightBorderMultiplier = 3;
  }

  const widthLoss = widthBorderMultiplier * borderWidth;
  const heightLoss = heightBorderMultiplier * borderWidth;

  const a = aspectRatio;
  const b = -(heightLoss * aspectRatio + widthLoss);
  const c = widthLoss * heightLoss - targetArea;

  const discriminant = b * b - 4 * a * c;
  let height = (-b + Math.sqrt(discriminant)) / (2 * a);
  let width = height * aspectRatio;

  // Verify and adjust if needed
  const getUsableArea = (w: number, h: number) =>
    (w - widthLoss) * (h - heightLoss);

  // Adjust for minimum dimensions
  height = Math.max(height, minHeight);
  width = height * aspectRatio;
  width = Math.max(width, minWidth);
  height = width / aspectRatio;

  // Basically when we add a border, that disqualifies a subset of pixels at the end of the x axis since their next pixel is in the border.
  // We want to increase min pixel count conditionally based on our height.
  const heightMinPixelFactor = 1.5;
  if (borderWidth > 0) {
    minPixelCount += height * heightMinPixelFactor;
  }

  // Double-check usable area meets minimum
  while (getUsableArea(width, height) < minPixelCount) {
    // Decreasing minPixelCount by old height
    minPixelCount -= height * heightMinPixelFactor;
    // Increasing height
    height += 0.1;
    // Setting width
    width = height * aspectRatio;
    // Increasing minPixelCount by new height
    minPixelCount += height * heightMinPixelFactor;
  }

  return {
    width: Math.ceil(width),
    height: Math.ceil(height),
  };
}

/**
 * Calculate what percentage of an image is transparent
 */
function getTransparencyRatio({
  source,
  sourceHeight,
  sourceWidth,
}: {
  source: HTMLImageElement | HTMLCanvasElement;
  sourceWidth: number;
  sourceHeight: number;
}) {
  const { canvas: sourceCanvas, context: sourceContext } =
    createCanvasAndContext(sourceWidth, sourceHeight);
  fillCanvasWithImage(sourceCanvas, sourceContext, source);
  const sourceImageData = sourceContext.getImageData(
    0,
    0,
    sourceWidth,
    sourceHeight
  );

  let transparent = 0;
  // Since we only use every other pixel, we need to be accurate here.
  // transparent pixels / total pixels can be highly inaccurate
  for (let i = 0; i < sourceImageData.data.length; i += 8) {
    const pxIndex = Math.floor(i / 4);
    const isOpaque = sourceImageData.data[pxIndex * 4 + 3] === 255;
    const isOpaqueNext = sourceImageData.data[pxIndex * 4 + 7] === 255;
    if (!isOpaque || !isOpaqueNext) {
      transparent += 2;
    }
  }
  return transparent / (sourceWidth * sourceHeight);
}

type AudioType = "audio/*" | "audio/mp3" | "audio/wav";
type ImageType = "image/*" | "image/png" | "image/jpg" | "image/jpeg";

export function createDropReader({
  element,
  onSuccess,
  onFailure,
  onDragEnter,
  onDragLeave,
  onDrop,
  types = ["audio/*", "image/*"],
}: {
  element: HTMLElement;
  onSuccess: (params: {
    audioElements: HTMLAudioElement[];
    imageElements: HTMLImageElement[];
  }) => void;
  onFailure?: (message: string) => void;
  onDragEnter?: () => void;
  onDragLeave?: () => void;
  onDrop?: () => void;
  types?: (AudioType | ImageType)[];
}) {
  element.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  if (onDragEnter) {
    element.addEventListener(
      "dragenter",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        onDragEnter();
      },
      false
    );
  }
  if (onDragLeave) {
    element.addEventListener(
      "dragleave",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        onDragLeave();
      },
      false
    );
  }

  element.addEventListener("drop", (event) => {
    event.preventDefault();
    if (onDrop) {
      onDrop();
    }

    const fileInput = document.createElement("input");
    fileInput.accept = types.join(", ");
    fileInput.type = "file";

    const files = event.dataTransfer?.files;
    if (!files || !files?.length) {
      if (onFailure) {
        return onFailure("No valid files provided");
      }
      return;
    }

    fileInput.files = files;
    const audioElements: HTMLAudioElement[] = [];
    const imageElements: HTMLImageElement[] = [];
    const totalLength = files.length;
    const checkSuccess = () => {
      if (imageElements.length + audioElements.length === totalLength) {
        onSuccess({ audioElements, imageElements });
      }
    };
    Array.from(fileInput.files || []).forEach((file) => {
      if (file) {
        if (file.type.match("image")) {
          handleImageFile({
            file,
            onSuccess: (element) => {
              imageElements.push(element);
              checkSuccess();
            },
            onFailure,
          });
        } else {
          handleAudioFile({
            file,
            onSuccess: (element) => {
              audioElements.push(element);
              checkSuccess();
            },
            onFailure,
          });
        }
      }
    });
  });
}

export function createFileReader({
  element,
  onSuccess,
  onFailure,
  types = ["audio/*", "image/*"],
}: {
  element: HTMLInputElement;
  onSuccess: (image: HTMLAudioElement | HTMLImageElement) => void;
  onFailure?: (message: string) => void;
  types?: (AudioType | ImageType)[];
}) {
  element.accept = types.join(", ");
  element.type = "file";
  element.addEventListener("change", (event) => {
    event.preventDefault();
    const file = element.files?.item(0);
    if (file) {
      if (file.type.match("image")) {
        handleImageFile({ file, onSuccess, onFailure });
      } else {
        handleAudioFile({ file, onSuccess, onFailure });
      }
    }
  });
}

function handleAudioFile({
  file,
  onSuccess,
  onFailure,
}: {
  file: File;
  onSuccess: (audio: HTMLAudioElement) => void;
  onFailure?: (message: string) => void;
}) {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onloadend = (e) => {
    const preview = document.createElement("audio");
    preview.controls = true;
    if (e.target?.result) {
      preview.onloadedmetadata = () => onSuccess(preview);
      if (onFailure)
        preview.onerror = () =>
          onFailure(`Could not load audio for ${file.name}`);
      preview.src = e.target.result.toString();
    }
  };
}

function handleImageFile({
  file,
  onSuccess,
  onFailure,
}: {
  file: File;
  onSuccess: (image: HTMLImageElement) => void;
  onFailure?: (message: string) => void;
}) {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onloadend = (e) => {
    const preview = document.createElement("img");
    if (e.target?.result) {
      preview.onload = () => onSuccess(preview);
      if (onFailure)
        preview.onerror = () =>
          onFailure(`Could not load image for ${file.name}`);
      preview.src = e.target.result.toString();
    }
  };
  if (onFailure)
    reader.onerror = () => onFailure(`Could not load file ${file.name}`);
}

/**
 * Draw an image on a canvas with "center" position and "cover" fit.
 */
export function fillCanvasWithImage(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLCanvasElement
) {
  const { width, height } = dimensionsFromSource(source);
  const sourceRatio = height / width;
  const canvasRatio = canvas.height / canvas.width;
  if (sourceRatio > canvasRatio) {
    const h = canvas.width * sourceRatio;
    context.drawImage(source, 0, (canvas.height - h) / 2, canvas.width, h);
  } else {
    const w = (canvas.width * canvasRatio) / sourceRatio;
    context.drawImage(source, (canvas.width - w) / 2, 0, w, canvas.height);
  }
}

/**
 * Get dimensions from an image or canvas element.
 */
export function dimensionsFromSource(
  source: HTMLImageElement | HTMLCanvasElement
) {
  const isImage = imageOrCanvasIsImage(source);
  const width = isImage ? source.naturalWidth : source.width;
  const height = isImage ? source.naturalHeight : source.height;
  return { width, height };
}

/**
 * Whether or not an image or canvas is an image.
 */
export function imageOrCanvasIsImage(
  imageOrCanvas: HTMLImageElement | HTMLCanvasElement
): imageOrCanvas is HTMLImageElement {
  return imageOrCanvas.tagName === "IMAGE";
}

export async function loadAudioBuffersFromAudioUrl({
  url,
  audioContext,
  channels = 1,
  sampleRate = audioContext.sampleRate,
}: {
  url: string;
  channels: StegaCassetteChannels;
  audioContext: AudioContext;
  sampleRate?: number;
}) {
  const response = await fetch(url);
  const audioData = await response.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(audioData);
  // Resample the audio to sample rate
  const resampledBuffer = await resampleAudioBuffer(
    audioBuffer,
    sampleRate,
    channels
  );
  return channels === 2
    ? [resampledBuffer.getChannelData(0), resampledBuffer.getChannelData(1)]
    : [resampledBuffer.getChannelData(0)];
}

/**
 * Generates a function that returns information about how to handle an image data index
 */
export function skippedAndIndicesFromIndexGenerator(
  width: number,
  height: number,
  borderWidth: number
) {
  const widthIsOdd = (width - borderWidth * 2) % 2 !== 0;

  return (i: number, data: Uint8ClampedArray) => {
    const pxIndex = Math.floor(i / 4);
    const y = Math.floor(pxIndex / width);
    const x = pxIndex % width;

    const evenRowCheck = widthIsOdd || y % 2 === 0;
    const nextI = i + 4;
    const isOpaque = data[pxIndex * 4 + 3] === 255;
    const isOpaqueNext = data[pxIndex * 4 + 7] === 255;

    const isBorder =
      y < borderWidth ||
      y >= height - borderWidth ||
      x < borderWidth ||
      x >= width - borderWidth;
    const isBorderNext = x >= width - borderWidth - 1;

    // Skipped pixels contain the saved data, and are set in a prior loop.
    const sourceIndex = evenRowCheck ? nextI : i;
    const encodedIndex = evenRowCheck ? i : nextI;

    const isSkipped =
      isBorder ||
      isBorderNext ||
      !isOpaque ||
      !isOpaqueNext ||
      pxIndex % 2 !== 0 ||
      (i + 1) % 4 === 0;

    const pxIndexNext = Math.floor((i + 8) / 4);
    const yNext = Math.floor(pxIndexNext / width);
    const evenRowCheckNext = widthIsOdd || yNext % 2 === 0;
    const nextINext = i + 12;

    const sourceIndexNext = evenRowCheckNext ? nextINext : i + 8;
    const encodedIndexNext = evenRowCheckNext ? i + 8 : nextINext;

    return {
      isSkipped,
      encodedIndex,
      sourceIndex,
      encodedIndexNext,
      sourceIndexNext,
    };
  };
}

/**
 * Load an image by url.
 */
export function loadImageFromImageUrl({
  url,
}: {
  url: string;
}): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = url;
    image.onload = (_) => resolve(image);
    image.onerror = reject;
  });
}

/**
 * Playback an array of audio buffers (1 = mono, 2 = L/R stereo)
 */
export async function playDecodedAudioBuffers({
  audioBuffers,
  audioContext,
  sampleRate = audioContext.sampleRate,
}: {
  audioBuffers: Float32Array[];
  audioContext: AudioContext;
  sampleRate?: number;
}) {
  await audioContext.resume();

  const maxLength = Math.max(...audioBuffers.map((buffer) => buffer.length));

  const decodedBuffer = audioContext.createBuffer(
    audioBuffers.length,
    maxLength,
    sampleRate
  );

  audioBuffers.forEach((audioBuffer, index) => {
    decodedBuffer.getChannelData(index).set(audioBuffer);
  });

  const source = audioContext.createBufferSource();
  source.buffer = decodedBuffer;

  source.connect(audioContext.destination);

  source.start();
  return source;
}

async function resampleAudioBuffer(
  audioBuffer: AudioBuffer,
  sampleRate: number,
  channels: StegaCassetteChannels
) {
  const offlineCtx = new OfflineAudioContext(
    channels,
    audioBuffer.duration * sampleRate,
    sampleRate
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start();
  return offlineCtx.startRendering();
}
