import {
  StegaCassette,
  StegaMetadata,
  loadAudioBuffersFromAudioUrl,
  playDecodedAudioBuffers,
} from "../../../packages/amplib-steganography/src";
import { createForm } from "../createForm";

type BasicFormData = {
  sampleRate: number;
  bitDepth: "8" | "16" | "24";
  encoding: StegaMetadata.StegaMetadataAudio["encoding"];
  encodeMetadata: string;
  aspectRatio: string;
  borderWidth: number;
  channels: "1" | "2";
};

type SplitFormData = {
  sourceEncodeRepresentation: string;
  sourceDecodeRepresentation: string;
  splitCount: "1" | "2" | "3" | "4" | "5";
  splitPlayback: "Correct Order" | "Only One" | "Reversed Order";
};

type ObfuscationFormData = {
  key: string;
  keyRepresentation: string;
};

export default async function example() {
  const section = document.getElementById("example-stega-cassette")!;

  const source = section
    .querySelector("figure:nth-of-type(1)")!
    .querySelector("img")!;
  const source2 = section.querySelector<HTMLImageElement>("img.source")!;
  const outputBasic = section.querySelector<HTMLElement>("#output-basic")!;
  const outputSplit = section.querySelector<HTMLElement>("#output-split")!;
  const outputObfuscation = section.querySelector<HTMLElement>(
    "#output-obfuscation"
  )!;
  const keyImageDisplay =
    section.querySelector<HTMLElement>("#key-image-display")!;
  const audio = section.querySelector("audio")!;
  const formBasic = section.querySelector<HTMLFormElement>("#form-basic")!;
  const formSplit = section.querySelector<HTMLFormElement>("#form-split")!;
  const formObfuscation =
    section.querySelector<HTMLFormElement>("#form-obfuscation")!;
  const audioContext = new AudioContext();

  const defaults: StegaMetadata.StegaMetadataAudio = {
    type: StegaMetadata.StegaContentType.AUDIO,
    bitDepth: 24,
    channels: 2,
    borderWidth: 1,
    sampleRate: audioContext.sampleRate,
    encoding: "additive",
  };

  let stopBasic = () => {};
  let stopSplit = () => {};
  let stopObfuscation = () => {};
  let stopWithoutKey = () => {};
  let keyImage: HTMLImageElement | null = null;

  // Create hidden file input for key image once and add to DOM (Safari requires this)
  const keyImageInput = document.createElement("input");
  keyImageInput.type = "file";
  keyImageInput.accept = "image/*";
  keyImageInput.style.display = "none";
  section.appendChild(keyImageInput);

  // Basic encoding form
  const { values: basicValues } = createForm<BasicFormData>({
    form: formBasic,
    inputs: {
      sampleRate: {
        type: "range",
        min: 3000,
        max: 48000,
        value: defaults.sampleRate,
        name: "sampleRate",
      },
      bitDepth: {
        type: "select",
        options: ["8", "16", "24"],
        value: `${defaults.bitDepth}`,
        name: "bitDepth",
      },
      encoding: {
        type: "select",
        options: [
          "additive",
          "additive-columns",
          "additive-rows",
          "additive-quarters",
          "subtractive",
          "subtractive-columns",
          "subtractive-rows",
          "subtractive-quarters",
          "difference",
          "difference-columns",
          "difference-rows",
          "difference-quarters",
          "bitshift",
          "bitshift-columns",
          "bitshift-rows",
          "bitshift-quarters",
          "noise",
          "noise-columns",
          "noise-rows",
          "noise-quarters",
          "solid",
          "solid-columns",
          "solid-rows",
          "solid-quarters",
          "alpha",
          "alpha-columns",
          "alpha-rows",
          "alpha-quarters",
        ],
        value: `${defaults.encoding}`,
        name: "encoding",
      },
      encodeMetadata: {
        type: "select",
        options: ["true", "false"],
        value: "true",
        name: "encodeMetadata",
      },
      aspectRatio: {
        type: "select",
        options: ["undefined", "1", "1.7778", "1.3334"],
        value: "undefined",
        name: "aspectRatio",
      },
      borderWidth: { name: "borderWidth", type: "number", value: 1, min: 0 },
      channels: {
        type: "select",
        options: ["2", "1"],
        value: `${defaults.channels}`,
        name: "channels",
      },
    },
    onInput: (values) => {
      runBasic(values);
      runSplit(splitValues);
      runObfuscation(obfuscationValues);
    },
    actions: [
      {
        name: "Play Audio",
        action: async (element) => {
          if (element.getAttribute("data-playing")) {
            element.innerText = "Play Audio";
            element.removeAttribute("data-playing");
            stopBasic();
          } else {
            element.innerText = "Stop Audio";
            element.setAttribute("data-playing", "true");
            const canvas = outputBasic.querySelector("canvas");
            if (!canvas) return;

            const metadata: StegaMetadata.StegaMetadata | null =
              StegaMetadata.decode({ source: canvas });
            section.querySelector(`[data-output="metadata"]`)!.innerHTML =
              JSON.stringify(metadata || {}, null, 2);

            if (
              !metadata ||
              metadata.type === StegaMetadata.StegaContentType.AUDIO
            ) {
              const audioBuffers = StegaCassette.decode({
                source: canvas,
                bitDepth: metadata?.bitDepth || defaults.bitDepth,
                channels: metadata?.channels || defaults.channels,
                encoding: metadata?.encoding || defaults.encoding,
                borderWidth: metadata?.borderWidth || defaults.borderWidth,
              });

              const audioSource = await playDecodedAudioBuffers({
                audioBuffers,
                audioContext,
                sampleRate: metadata?.sampleRate || defaults.sampleRate,
              });
              stopBasic = () => {
                audioSource.stop();
                element.innerText = "Play Audio";
                element.removeAttribute("data-playing");
              };
            }
          }
        },
      },
    ],
  });

  // Split form
  const { values: splitValues, setValue: setSplitValue } =
    createForm<SplitFormData>({
      form: formSplit,
      inputs: {
        sourceEncodeRepresentation: {
          type: "text",
          value: "source",
          name: "Source Encode",
          hidden: true,
        },
        sourceDecodeRepresentation: {
          type: "text",
          value: "source",
          name: "Source Decode",
          hidden: true,
        },
        splitCount: {
          type: "select",
          options: ["1", "2", "3", "4", "5"],
          value: "1",
          name: "Split Count",
        },
        splitPlayback: {
          type: "select",
          options: ["Correct Order", "Only One", "Reversed Order"],
          value: "Correct Order",
          name: "Playback",
        },
      },
      onInput: (values, changed) => {
        runSplit(values);
        if (changed.length) {
          if (
            !changed.includes("sourceEncodeRepresentation") &&
            !changed.includes("sourceDecodeRepresentation")
          ) {
            setSplitValue(
              "sourceEncodeRepresentation",
              values.splitCount === "1"
                ? "source: HTMLImageElement"
                : `sources: [${new Array(parseInt(values.splitCount))
                    .fill("Image")
                    .join(", ")}]`
            );
            let value = "source: Image";
            if (
              values.splitCount !== "1" &&
              values.splitPlayback !== "Only One"
            ) {
              const sources = new Array(parseInt(values.splitCount))
                .fill("Image")
                .map((a, i) => `${a}${i + 1}`);
              const array =
                values.splitPlayback === "Reversed Order"
                  ? sources.reverse()
                  : sources;
              value = `sources: [${array.join(", ")}]`;
            }
            setSplitValue("sourceDecodeRepresentation", value);
          }
        }
      },
      actions: [
        {
          name: "Play Audio",
          action: async (element) => {
            if (element.getAttribute("data-playing")) {
              element.innerText = "Play Audio";
              element.removeAttribute("data-playing");
              stopSplit();
            } else {
              element.innerText = "Stop Audio";
              element.setAttribute("data-playing", "true");
              const canvases = Array.from(
                outputSplit.querySelectorAll("canvas")
              ) as HTMLCanvasElement[];
              if (canvases.length === 0) return;

              let sources: HTMLCanvasElement[] = [];
              if (splitValues.splitPlayback === "Only One") {
                sources = [canvases[0]];
              } else if (splitValues.splitPlayback === "Correct Order") {
                sources = canvases;
              } else if (splitValues.splitPlayback === "Reversed Order") {
                sources = [...canvases].reverse();
              }

              const sourceToUse = sources.length === 1 ? sources[0] : sources;
              const metadataSource = Array.isArray(sourceToUse)
                ? sourceToUse[0]
                : sourceToUse;

              const metadata: StegaMetadata.StegaMetadata | null =
                StegaMetadata.decode({ source: metadataSource });

              console.log(metadata);

              if (
                !metadata ||
                metadata.type === StegaMetadata.StegaContentType.AUDIO
              ) {
                const decodeOptions = {
                  bitDepth: metadata?.bitDepth || defaults.bitDepth,
                  channels: metadata?.channels || defaults.channels,
                  encoding: metadata?.encoding || defaults.encoding,
                  borderWidth: metadata?.borderWidth || defaults.borderWidth,
                };

                const audioBuffers = Array.isArray(sourceToUse)
                  ? StegaCassette.decode({
                      ...decodeOptions,
                      sources: sourceToUse,
                    })
                  : StegaCassette.decode({
                      ...decodeOptions,
                      source: sourceToUse,
                    });

                const audioSource = await playDecodedAudioBuffers({
                  audioBuffers,
                  audioContext,
                  sampleRate: metadata?.sampleRate || defaults.sampleRate,
                });
                stopSplit = () => {
                  audioSource.stop();
                  element.innerText = "Play Audio";
                  element.removeAttribute("data-playing");
                };
              }
            }
          },
        },
      ],
    });

  // Obfuscation form
  const { values: obfuscationValues, setValue: setObfuscationValue } =
    createForm<ObfuscationFormData>({
      form: formObfuscation,
      inputs: {
        key: {
          type: "text",
          value: "",
          name: "Key (string)",
        },
        keyRepresentation: {
          type: "text",
          value: "undefined",
          name: "Key Representation",
          hidden: true,
        },
      },
      onInput: (values, changed) => {
        runObfuscation(values);
        if (changed.length && !changed.includes("keyRepresentation")) {
          const key = keyImage || values.key || undefined;
          setObfuscationValue(
            "keyRepresentation",
            key
              ? keyImage
                ? "HTMLImageElement"
                : `"${values.key}"`
              : "undefined"
          );
        }
      },
      actions: [
        {
          name: "Add Key Image",
          action: () => {
            keyImageInput.click();
          },
        },
        {
          name: "Play Audio",
          action: async (element) => {
            if (element.getAttribute("data-playing")) {
              element.innerText = "Play Audio";
              element.removeAttribute("data-playing");
              stopObfuscation();
            } else {
              element.innerText = "Stop Audio";
              element.setAttribute("data-playing", "true");
              const canvas = outputObfuscation.querySelector("canvas");
              if (!canvas) return;

              const metadata: StegaMetadata.StegaMetadata | null =
                StegaMetadata.decode({ source: canvas });

              if (
                !metadata ||
                metadata.type === StegaMetadata.StegaContentType.AUDIO
              ) {
                const key = keyImage || obfuscationValues.key || undefined;
                const audioBuffers = StegaCassette.decode({
                  source: canvas,
                  bitDepth: metadata?.bitDepth || defaults.bitDepth,
                  channels: metadata?.channels || defaults.channels,
                  encoding: metadata?.encoding || defaults.encoding,
                  borderWidth: metadata?.borderWidth || defaults.borderWidth,
                  key,
                });

                const audioSource = await playDecodedAudioBuffers({
                  audioBuffers,
                  audioContext,
                  sampleRate: metadata?.sampleRate || defaults.sampleRate,
                });
                stopObfuscation = () => {
                  audioSource.stop();
                  element.innerText = "Play Audio";
                  element.removeAttribute("data-playing");
                };
              }
            }
          },
        },
        {
          name: "Play Without Key",
          action: async (element) => {
            if (element.getAttribute("data-playing")) {
              element.innerText = "Play Without Key";
              element.removeAttribute("data-playing");
              stopWithoutKey();
            } else {
              element.innerText = "Stop Audio";
              element.setAttribute("data-playing", "true");
              const canvas = outputObfuscation.querySelector("canvas");
              if (!canvas) return;

              const metadata: StegaMetadata.StegaMetadata | null =
                StegaMetadata.decode({ source: canvas });

              if (
                !metadata ||
                metadata.type === StegaMetadata.StegaContentType.AUDIO
              ) {
                // No key provided - will play scrambled audio
                const audioBuffers = StegaCassette.decode({
                  source: canvas,
                  bitDepth: metadata?.bitDepth || defaults.bitDepth,
                  channels: metadata?.channels || defaults.channels,
                  encoding: metadata?.encoding || defaults.encoding,
                  borderWidth: metadata?.borderWidth || defaults.borderWidth,
                });

                const audioSource = await playDecodedAudioBuffers({
                  audioBuffers,
                  audioContext,
                  sampleRate: metadata?.sampleRate || defaults.sampleRate,
                });
                stopWithoutKey = () => {
                  audioSource.stop();
                  element.innerText = "Play Without Key";
                  element.removeAttribute("data-playing");
                };
              }
            }
          },
        },
      ],
    });

  // Set up change listener for key image input (after form is created so we have access to setObfuscationValue)
  keyImageInput.addEventListener("change", () => {
    const file = keyImageInput.files?.item(0);
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          keyImage = img;
          keyImageDisplay.classList.remove("hidden");
          keyImageDisplay.innerHTML = "<figcaption>Key Image</figcaption>";
          keyImageDisplay.appendChild(img);
          setObfuscationValue("keyRepresentation", "HTMLImageElement");
          runObfuscation(obfuscationValues);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  });

  runBasic(basicValues);
  runSplit(splitValues);
  runObfuscation(obfuscationValues);

  async function runBasic(values: BasicFormData) {
    const sampleRate = values.sampleRate;
    defaults.sampleRate = values.sampleRate;
    defaults.bitDepth = parseInt(values.bitDepth) as 8 | 16 | 24;
    defaults.encoding = values.encoding;
    defaults.borderWidth = values.borderWidth;
    defaults.channels = parseInt(values.channels) as 1 | 2;

    const aspectRatio =
      values.aspectRatio === "undefined"
        ? undefined
        : parseFloat(values.aspectRatio);
    (defaults as any).aspectRatio = aspectRatio;

    const encodeOptions = {
      audioBuffers: await loadAudioBuffersFromAudioUrl({
        url: audio.getAttribute("src")!,
        audioContext,
        channels: parseInt(values.channels) as 1 | 2,
        sampleRate,
      }),
      sampleRate,
      bitDepth: parseInt(values.bitDepth) as 8 | 16 | 24,
      borderWidth: values.borderWidth,
      encoding: values.encoding,
      encodeMetadata: values.encodeMetadata === "true",
      aspectRatio,
    };

    outputBasic.innerHTML = "";
    const result = StegaCassette.encode({ ...encodeOptions, source });
    outputBasic.appendChild(result);
  }

  async function runSplit(values: SplitFormData) {
    const splitCount = parseInt(values.splitCount);
    const sources = Array(splitCount)
      .fill(0)
      .map((_, i) => (i % 2 === 0 ? source : source2));

    const encodeOptions = {
      audioBuffers: await loadAudioBuffersFromAudioUrl({
        url: audio.getAttribute("src")!,
        audioContext,
        channels: defaults.channels,
        sampleRate: defaults.sampleRate,
      }),
      sampleRate: defaults.sampleRate,
      bitDepth: defaults.bitDepth,
      borderWidth: defaults.borderWidth,
      encoding: defaults.encoding,
      encodeMetadata: true,
      aspectRatio: (defaults as any).aspectRatio,
    };

    outputSplit.innerHTML = "";
    if (splitCount === 1) {
      const result = StegaCassette.encode({ ...encodeOptions, source });
      outputSplit.appendChild(result);
    } else {
      const result = StegaCassette.encode({ ...encodeOptions, sources });
      result.forEach((r) => outputSplit.appendChild(r));
    }
  }

  async function runObfuscation(values: ObfuscationFormData) {
    const key = keyImage || values.key || undefined;

    const encodeOptions = {
      audioBuffers: await loadAudioBuffersFromAudioUrl({
        url: audio.getAttribute("src")!,
        audioContext,
        channels: defaults.channels,
        sampleRate: defaults.sampleRate,
      }),
      sampleRate: defaults.sampleRate,
      bitDepth: defaults.bitDepth,
      borderWidth: defaults.borderWidth,
      encoding: defaults.encoding,
      encodeMetadata: true,
      aspectRatio: (defaults as any).aspectRatio,
      key,
    };

    outputObfuscation.innerHTML = "";
    const result = StegaCassette.encode({ ...encodeOptions, source });
    outputObfuscation.appendChild(result);
  }
}
