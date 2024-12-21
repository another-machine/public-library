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
      2 * Math.ceil(messageLength / 3) * (1 / (1 - preciseTransparency)),
    aspectRatio: targetAspectRatio,
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
}: {
  minWidth: number;
  minHeight: number;
  minPixelCount: number;
  /**
   * Expressed as width / height
   */
  aspectRatio: number;
}) {
  let width = Math.max(minWidth, Math.sqrt(minPixelCount * aspectRatio));
  let height = width / aspectRatio;

  if (height < minHeight) {
    height = minHeight;
    width = height * aspectRatio;
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
    console.log("IN THE CONDITIONAL");
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

export async function loadAudioBuffersFromAudioUrl({
  url,
  audioContext,
  stereo = false,
  sampleRate = audioContext.sampleRate,
}: {
  url: string;
  stereo: boolean;
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
    stereo
  );
  return stereo
    ? [resampledBuffer.getChannelData(0), resampledBuffer.getChannelData(1)]
    : [resampledBuffer.getChannelData(0)];
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
  stereo: boolean
) {
  const offlineCtx = new OfflineAudioContext(
    stereo ? 2 : 1,
    audioBuffer.duration * sampleRate,
    sampleRate
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start();
  return offlineCtx.startRendering();
}
