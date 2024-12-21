// Constants for protected metadata regions
export const METADATA_EDGE_SIZE = 4; // Number of pixels to reserve on each edge
// Metadata format version
const METADATA_VERSION = 1;

// Content type identifiers
export enum StegaContentType {
  AUDIO = 0,
  STRING = 1,
  ROBUST = 2,
}

// Quantized values for robust storage
const QUANTIZED_VALUES = [0, 85, 170, 255] as const;

export interface StegaMetadataAudio {
  type: StegaContentType.AUDIO;
  sampleRate: number;
  bitDepth: 8 | 16 | 24;
  channels: 1 | 2;
}

export interface StegaMetadataString {
  type: StegaContentType.STRING;
  messageCount: number;
  encoding: "base64" | "none";
}

export interface StegaMetadataRobust {
  type: StegaContentType.ROBUST;
  blockSize: 2 | 4; // Size of encoding blocks
  redundancyLevel: number; // How much error correction to use
  encoding: "hex" | "base16"; // Using smaller character sets
  messageCount: number;
}

export type StegaMetadata =
  | StegaMetadataAudio
  | StegaMetadataString
  | StegaMetadataRobust;

// Convert a number to a series of quantized values
function numberToQuantizedValues(num: number, byteCount: number): number[] {
  const values: number[] = [];
  for (let i = 0; i < byteCount; i++) {
    const byte = (num >> (i * 8)) & 0xff;
    const quantized = QUANTIZED_VALUES[Math.floor((byte / 256) * 4)];
    values.push(quantized);
  }
  return values;
}

// Convert a series of quantized values back to a number
function quantizedValuesToNumber(values: number[]): number {
  let result = 0;
  for (let i = 0; i < values.length; i++) {
    const quantizedIndex = QUANTIZED_VALUES.findIndex(
      (v) => Math.abs(v - values[i]) < 43
    );
    if (quantizedIndex === -1) throw new Error("Invalid quantized value");
    const byte = Math.floor((quantizedIndex * 256) / 4);
    result |= byte << (i * 8);
  }
  return result;
}

// Calculate a simple checksum for verification
function calculateChecksum(data: number[]): number {
  return data.reduce((sum, val) => (sum + val) & 0xff, 0);
}

export function encodeMetadata(
  imageData: ImageData,
  metadata: StegaMetadata
): ImageData {
  const { width, height, data } = imageData;

  // Convert metadata to quantized values
  const headerData: number[] = [
    QUANTIZED_VALUES[METADATA_VERSION], // Version
    QUANTIZED_VALUES[metadata.type], // Content type
  ];

  if (metadata.type === StegaContentType.AUDIO) {
    // Encode audio-specific metadata
    headerData.push(
      ...numberToQuantizedValues(metadata.sampleRate, 3),
      QUANTIZED_VALUES[
        metadata.bitDepth === 24 ? 3 : metadata.bitDepth === 16 ? 2 : 1
      ],
      QUANTIZED_VALUES[metadata.channels]
    );
  } else if (metadata.type === StegaContentType.ROBUST) {
    // Encode robust-specific metadata
    headerData.push(
      ...numberToQuantizedValues(metadata.messageCount, 2),
      QUANTIZED_VALUES[metadata.blockSize === 4 ? 1 : 0], // blockSize (2 or 4)
      QUANTIZED_VALUES[Math.min(3, Math.floor(metadata.redundancyLevel))], // redundancyLevel (0-3)
      QUANTIZED_VALUES[metadata.encoding === "base16" ? 1 : 0] // encoding type
    );
  } else {
    // Encode string-specific metadata
    headerData.push(
      ...numberToQuantizedValues(metadata.messageCount, 2),
      QUANTIZED_VALUES[metadata.encoding === "base64" ? 1 : 0] // encoding type
    );
  }

  // Add checksum
  const checksum = calculateChecksum(headerData);
  headerData.push(QUANTIZED_VALUES[checksum & 0x03]);

  const writeCornerHeader = (offsetX: number, offsetY: number) => {
    headerData.forEach((value, i) => {
      const x = offsetX + (i % METADATA_EDGE_SIZE);
      const y = offsetY + Math.floor(i / METADATA_EDGE_SIZE);
      const pixelIndex = (y * width + x) * 4;

      // Write all channels with the same value
      data[pixelIndex] = value; // R
      data[pixelIndex + 1] = value; // G
      data[pixelIndex + 2] = value; // B
      data[pixelIndex + 3] = 255; // A
    });
  };

  // Top-left
  writeCornerHeader(0, 0);
  // Top-right
  writeCornerHeader(width - METADATA_EDGE_SIZE, 0);
  // Bottom-left
  writeCornerHeader(0, height - METADATA_EDGE_SIZE);
  // Bottom-right
  writeCornerHeader(width - METADATA_EDGE_SIZE, height - METADATA_EDGE_SIZE);

  return imageData;
}

export function decodeMetadata(imageData: ImageData): StegaMetadata {
  const { width, height, data } = imageData;

  // Try to read header from each corner
  const readCornerHeader = (offsetX: number, offsetY: number) => {
    return Array.from({ length: 8 }, (_, i) => {
      const x = offsetX + (i % METADATA_EDGE_SIZE);
      const y = offsetY + Math.floor(i / METADATA_EDGE_SIZE);
      return data[(y * width + x) * 4]; // Just read the R channel
    });
  };

  // Read all corners
  const topLeft = readCornerHeader(0, 0);
  const topRight = readCornerHeader(width - METADATA_EDGE_SIZE, 0);
  const bottomLeft = readCornerHeader(0, height - METADATA_EDGE_SIZE);
  const bottomRight = readCornerHeader(
    width - METADATA_EDGE_SIZE,
    height - METADATA_EDGE_SIZE
  );

  // Use the first valid header we find
  const headers = [topLeft, topRight, bottomLeft, bottomRight];
  let headerValues: number[] | null = null;

  for (const header of headers) {
    try {
      const checksum = calculateChecksum(header.slice(0, -1));
      const checksumQuantized = QUANTIZED_VALUES[checksum & 0x03];
      if (Math.abs(header[header.length - 1] - checksumQuantized) < 43) {
        headerValues = header;
        break;
      }
    } catch (e) {
      continue;
    }
  }

  if (!headerValues) {
    throw new Error("Could not find valid metadata in any corner");
  }

  // Parse version and content type
  const version = Math.floor((headerValues[0] / 256) * 4);
  if (version !== METADATA_VERSION) {
    throw new Error(`Unsupported metadata version: ${version}`);
  }

  const contentType = Math.floor(
    (headerValues[1] / 256) * 4
  ) as StegaContentType;

  if (contentType === StegaContentType.AUDIO) {
    const sampleRate = quantizedValuesToNumber(headerValues.slice(2, 5));
    const bitDepthIndex = Math.floor((headerValues[5] / 256) * 4);
    const bitDepth = bitDepthIndex === 3 ? 24 : bitDepthIndex === 2 ? 16 : 8;
    const channels = Math.floor((headerValues[6] / 256) * 4) as 1 | 2;

    return {
      type: StegaContentType.AUDIO,
      sampleRate,
      bitDepth: bitDepth as 8 | 16 | 24,
      channels,
    };
  } else if (contentType === StegaContentType.ROBUST) {
    const messageCount = quantizedValuesToNumber(headerValues.slice(2, 4));
    const blockSize = Math.floor((headerValues[4] / 256) * 4) === 1 ? 4 : 2;
    const redundancyLevel = Math.floor((headerValues[5] / 256) * 4);
    const encoding = headerValues[6] === QUANTIZED_VALUES[1] ? "base16" : "hex";

    return {
      type: StegaContentType.ROBUST,
      messageCount,
      blockSize: blockSize as 2 | 4,
      redundancyLevel,
      encoding,
    };
  } else {
    const messageCount = quantizedValuesToNumber(headerValues.slice(2, 4));
    return {
      type: StegaContentType.STRING,
      messageCount,
      encoding: headerValues[4] === QUANTIZED_VALUES[1] ? "base64" : "none",
    };
  }
}

// Helper to determine if a pixel position is part of the metadata regions
export function isMetadataPixel(
  x: number,
  y: number,
  width: number,
  height: number
): boolean {
  // Top or bottom edge
  if (y < METADATA_EDGE_SIZE || y >= height - METADATA_EDGE_SIZE) {
    return x < METADATA_EDGE_SIZE || x >= width - METADATA_EDGE_SIZE;
  }
  // Left or right edge
  if (x < METADATA_EDGE_SIZE || x >= width - METADATA_EDGE_SIZE) {
    return y < METADATA_EDGE_SIZE || y >= height - METADATA_EDGE_SIZE;
  }
  return false;
}

// For array index version
export function isMetadataPixelFromIndex(
  index: number,
  width: number,
  height: number
): boolean {
  const x = (index / 4) % width;
  const y = Math.floor(index / 4 / width);
  return isMetadataPixel(x, y, width, height);
}
