/**
 * Creating a canvas and context.
 */
export function createCanvasAndContext(
  width?: number,
  height?: number,
  willReadFrequently?: boolean
) {
  const canvas = document.createElement("canvas");
  canvas.width = width || 0;
  canvas.height = height || 0;
  const context = canvas.getContext("2d", {
    colorSpace: "display-p3",
    willReadFrequently,
  }) as CanvasRenderingContext2D;
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
}: {
  source: HTMLImageElement | HTMLCanvasElement;
  messageLength: number;
  minWidth: number;
  minHeight: number;
  aspectRatio?: number;
}) {
  const sourceWidth = imageOrCanvasIsImage(source)
    ? source.naturalWidth
    : source.width;
  const sourceHeight = imageOrCanvasIsImage(source)
    ? source.naturalHeight
    : source.height;
  const sourceAspectRatio = sourceHeight / sourceWidth;
  const sourceTransparency = getTransparencyRatio({
    source,
    sourceWidth,
    sourceHeight,
  });

  const sourceDimensions = canvasWidthAndHeight({
    minWidth,
    minHeight,
    minPixelCount:
      2 * Math.ceil(messageLength / 3) * (1 / (1 - sourceTransparency)),
    aspectRatio: aspectRatio || sourceAspectRatio,
  });

  const { canvas, context } = createCanvasAndContext(
    sourceDimensions.width,
    sourceDimensions.height
  );
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const preciseTransparency = getTransparencyRatio({
    source: canvas,
    sourceHeight: canvas.height,
    sourceWidth: canvas.width,
  });
  const preciseDimensions = canvasWidthAndHeight({
    minWidth,
    minHeight,
    minPixelCount:
      2 * Math.ceil(messageLength / 3) * (1 / (1 - preciseTransparency)),
    aspectRatio: aspectRatio || sourceAspectRatio,
  });
  canvas.height = preciseDimensions.height;
  canvas.width = preciseDimensions.width;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  console.log(sourceTransparency, preciseTransparency);
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
}: {
  minWidth: number;
  minHeight: number;
  minPixelCount: number;
  /**
   * Expressed as height / width
   */
  aspectRatio: number;
}) {
  let width = Math.max(minWidth, Math.sqrt(minPixelCount / aspectRatio));
  let height = width * aspectRatio;

  if (height < minHeight) {
    height = minHeight;
    width = height / aspectRatio;
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

type ImageType = "image/png" | "image/jpg";

export function createImageDropReader({
  element,
  onSuccess,
  onFailure,
  onDragEnter,
  onDragLeave,
  onDrop,
  types = ["image/png"],
}: {
  element: HTMLElement;
  onSuccess: (image: HTMLImageElement) => void;
  onFailure?: (message: string) => void;
  onDragEnter?: () => void;
  onDragLeave?: () => void;
  onDrop?: () => void;
  types?: ImageType[];
}) {
  element.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  element.addEventListener("dragenter", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (onDragEnter) onDragEnter();
  });
  element.addEventListener("dragleave", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (onDragLeave) onDragLeave();
  });

  element.addEventListener("drop", (event) => {
    event.preventDefault();

    if (onDrop) onDrop();

    const fileInput = document.createElement("input");
    fileInput.accept = types.join(", ");
    fileInput.type = "file";

    const files = event.dataTransfer?.files;
    if (files?.length) {
      fileInput.files = files;
    }
    const file = fileInput.files?.item(0);
    handleImageFile({ file, onSuccess, onFailure, types });
  });
}

export function createImageFileReader({
  element,
  onSuccess,
  onFailure,
  types = ["image/png"],
}: {
  element: HTMLInputElement;
  onSuccess: (image: HTMLImageElement) => void;
  onFailure?: (message: string) => void;
  types?: ImageType[];
}) {
  element.accept = types.join(", ");
  element.type = "file";
  element.addEventListener("change", (event) => {
    event.preventDefault();
    const file = element.files?.item(0);
    handleImageFile({ file, onSuccess, onFailure, types });
  });
}

function handleImageFile({ file, onSuccess, onFailure, types }) {
  if (file && types.includes(file.type as ImageType)) {
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
  } else if (onFailure) {
    onFailure(
      file
        ? `File ${file.name} (${file.type}) is wrong type`
        : "Could not find a file"
    );
  }
}

/**
 * Draw an image on a canvas with "center" position and "cover" fit.
 */
export function fillCanvasWithImage(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | HTMLCanvasElement
) {
  const imageRatio = image.height / image.width;
  const canvasRatio = canvas.height / canvas.width;
  if (imageRatio > canvasRatio) {
    const h = canvas.width * imageRatio;
    context.drawImage(image, 0, (canvas.height - h) / 2, canvas.width, h);
  } else {
    const w = (canvas.width * canvasRatio) / imageRatio;
    context.drawImage(image, (canvas.width - w) / 2, 0, w, canvas.height);
  }
}

/**
 * Whether or not an image or canvas is an image.
 */
export function imageOrCanvasIsImage(
  imageOrCanvas: HTMLImageElement | HTMLCanvasElement
): imageOrCanvas is HTMLImageElement {
  return imageOrCanvas.tagName === "IMAGE";
}

export async function loadAudioBufferFromAudioUrl({
  url,
  audioContext,
  sampleRate,
}: {
  url: string;
  audioContext: AudioContext;
  sampleRate: number;
}) {
  const response = await fetch(url);
  const audioData = await response.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(audioData);
  // Resample the audio to sample rate
  const resampledBuffer = await resampleAudioBuffer(audioBuffer, sampleRate);
  return resampledBuffer.getChannelData(0);
}

/**
 * Generates a function that returns information about how to handle an image data index
 */
export function skippedAndIndicesFromIndexGenerator(width: number) {
  const widthIsOdd = width % 2 !== 0;
  return (i: number, data: Uint8ClampedArray) => {
    const pxIndex = Math.floor(i / 4);
    const row = Math.floor(pxIndex / width);
    const evenRowCheck = widthIsOdd || row % 2 === 0;
    const nextI = i + 4;
    const isOpaque = data[pxIndex * 4 + 3] === 255;
    const isOpaqueNext = data[pxIndex * 4 + 7] === 255;
    // Skipped pixels contain the saved data, and are set in a prior loop.
    const sourceIndex = evenRowCheck ? nextI : i;
    const encodedIndex = evenRowCheck ? i : nextI;
    // Skipping pixels set in prior loop or last col for odd width images
    const isSkipped =
      !isOpaque || !isOpaqueNext || pxIndex % 2 !== 0 || (i + 1) % 4 === 0;

    return {
      isSkipped,
      encodedIndex,
      sourceIndex,
    };
  };
}

/**
 * Load an image by url.
 */
export function loadImageFromImageUrl(
  imageUrl: string
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = imageUrl;
    image.onload = (_) => resolve(image);
    image.onerror = reject;
  });
}

export async function playDecodedAudio({
  decodedAudio,
  audioContext,
  sampleRate,
}: {
  decodedAudio: Float32Array;
  audioContext: AudioContext;
  sampleRate: number;
}) {
  // Resume the AudioContext if it was suspended
  await audioContext.resume();
  // Create an AudioBuffer with 1 channel, length of decoded audio, and sample rate
  const decodedBuffer = audioContext.createBuffer(
    1,
    decodedAudio.length,
    sampleRate
  );
  // Copy the decoded audio data into the buffer
  decodedBuffer.getChannelData(0).set(decodedAudio);
  // Create a BufferSourceNode
  const source = audioContext.createBufferSource();
  source.buffer = decodedBuffer;
  // Connect the source to the AudioContext's destination (speakers)
  source.connect(audioContext.destination);
  // Start playing the audio
  source.start();
}

async function resampleAudioBuffer(
  audioBuffer: AudioBuffer,
  sampleRate: number
) {
  const offlineCtx = new OfflineAudioContext(
    1,
    audioBuffer.duration * sampleRate,
    sampleRate
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start();
  return offlineCtx.startRendering();
}
