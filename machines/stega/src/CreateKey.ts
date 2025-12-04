import { Stega64 } from "../../../packages/amplib-steganography/src";

export class CreateKey {
  constructor() {
    this.setupListeners();
  }

  setupListeners() {
    const generateBtn = document.getElementById("generate-key-btn")!;
    const keyLengthInput = document.getElementById(
      "key-length"
    ) as HTMLInputElement;
    const generatedKey = document.getElementById(
      "generated-key-string"
    ) as HTMLInputElement;
    const copyKeyBtn = document.getElementById("copy-key-string-btn")!;

    const sourceImageBtn = document.getElementById("create-key-image-btn")!;
    const sourceImageName = document.getElementById("create-key-image-name")!;
    const sourceImageInput = document.getElementById(
      "create-key-image-input"
    ) as HTMLInputElement;
    const sourceImageDropZone = document.getElementById(
      "create-key-image-drop"
    )!;

    const encodeKeyBtn = document.getElementById("encode-key-btn")!;
    const resultImg = document.getElementById(
      "key-result-image"
    ) as HTMLImageElement;
    const resultContainer = document.getElementById("create-key-result")!;
    const downloadKeyImgBtn = document.getElementById(
      "download-key-image-btn"
    )!;

    let sourceImage: HTMLImageElement | null = null;
    let encodedCanvas: HTMLCanvasElement | null = null;

    // Generate random key
    generateBtn.addEventListener("click", () => {
      const length = parseInt(keyLengthInput.value);
      const key = this.generateRandomKey(length);
      generatedKey.value = key;
      if (sourceImage) {
        encodeKeyBtn.classList.remove("hidden");
      }
    });

    // Copy key to clipboard
    copyKeyBtn.addEventListener("click", () => {
      generatedKey.select();
      document.execCommand("copy");
      const originalText = copyKeyBtn.textContent;
      copyKeyBtn.textContent = "Copied!";
      setTimeout(() => {
        copyKeyBtn.textContent = originalText;
      }, 2000);
    });

    // Source image handling
    sourceImageBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      sourceImageInput.click();
    });

    sourceImageDropZone.addEventListener("click", () =>
      sourceImageInput.click()
    );

    sourceImageInput.addEventListener("change", (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        sourceImageName.innerText = file.name;
        this.loadSourceImage(file).then((img) => {
          sourceImage = img;
          if (generatedKey.value) {
            encodeKeyBtn.classList.remove("hidden");
          }
        });
      }
    });

    // Handle dropped images
    sourceImageDropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      sourceImageDropZone.classList.add("drag-over");
    });

    sourceImageDropZone.addEventListener("dragleave", () => {
      sourceImageDropZone.classList.remove("drag-over");
    });

    sourceImageDropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      sourceImageDropZone.classList.remove("drag-over");
      const file = e.dataTransfer?.files[0];
      if (file && file.type.startsWith("image/")) {
        sourceImageName.innerText = file.name;
        this.loadSourceImage(file).then((img) => {
          sourceImage = img;
          if (generatedKey.value) {
            encodeKeyBtn.classList.remove("hidden");
          }
        });
      }
    });

    // Encode key into image
    encodeKeyBtn.addEventListener("click", () => {
      if (!sourceImage || !generatedKey.value) {
        alert("Please generate a key and select an image");
        return;
      }

      const encoding = (
        document.getElementById("create-key-encoding") as HTMLSelectElement
      ).value as "base64" | "raw";
      const borderWidth = parseInt(
        (document.getElementById("create-key-border-width") as HTMLInputElement)
          .value
      );
      const minWidth = parseInt(
        (document.getElementById("create-key-min-width") as HTMLInputElement)
          .value
      );
      const minHeight = parseInt(
        (document.getElementById("create-key-min-height") as HTMLInputElement)
          .value
      );
      const aspectRatioStr = (
        document.getElementById("create-key-aspect-ratio") as HTMLSelectElement
      ).value;
      const aspectRatio =
        aspectRatioStr === "undefined" ? undefined : parseFloat(aspectRatioStr);

      encodedCanvas = Stega64.encode({
        source: sourceImage,
        messages: [generatedKey.value],
        encoding,
        encodeMetadata: true,
        borderWidth,
        minWidth,
        minHeight,
        aspectRatio,
      });

      const dataUrl = encodedCanvas.toDataURL();
      resultImg.src = dataUrl;
      resultImg.classList.remove("hidden");
      resultContainer.classList.remove("hidden");
    });

    // Download key image
    downloadKeyImgBtn.addEventListener("click", () => {
      if (!encodedCanvas) return;
      const link = document.createElement("a");
      link.download = `key-image-${Date.now()}.png`;
      link.href = encodedCanvas.toDataURL();
      link.click();
    });

    // Show encode button when key is manually entered and image is loaded
    generatedKey.addEventListener("input", () => {
      if (sourceImage && generatedKey.value) {
        encodeKeyBtn.classList.remove("hidden");
      } else {
        encodeKeyBtn.classList.add("hidden");
      }
    });

    // Initially hide the encode button
    encodeKeyBtn.classList.add("hidden");
  }

  generateRandomKey(length: number): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?";
    let result = "";
    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
      result += chars[array[i] % chars.length];
    }
    return result;
  }

  loadSourceImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
}
