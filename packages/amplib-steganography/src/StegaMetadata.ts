import { Stega64Encoding } from "./Stega64.ts";
import {
  StegaCassetteBitDepth,
  StegaCassetteChannels,
  StegaCassetteEncoding,
} from "./StegaCassette.ts";
import { createCanvasAndContext, dimensionsFromSource } from "./utilities.ts";

export const METADATA_VERSION = 1;
export const PATTERN_LENGTH = 16;
const METADATA_ALPHA = 250;

export enum StegaContentType {
  AUDIO = 0,
  STRING = 1,
  ROBUST = 2,
}

export interface StegaMetadataAudio {
  type: StegaContentType.AUDIO;
  sampleRate: number;
  bitDepth: StegaCassetteBitDepth;
  channels: StegaCassetteChannels;
  encoding: StegaCassetteEncoding;
}

const metadataAudioBitDepth: StegaMetadataAudio["bitDepth"][] = [8, 16, 24];
const metadataAudioChannels: StegaMetadataAudio["channels"][] = [1, 2];
const metadataAudioEncoding: StegaMetadataAudio["encoding"][] = [
  "additive",
  "midpoint",
];

export interface StegaMetadataString {
  type: StegaContentType.STRING;
  messageCount: number;
  encoding: Stega64Encoding;
}

const metadataStringEncoding: StegaMetadataString["encoding"][] = [
  "none",
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

export type StegaMetadata =
  | StegaMetadataAudio
  | StegaMetadataString
  | StegaMetadataRobust;

function convertMetadataToNumericSequence(metadata: StegaMetadata): number[] {
  const sequence: number[] = [];

  // First byte: version and type
  sequence.push((METADATA_VERSION << 4) | metadata.type);

  switch (metadata.type) {
    case StegaContentType.AUDIO: {
      // Sample rate (3 bytes)
      sequence.push((metadata.sampleRate >> 16) & 0xff);
      sequence.push((metadata.sampleRate >> 8) & 0xff);
      sequence.push(metadata.sampleRate & 0xff);
      // Bit depth (1 byte)
      sequence.push(metadataAudioBitDepth.indexOf(metadata.bitDepth));
      // Channels (1 byte)
      sequence.push(metadataAudioChannels.indexOf(metadata.channels));
      // Encoding (1 byte)
      sequence.push(metadataAudioEncoding.indexOf(metadata.encoding));
      break;
    }

    case StegaContentType.STRING: {
      // Message count (2 bytes)
      sequence.push((metadata.messageCount >> 8) & 0xff);
      sequence.push(metadata.messageCount & 0xff);
      // Encoding (1 byte)
      sequence.push(metadataStringEncoding.indexOf(metadata.encoding));
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
  if (version !== METADATA_VERSION) {
    throw new Error("Unsupported metadata version");
  }

  const type = sequence[0] & 0x0f;

  switch (type) {
    case StegaContentType.AUDIO: {
      const sampleRate = (sequence[1] << 16) | (sequence[2] << 8) | sequence[3];
      const bitDepth = metadataAudioBitDepth[sequence[4]];
      const channels = metadataAudioChannels[sequence[5]];
      const encoding = metadataAudioEncoding[sequence[6]];

      if (!bitDepth || !channels || !encoding) {
        throw new Error("Invalid audio metadata values");
      }

      return {
        type: StegaContentType.AUDIO,
        sampleRate,
        bitDepth,
        channels,
        encoding,
      };
    }

    case StegaContentType.STRING: {
      const messageCount = (sequence[1] << 8) | sequence[2];
      const encoding = metadataStringEncoding[sequence[3]];

      if (!encoding) {
        throw new Error("Invalid string metadata values");
      }

      return {
        type: StegaContentType.STRING,
        messageCount,
        encoding,
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
  const { width, height } = source;

  /**
   * Getting source image data. We have to be careful not to lose data in transfer.
   */
  const sourceContext = source.getContext("2d", {
    willReadFrequently: true,
    alpha: true,
  })!;
  const sourceData = sourceContext.getImageData(0, 0, width, height);

  /**
   * Setting up a new canvas and context with extra line for metadata
   */
  const { canvas, context } = createCanvasAndContext();
  canvas.width = source.width;
  canvas.height = source.height + 1;

  /**
   * Copy new data over and also prefill last line with color
   */
  const newImageData = context.createImageData(width, height);
  newImageData.data.set(sourceData.data);
  context.putImageData(newImageData, 0, 1);
  context.putImageData(newImageData, 0, 0);

  /**
   * Get the metadata and set it in the last row's alpha
   */
  const sequence = convertMetadataToNumericSequence(metadata);
  const metadataRow = context.getImageData(0, height, width, 1);
  for (let i = 0; i < PATTERN_LENGTH; i++) {
    const pixelIndex = i * 4;
    metadataRow.data[pixelIndex + 3] = METADATA_ALPHA - sequence[i];
  }
  context.putImageData(metadataRow, 0, height);

  return canvas;
}

export function decode({
  source,
}: {
  source: HTMLCanvasElement | HTMLImageElement;
}): StegaMetadata | null {
  const { width, height } = dimensionsFromSource(source);
  const { canvas, context } = createCanvasAndContext();
  canvas.width = width;
  canvas.height = height;

  context.drawImage(source, 0, 0);
  const imageData = context.getImageData(0, height - 1, PATTERN_LENGTH, 1);
  const rawAlpha = Array.from(imageData.data)
    .filter((_, i) => i % 4 === 3)
    .map((n) => METADATA_ALPHA - n);
  const sequence: number[] = rawAlpha;

  try {
    return convertNumericSequenceToMetadata(sequence);
  } catch (error) {
    return null;
  }
}
