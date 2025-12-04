import {
  StegaCassette,
  createDropReader,
  StegaMetadata,
  Stega64,
} from "../../../packages/amplib-steganography/src";

export class Playback {
  audioContext: AudioContext;
  playbackSource: AudioBufferSourceNode | null = null;
  stegaImage: HTMLImageElement | null = null;
  keyImage: HTMLImageElement | null = null;

  constructor() {
    this.audioContext = new AudioContext();
    this.setupListeners();
  }

  setupListeners() {
    const stegaImageBtn = document.getElementById("playback-image-btn")!;
    const stegaImageName = document.getElementById("playback-image-name")!;
    const stegaImageInput = document.getElementById(
      "playback-image-input"
    ) as HTMLInputElement;
    const stegaImageDropZone = document.getElementById("playback-image-drop")!;

    const keyImageBtn = document.getElementById("playback-key-image-btn")!;
    const keyImageName = document.getElementById("playback-key-image-name")!;
    const keyImageInput = document.getElementById(
      "playback-key-image-input"
    ) as HTMLInputElement;
    const keyImageDropZone = document.getElementById(
      "playback-key-image-drop"
    )!;

    const keyTypeSelect = document.getElementById(
      "playback-key-type"
    ) as HTMLSelectElement;
    const keyStringContainer = document.getElementById(
      "playback-key-string-container"
    )!;
    const keyImageContainer = document.getElementById(
      "playback-key-image-container"
    )!;

    const keyString = document.getElementById(
      "playback-key-string"
    ) as HTMLInputElement;
    const playPauseBtn = document.getElementById("playback-play-pause-btn")!;

    // Key Type Selection
    keyTypeSelect.addEventListener("change", () => {
      const type = keyTypeSelect.value;
      if (type === "string") {
        keyStringContainer.classList.remove("hidden");
        keyImageContainer.classList.add("hidden");
        keyString.readOnly = false;
      } else if (type === "image") {
        keyStringContainer.classList.remove("hidden"); // Show string container for decoded key
        keyImageContainer.classList.remove("hidden");
        keyString.readOnly = true;
      } else {
        keyStringContainer.classList.add("hidden");
        keyImageContainer.classList.add("hidden");
      }
    });

    // Stega image handling
    stegaImageBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      stegaImageInput.click();
    });

    stegaImageDropZone.addEventListener("click", () => stegaImageInput.click());

    stegaImageInput.addEventListener("change", (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        stegaImageName.innerText = file.name;
        this.loadStegaImage(file);
      }
    });

    createDropReader({
      element: stegaImageDropZone,
      onSuccess: ({ imageElements }) => {
        if (imageElements.length > 0) {
          stegaImageName.innerText = "Dropped Stega Image";
          this.stegaImage = imageElements[0];
          this.updateMetadataDisplay(this.stegaImage);

          const preview = document.getElementById(
            "playback-preview-stega"
          ) as HTMLImageElement;
          preview.src = this.stegaImage.src;

          document
            .getElementById("playback-controls")!
            .classList.remove("hidden");
        }
      },
      onDragEnter: () => stegaImageDropZone.classList.add("drag-over"),
      onDragLeave: () => stegaImageDropZone.classList.remove("drag-over"),
      onDrop: () => stegaImageDropZone.classList.remove("drag-over"),
      types: ["image/*"],
    });

    // Key image handling
    keyImageBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      keyImageInput.click();
    });

    keyImageDropZone.addEventListener("click", () => keyImageInput.click());

    keyImageInput.addEventListener("change", (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        keyImageName.innerText = file.name;
        this.loadKeyImage(file);
      }
    });

    createDropReader({
      element: keyImageDropZone,
      onSuccess: ({ imageElements }) => {
        if (imageElements.length > 0) {
          keyImageName.innerText = "Dropped Key Image";
          this.keyImage = imageElements[0];
          this.processKeyImage(this.keyImage);
        }
      },
      onDragEnter: () => keyImageDropZone.classList.add("drag-over"),
      onDragLeave: () => keyImageDropZone.classList.remove("drag-over"),
      onDrop: () => keyImageDropZone.classList.remove("drag-over"),
      types: ["image/*"],
    });

    // Play/Pause button
    playPauseBtn.addEventListener("click", () => {
      if (this.playbackSource) {
        this.stop();
        playPauseBtn.innerText = "Play";
      } else {
        if (!this.stegaImage) {
          alert("Please select a stega image");
          return;
        }

        const keyType = keyTypeSelect.value;
        let key: string | HTMLImageElement | undefined = undefined;

        if (keyType === "string") {
          const keyStr = keyString.value.trim();
          if (keyStr) key = keyStr;
        } else if (keyType === "image") {
          if (this.keyImage) key = this.keyImage;
        }

        this.play(this.stegaImage, key);
        playPauseBtn.innerText = "Stop";
      }
    });
  }

  loadStegaImage(file: File) {
    const img = new Image();
    img.onload = () => {
      this.stegaImage = img;
      this.updateMetadataDisplay(img);
      const preview = document.getElementById(
        "playback-preview-stega"
      ) as HTMLImageElement;
      preview.src = img.src;
      document.getElementById("playback-controls")!.classList.remove("hidden");
    };
    img.src = URL.createObjectURL(file);
  }

  updateMetadataDisplay(image: HTMLImageElement) {
    const metadataPre = document.getElementById("playback-metadata")!;
    try {
      const metadata = StegaMetadata.decode({ source: image });
      if (metadata) {
        metadataPre.innerText = JSON.stringify(metadata, null, 2);
      } else {
        metadataPre.innerText = "No valid metadata found.";
      }
    } catch (e) {
      metadataPre.innerText = "Error reading metadata.";
      console.error(e);
    }
  }

  loadKeyImage(file: File) {
    const img = new Image();
    img.onload = () => {
      this.keyImage = img;
      this.processKeyImage(img);
    };
    img.src = URL.createObjectURL(file);
  }

  processKeyImage(img: HTMLImageElement) {
    const preview = document.getElementById(
      "playback-preview-key"
    ) as HTMLImageElement;
    preview.src = img.src;

    try {
      let encoding: "base64" | "raw" = "base64";
      let borderWidth = 1;

      const metadata = StegaMetadata.decode({ source: img });
      if (metadata && metadata.type === StegaMetadata.StegaContentType.STRING) {
        encoding = metadata.encoding;
        borderWidth = metadata.borderWidth;
      }

      const decoded = Stega64.decode({ source: img, encoding, borderWidth });
      if (decoded && decoded.length > 0 && decoded[0]) {
        const keyString = document.getElementById(
          "playback-key-string"
        ) as HTMLInputElement;
        keyString.value = decoded[0];

        // Show the key string container so the user can see the decoded key
        const keyStringContainer = document.getElementById(
          "playback-key-string-container"
        )!;
        keyStringContainer.classList.remove("hidden");
      }
    } catch (e) {
      console.error("Failed to decode key image", e);
    }
  }

  play(
    stegaImage: HTMLImageElement,
    key?: string | HTMLImageElement | HTMLCanvasElement
  ) {
    this.stop();

    try {
      // Read metadata to get decode parameters
      const metadata = StegaMetadata.decode({ source: stegaImage });

      if (
        !metadata ||
        (metadata.type !== StegaMetadata.StegaContentType.AUDIO &&
          metadata.type !== StegaMetadata.StegaContentType.MUSIC)
      ) {
        alert(
          "Image does not contain valid audio metadata. Cannot decode without knowing bit depth, channels, and encoding."
        );
        return;
      }

      const decodedBuffers = StegaCassette.decode({
        source: stegaImage,
        bitDepth: metadata.bitDepth,
        channels: metadata.channels,
        encoding: metadata.encoding,
        borderWidth: metadata.borderWidth,
        key,
      });

      const audioBuffer = this.audioContext.createBuffer(
        metadata.channels,
        decodedBuffers[0].length,
        metadata.sampleRate
      );

      for (let i = 0; i < metadata.channels; i++) {
        audioBuffer.copyToChannel(new Float32Array(decodedBuffers[i]), i);
      }

      this.playbackSource = this.audioContext.createBufferSource();
      this.playbackSource.buffer = audioBuffer;
      this.playbackSource.loop = true;
      this.playbackSource.connect(this.audioContext.destination);
      this.playbackSource.start();
      this.playbackSource.onended = () => {
        this.playbackSource = null;
        const playPauseBtn = document.getElementById(
          "playback-play-pause-btn"
        )!;
        playPauseBtn.innerText = "Play";
      };
    } catch (error) {
      console.error("Playback error:", error);
      alert(
        "Failed to decode audio. Make sure you have the correct key if the audio is encrypted."
      );
      const playPauseBtn = document.getElementById("playback-play-pause-btn")!;
      playPauseBtn.innerText = "Play";
    }
  }

  stop() {
    if (this.playbackSource) {
      this.playbackSource.stop();
      this.playbackSource = null;
    }
  }
}
