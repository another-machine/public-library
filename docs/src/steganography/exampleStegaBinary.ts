import {
  StegaBinary,
  StegaKey,
  StegaMetadata,
  createFileReader,
  downloadBytes,
  bytesToBlobUrl,
} from "../../../packages/amplib-steganography/src";
import { createForm } from "../createForm";

type FormData = {
  borderWidth: number;
  aspectRatio: string;
  key: "undefined" | "false" | "custom";
};

export default async function example() {
  const section = document.getElementById("example-stega-binary")!;
  const source = section
    .querySelector("figure:nth-of-type(1)")!
    .querySelector("img")!;
  const keySourceFigure = section.querySelector(
    "figure:nth-of-type(2)"
  )! as HTMLElement;

  const outputEncodedFigure = section.querySelector(
    "#output-encoded-container"
  )! as HTMLElement;
  const outputKeyFigure = section.querySelector(
    "#output-key-container"
  )! as HTMLElement;
  const outputDecoded = section.querySelector(
    "#output-decoded"
  )! as HTMLElement;
  const form = section.querySelector("form")!;

  // Create a small custom key image on page load using StegaKey.create()
  // This demonstrates creating a standalone key with embedded metadata
  const customKeySourceCanvas = document.createElement("canvas");
  customKeySourceCanvas.width = 64;
  customKeySourceCanvas.height = 64;
  const ctx = customKeySourceCanvas.getContext("2d")!;

  // Create a colorful pattern for the key
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const r = Math.floor((x / 64) * 255);
      const g = Math.floor((y / 64) * 255);
      const b = Math.floor(((x + y) / 128) * 255);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Create a standalone key with metadata using StegaKey.create()
  const { key: customKey, sessionId: customKeySessionId } = StegaKey.create({
    source: customKeySourceCanvas,
    borderWidth: 1,
  });

  // Display the custom key in the figure (hidden by default, shown in custom key)
  keySourceFigure.innerHTML = "";
  const figcaption = document.createElement("figcaption");
  figcaption.textContent = `Custom Key Source`;
  keySourceFigure.appendChild(figcaption);
  keySourceFigure.appendChild(customKey);
  keySourceFigure.classList.add("hidden"); // Hidden until custom key is selected

  // Track file data when a file is uploaded
  let fileData: { bytes: Uint8Array; mimeType: string; name: string } | null =
    null;
  // Track last decoded result for download
  let lastDecoded: { data: Uint8Array; mimeType: string } | null = null;

  // Helper to update data-value spans in the section
  function updateDataValue(key: string, value: string | number) {
    section
      .querySelectorAll<HTMLElement>(`[data-value="${key}"]`)
      .forEach((el) => (el.innerText = String(value)));
  }

  // Helper to get file extension from MIME type
  function getExtensionFromMimeType(mimeType: string): string {
    const map: Record<string, string> = {
      "text/plain": ".txt",
      "application/json": ".json",
      "application/pdf": ".pdf",
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "audio/mpeg": ".mp3",
      "audio/wav": ".wav",
      "video/mp4": ".mp4",
      "application/octet-stream": ".bin",
    };
    return map[mimeType] || ".bin";
  }

  const { values } = createForm<FormData>({
    form,
    inputs: {
      borderWidth: { name: "borderWidth", type: "number", value: 1, min: 1 },
      aspectRatio: {
        type: "select",
        options: ["undefined", "1", "1.7778", "1.3334"],
        value: "undefined",
        name: "aspectRatio",
      },
      key: {
        type: "select",
        options: ["undefined", "false", "custom"],
        value: "undefined",
        name: "key",
      },
    },
    onInput: run,
    actions: [
      {
        name: "Choose File",
        action: async () => {
          const input = document.createElement("input");
          input.type = "file";
          createFileReader({
            element: input,
            onBinarySuccess: (result) => {
              fileData = {
                bytes: result.data,
                mimeType: result.mimeType || "application/octet-stream",
                name: result.fileName,
              };
              updateDataValue("fileName", result.fileName);
              updateDataValue("fileMimeType", fileData.mimeType);
              updateDataValue("fileSize", result.data.length);
              run(values);
            },
            types: ["*/*"],
          });
          input.click();
        },
      },
      {
        name: "Download Decoded",
        action: () => {
          if (lastDecoded) {
            const extension = getExtensionFromMimeType(lastDecoded.mimeType);
            downloadBytes({
              data: lastDecoded.data,
              mimeType: lastDecoded.mimeType,
              fileName: `decoded${extension}`,
            });
          }
        },
      },
    ],
  });

  source.onload = () => run(values);

  function run(data: FormData) {
    try {
      // Update code display based on key
      if (data.key === "undefined") {
        updateDataValue("codeComment", "// source image is also the key");
        updateDataValue("keyParam", "undefined");
        keySourceFigure.classList.add("hidden");
      } else if (data.key === "false") {
        updateDataValue("codeComment", "// no key needed for decoding");
        updateDataValue("keyParam", "false");
        keySourceFigure.classList.add("hidden");
      } else {
        updateDataValue(
          "codeComment",
          "// pre-created key with embedded metadata"
        );
        updateDataValue("keyParam", "customKey");
      }

      // Require file to be uploaded
      if (!fileData) {
        outputDecoded.innerHTML = `<strong>Select a file to encode</strong>`;
        return;
      }

      const binaryData = fileData.bytes;
      const mimeType = fileData.mimeType;

      const aspectRatio =
        data.aspectRatio === "undefined"
          ? undefined
          : parseFloat(data.aspectRatio);

      let encodedCanvas: HTMLCanvasElement;
      let keyCanvas: HTMLCanvasElement | null = null;
      let sessionId: number | null = null;

      if (data.key === "false") {
        // Keyless key - no key needed for decoding
        const result = StegaBinary.encode({
          source,
          data: binaryData,
          mimeType,
          borderWidth: data.borderWidth,
          aspectRatio,
          key: false as const,
        });
        encodedCanvas = result.encoded;
      } else if (data.key === "custom") {
        // Custom key key - use the pre-created key as-is
        // borderWidth and sessionId come from the key's embedded metadata
        const result = StegaBinary.encode({
          source,
          data: binaryData,
          mimeType,
          aspectRatio,
          key: customKey,
        });
        encodedCanvas = result.encoded;
        keyCanvas = result.key;
        sessionId = result.sessionId;
      } else {
        // Default undefined key - source image is also the key
        const result = StegaBinary.encode({
          source,
          data: binaryData,
          mimeType,
          borderWidth: data.borderWidth,
          aspectRatio,
        });
        encodedCanvas = result.encoded;
        keyCanvas = result.key;
        sessionId = result.sessionId;
      }

      // Display encoded image - replace existing canvas or append
      const existingEncodedCanvas = outputEncodedFigure.querySelector("canvas");
      if (existingEncodedCanvas) {
        existingEncodedCanvas.replaceWith(encodedCanvas);
      } else {
        outputEncodedFigure.appendChild(encodedCanvas);
      }

      // Display key image (if applicable) - replace existing canvas or append
      const existingKeyCanvas = outputKeyFigure.querySelector("canvas");
      if (keyCanvas) {
        if (existingKeyCanvas) {
          existingKeyCanvas.replaceWith(keyCanvas);
        } else {
          outputKeyFigure.appendChild(keyCanvas);
        }
        outputKeyFigure.classList.remove("hidden");
      } else {
        if (existingKeyCanvas) {
          existingKeyCanvas.remove();
        }
        outputKeyFigure.classList.add("hidden");
      }

      // Decode and display result
      const decoded = StegaBinary.decode({
        encoded: encodedCanvas,
        key: keyCanvas || undefined,
      });

      // Store for download button
      lastDecoded = decoded;

      const metadata = StegaMetadata.decode({ source: encodedCanvas });

      // Display decoded output
      let decodedPreview: string;
      let mediaPreview = "";

      if (
        decoded.mimeType.startsWith("text/") ||
        decoded.mimeType === "application/json"
      ) {
        decodedPreview = new TextDecoder().decode(decoded.data);
      } else if (decoded.mimeType.startsWith("image/")) {
        // Image preview
        const blobUrl = bytesToBlobUrl({
          data: decoded.data,
          mimeType: decoded.mimeType,
        });
        decodedPreview = `[Image data]`;
        mediaPreview = `<img src="${blobUrl}" style="max-width: 100%; max-height: 300px; margin-top: 10px;" />`;
      } else if (decoded.mimeType.startsWith("video/")) {
        // Video preview
        const blobUrl = bytesToBlobUrl({
          data: decoded.data,
          mimeType: decoded.mimeType,
        });
        decodedPreview = `[Video data]`;
        mediaPreview = `<video src="${blobUrl}" controls style="max-width: 100%; max-height: 300px; margin-top: 10px;"></video>`;
      } else if (decoded.mimeType.startsWith("audio/")) {
        // Audio preview
        const blobUrl = bytesToBlobUrl({
          data: decoded.data,
          mimeType: decoded.mimeType,
        });
        decodedPreview = `[Audio data]`;
        mediaPreview = `<audio src="${blobUrl}" controls style="margin-top: 10px;"></audio>`;
      } else {
        // For other binary data, show hex preview of first 100 bytes
        const previewBytes = decoded.data.slice(0, 100);
        const hexPreview = Array.from(previewBytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ");
        decodedPreview = `[Binary data - hex preview of first ${
          previewBytes.length
        } bytes]\n${hexPreview}${decoded.data.length > 100 ? "..." : ""}`;
      }

      outputDecoded.innerHTML = `<strong>Metadata:</strong>
${JSON.stringify(metadata, null, 2)}

<strong>Decoded MIME Type:</strong> ${decoded.mimeType}
<strong>Decoded Data (${decoded.data.length} bytes):</strong>
${decodedPreview}
${mediaPreview}

<strong>Session ID:</strong> ${sessionId ?? 0} (${
        sessionId === 0 || sessionId === null ? "false" : "requires key"
      })`;
    } catch (error) {
      outputDecoded.innerHTML = `<strong>Error:</strong> ${error}`;
    }
  }
}
