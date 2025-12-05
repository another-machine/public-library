import { Stega64Encoding } from "./Stega64";
import {
  StegaCassetteBitDepth,
  StegaCassetteChannels,
  StegaCassetteEncoding,
} from "./StegaCassette";
import {
  createCanvasAndContext,
  dimensionsFromSource,
  getContext,
} from "./utilities";

export const METADATA_VERSION = 1;
export const PATTERN_LENGTH = 32;

export enum StegaContentType {
  AUDIO = 0,
  STRING = 1,
  ROBUST = 2,
  MUSIC = 3,
  BINARY = 4,
  KEY = 5,
}

export interface StegaMetadataAudio {
  type: StegaContentType.AUDIO;
  sampleRate: number;
  bitDepth: StegaCassetteBitDepth;
  channels: StegaCassetteChannels;
  encoding: StegaCassetteEncoding;
  borderWidth: number;
}

export interface StegaMetadataMusic extends Omit<StegaMetadataAudio, "type"> {
  type: StegaContentType.MUSIC;
  bpm: number;
  semitones: number;
}

// IMPORTANT: The order of these is important. The index association is already encoded into images.
const metadataAudioBitDepth: StegaMetadataAudio["bitDepth"][] = [8, 16, 24];
const metadataAudioChannels: StegaMetadataAudio["channels"][] = [1, 2];
const metadataAudioEncoding: StegaMetadataAudio["encoding"][] = [
  "additive",
  "subtractive",
  "difference",
  "noise",
  "additive-columns",
  "subtractive-columns",
  "difference-columns",
  "noise-columns",
  "additive-rows",
  "subtractive-rows",
  "difference-rows",
  "noise-rows",
  "additive-quarters",
  "subtractive-quarters",
  "difference-quarters",
  "noise-quarters",
  "bitshift",
  "bitshift-columns",
  "bitshift-rows",
  "bitshift-quarters",
  "solid",
  "solid-columns",
  "solid-rows",
  "solid-quarters",
];

export interface StegaMetadataString {
  type: StegaContentType.STRING;
  messageCount: number;
  encoding: Stega64Encoding;
  borderWidth: number;
}

const metadataStringEncoding: StegaMetadataString["encoding"][] = [
  "raw",
  "base64",
];

export interface StegaMetadataRobust {
  type: StegaContentType.ROBUST;
  redundancyLevel: number;
  messageCount: number;
  blockSize: 2 | 4;
  encoding: "hex" | "base16";
}

const metadataRobustBlockSize: StegaMetadataRobust["blockSize"][] = [2, 4];
const metadataRobustEncoding: StegaMetadataRobust["encoding"][] = [
  "hex",
  "base16",
];

/**
 * Binary metadata for arbitrary file storage.
 * sessionId of 0 indicates "keyless" mode (decodes from black pixels).
 * Non-zero sessionId indicates sidecar key mode.
 */
export interface StegaMetadataBinary {
  type: StegaContentType.BINARY;
  dataLength: number; // Total payload length including mimeType and null terminator
  borderWidth: number;
  sessionId: number; // 0 = keyless, non-zero = requires matching key
}

/**
 * Key metadata for sidecar key images.
 * sessionId must match the corresponding BINARY image's sessionId.
 */
export interface StegaMetadataKey {
  type: StegaContentType.KEY;
  borderWidth: number;
  sessionId: number;
}

export type StegaMetadata =
  | StegaMetadataAudio
  | StegaMetadataString
  | StegaMetadataRobust
  | StegaMetadataMusic
  | StegaMetadataBinary
  | StegaMetadataKey;

function convertMetadataToNumericSequence(metadata: StegaMetadata): number[] {
  const sequence: number[] = [];

  // First byte: version and type
  sequence.push((METADATA_VERSION << 4) | metadata.type);

  switch (metadata.type) {
    case StegaContentType.AUDIO:
    case StegaContentType.MUSIC: {
      // Sample rate (3 bytes)
      sequence.push((metadata.sampleRate >> 16) & 0xff);
      sequence.push((metadata.sampleRate >> 8) & 0xff);
      sequence.push(metadata.sampleRate & 0xff);
      // Bit depth (1 byte)
      sequence.push(metadataAudioBitDepth.indexOf(metadata.bitDepth));
      // Channels (1 byte)
      // IMPORTANT: The ordewr of these is important. The index association is already encoded into images.
      sequence.push(metadataAudioChannels.indexOf(metadata.channels));
      // Encoding (1 byte)
      sequence.push(metadataAudioEncoding.indexOf(metadata.encoding));
      // Border width (2 bytes)
      sequence.push((metadata.borderWidth >> 8) & 0xff);
      sequence.push(metadata.borderWidth & 0xff);

      if (metadata.type === StegaContentType.MUSIC) {
        const bpmInt = Math.floor(metadata.bpm);
        const bpmDec = Math.round((metadata.bpm - bpmInt) * 100);
        // BPM (2 bytes)
        sequence.push((bpmInt >> 8) & 0xff);
        sequence.push(bpmInt & 0xff);
        // Semitones (1 byte)
        sequence.push(metadata.semitones);
        // BPM Decimal (1 byte)
        sequence.push(bpmDec);
      }
      break;
    }

    case StegaContentType.STRING: {
      // Message count (2 bytes)
      sequence.push((metadata.messageCount >> 8) & 0xff);
      sequence.push(metadata.messageCount & 0xff);
      // Encoding (1 byte)
      sequence.push(metadataStringEncoding.indexOf(metadata.encoding));
      // Border width (2 bytes)
      sequence.push((metadata.borderWidth >> 8) & 0xff);
      sequence.push(metadata.borderWidth & 0xff);
      break;
    }

    case StegaContentType.ROBUST: {
      // Redundancy level (1 byte)
      sequence.push(metadata.redundancyLevel);
      // Message count (2 bytes)
      sequence.push((metadata.messageCount >> 8) & 0xff);
      sequence.push(metadata.messageCount & 0xff);
      // Block size (1 byte)
      sequence.push(metadataRobustBlockSize.indexOf(metadata.blockSize));
      // Encoding (1 byte)
      sequence.push(metadataRobustEncoding.indexOf(metadata.encoding));
      break;
    }

    case StegaContentType.BINARY: {
      // Data length (4 bytes)
      sequence.push((metadata.dataLength >> 24) & 0xff);
      sequence.push((metadata.dataLength >> 16) & 0xff);
      sequence.push((metadata.dataLength >> 8) & 0xff);
      sequence.push(metadata.dataLength & 0xff);
      // Border width (2 bytes)
      sequence.push((metadata.borderWidth >> 8) & 0xff);
      sequence.push(metadata.borderWidth & 0xff);
      // Session ID (4 bytes) - 0 means keyless
      sequence.push((metadata.sessionId >> 24) & 0xff);
      sequence.push((metadata.sessionId >> 16) & 0xff);
      sequence.push((metadata.sessionId >> 8) & 0xff);
      sequence.push(metadata.sessionId & 0xff);
      break;
    }

    case StegaContentType.KEY: {
      // Border width (2 bytes)
      sequence.push((metadata.borderWidth >> 8) & 0xff);
      sequence.push(metadata.borderWidth & 0xff);
      // Session ID (4 bytes)
      sequence.push((metadata.sessionId >> 24) & 0xff);
      sequence.push((metadata.sessionId >> 16) & 0xff);
      sequence.push((metadata.sessionId >> 8) & 0xff);
      sequence.push(metadata.sessionId & 0xff);
      break;
    }
  }

  // Pad remaining bytes
  while (sequence.length < PATTERN_LENGTH) {
    sequence.push(0);
  }

  return sequence;
}

function convertNumericSequenceToMetadata(sequence: number[]): StegaMetadata {
  if (sequence.length < PATTERN_LENGTH) {
    throw new Error("Invalid sequence length");
  }

  const version = sequence[0] >> 4;
  if (version > METADATA_VERSION) {
    throw new Error(`Unsupported metadata version: ${version}`);
  }

  const type = sequence[0] & 0x0f;

  switch (type) {
    case StegaContentType.AUDIO:
    case StegaContentType.MUSIC: {
      const sampleRate = (sequence[1] << 16) | (sequence[2] << 8) | sequence[3];
      // IMPORTANT: The ordewr of these is important. The index association is already encoded into images.
      const bitDepth = metadataAudioBitDepth[sequence[4]];
      const channels = metadataAudioChannels[sequence[5]];
      const encoding = metadataAudioEncoding[sequence[6]];
      const borderWidth = (sequence[7] << 8) | sequence[8];

      if (!bitDepth || !channels || !encoding) {
        throw new Error("Invalid audio metadata values");
      }

      if (type === StegaContentType.MUSIC) {
        const bpmInt = (sequence[9] << 8) | sequence[10];
        const semitones = sequence[11];
        const bpmDec = sequence[12];
        const bpm = bpmInt + bpmDec / 100;
        return {
          type: StegaContentType.MUSIC,
          sampleRate,
          bitDepth,
          channels,
          encoding,
          borderWidth,
          bpm,
          semitones,
        };
      }

      return {
        type: StegaContentType.AUDIO,
        sampleRate,
        bitDepth,
        channels,
        encoding,
        borderWidth,
      };
    }

    case StegaContentType.STRING: {
      const messageCount = (sequence[1] << 8) | sequence[2];
      const encoding = metadataStringEncoding[sequence[3]];
      const borderWidth = (sequence[4] << 8) | sequence[5];

      if (!encoding) {
        throw new Error("Invalid string metadata values");
      }

      return {
        type: StegaContentType.STRING,
        messageCount,
        encoding,
        borderWidth,
      };
    }

    case StegaContentType.ROBUST: {
      const redundancyLevel = sequence[1];
      const messageCount = (sequence[2] << 8) | sequence[3];
      const blockSize = metadataRobustBlockSize[sequence[4]];
      const encoding = metadataRobustEncoding[sequence[5]];

      if (!blockSize || !encoding) {
        throw new Error("Invalid robust metadata values");
      }

      return {
        type: StegaContentType.ROBUST,
        redundancyLevel,
        messageCount,
        blockSize,
        encoding,
      };
    }

    case StegaContentType.BINARY: {
      const dataLength =
        (sequence[1] << 24) |
        (sequence[2] << 16) |
        (sequence[3] << 8) |
        sequence[4];
      const borderWidth = (sequence[5] << 8) | sequence[6];
      const sessionId =
        (sequence[7] << 24) |
        (sequence[8] << 16) |
        (sequence[9] << 8) |
        sequence[10];

      return {
        type: StegaContentType.BINARY,
        dataLength,
        borderWidth,
        sessionId,
      };
    }

    case StegaContentType.KEY: {
      const borderWidth = (sequence[1] << 8) | sequence[2];
      const sessionId =
        (sequence[3] << 24) |
        (sequence[4] << 16) |
        (sequence[5] << 8) |
        sequence[6];

      return {
        type: StegaContentType.KEY,
        borderWidth,
        sessionId,
      };
    }

    default:
      throw new Error("Invalid metadata type");
  }
}

/**
 * Adding a row to the bottom of the image with stega metadata
 * encoded in the alpha channel
 */
export function encode({
  source,
  metadata,
}: {
  source: HTMLCanvasElement;
  metadata: StegaMetadata;
}): HTMLCanvasElement {
  /**
   * We assume we have at least a 1px border around the encoded content
   * otherwise this data will be overridden.
   */
  const { width, height } = source;

  /**
   * Getting source image data. We have to be careful not to lose data in transfer.
   */
  const sourceContext = getContext(source);
  const sourceData = sourceContext.getImageData(0, 0, width, height);

  /**
   * Setting up a new canvas and context with extra line for metadata
   */
  const { canvas, context } = createCanvasAndContext(
    source.width,
    source.height
  );

  /**
   * Copy new data over.
   */
  const newImageData = context.createImageData(width, height);
  newImageData.data.set(sourceData.data);
  context.putImageData(newImageData, 0, 0);

  /**
   * Get the writeable pixels
   */
  const pixels = writeablePixelsForDimensions(width, height);

  /**
   * Get the metadata and set it alternating across the pixels
   */
  const metadataImageData = context.getImageData(0, 0, width, height);
  const sequence = convertMetadataToNumericSequence(metadata);
  pixels.forEach(([pixelX, pixelY], index) => {
    const pixelIndex = (pixelX + pixelY * width) * 4;
    const sequenceValue = sequence[index % PATTERN_LENGTH];
    metadataImageData.data[pixelIndex + 0] = sequenceValue;
    metadataImageData.data[pixelIndex + 1] = sequenceValue;
    metadataImageData.data[pixelIndex + 2] = sequenceValue;
    metadataImageData.data[pixelIndex + 3] = 255;
  });

  /**
   * Write the modified image data to the canvas
   */
  context.putImageData(metadataImageData, 0, 0);

  return canvas;
}

export function decode({
  source,
}: {
  source: HTMLCanvasElement | HTMLImageElement;
}): StegaMetadata | null {
  const { width, height } = dimensionsFromSource(source);
  const { canvas, context } = createCanvasAndContext(width, height);
  context.drawImage(source, 0, 0);

  const pixels = writeablePixelsForDimensions(width, height);
  const metadataImageData = context.getImageData(0, 0, width, height);
  const sequences: number[] = [];

  pixels.forEach(([pixelX, pixelY], index) => {
    const pixelIndex = (pixelX + pixelY * width) * 4;
    sequences.push(metadataImageData.data[pixelIndex + 0]);
  });

  const sequence = sequences.slice(0, PATTERN_LENGTH);

  try {
    return convertNumericSequenceToMetadata(sequence);
  } catch (error) {
    return null;
  }
}

/**
 * Given a width and a height, get all pixels we write and read metadata from in order
 */
function writeablePixelsForDimensions(width: number, height: number) {
  const pixelsTopRight: [number, number][] = [];
  const pixelsBottomLeft: [number, number][] = [];
  for (let x = 0; x < width; x++) {
    pixelsTopRight.push([x, 0]);
    if (x) {
      pixelsBottomLeft.push([width - x - 1, height - 1]);
    }
  }
  for (let y = 1; y < height; y++) {
    pixelsTopRight.push([width - 1, y]);
    if (y < height - 1) {
      pixelsBottomLeft.push([0, height - y - 1]);
    }
  }

  return pixelsTopRight.concat(pixelsBottomLeft);
}
