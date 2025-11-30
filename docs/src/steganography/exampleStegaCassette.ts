import {
  StegaCassette,
  StegaMetadata,
  loadAudioBuffersFromAudioUrl,
  playDecodedAudioBuffers,
} from "../../../packages/amplib-steganography/src";
import { createForm } from "../createForm";

type FormData = {
  sampleRate: number;
  bitDepth: "8" | "16" | "24";
  encoding: StegaMetadata.StegaMetadataAudio["encoding"];
  encodeMetadata: string;
  aspectRatio: string;
  borderWidth: number;
  channels: "1" | "2";
  splitOutput: "1" | "2" | "3" | "4";
  splitPlayback: "First" | "All" | "Mixed";
};

export default async function example() {
  const section = document.getElementById("example-stega-cassette")!;

  const source = section
    .querySelector("figure:nth-of-type(1)")!
    .querySelector("img")!;
  const source2 = section.querySelector<HTMLImageElement>("img.source")!;
  const output = section.querySelector("figure:nth-of-type(2)")!;
  const audio = section.querySelector("audio")!;
  const form = section.querySelector("form")!;
  const audioContext = new AudioContext();

  const defaults: StegaMetadata.StegaMetadataAudio = {
    type: StegaMetadata.StegaContentType.AUDIO,
    bitDepth: 24,
    channels: 2,
    borderWidth: 1,
    sampleRate: audioContext.sampleRate,
    encoding: "additive",
  };

  let stop = () => {};

  const { values } = createForm<FormData>({
    form,
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
      splitOutput: {
        type: "select",
        options: ["1", "2", "3", "4"],
        value: "1",
        name: "Split output",
      },
      splitPlayback: {
        type: "select",
        options: ["First", "All", "Mixed"],
        value: "First",
        name: "Split playback",
      },
    },
    onInput: run,
    actions: [
      {
        name: "Play Audio",
        action: async (element) => {
          if (element.getAttribute("data-playing")) {
            element.innerText = "Play Audio";
            element.removeAttribute("data-playing");
            stop();
          } else {
            element.innerText = "Stop Audio";
            element.setAttribute("data-playing", "true");
            const canvases = Array.from(output.querySelectorAll("canvas"));
            let sources: HTMLCanvasElement[] = [];

            if (values.splitPlayback === "First") {
              sources = [canvases[0]];
            } else if (values.splitPlayback === "All") {
              sources = canvases;
            } else if (values.splitPlayback === "Mixed") {
              sources = [...canvases].reverse();
            }

            const source = sources.length === 1 ? sources[0] : sources;
            const metadataSource = Array.isArray(source) ? source[0] : source;

            const metadata: StegaMetadata.StegaMetadata | null =
              StegaMetadata.decode({ source: metadataSource });
            section.querySelector(`[data-output="metadata"]`)!.innerHTML =
              JSON.stringify(metadata || {}, null, 2);
            if (
              !metadata ||
              metadata.type === StegaMetadata.StegaContentType.AUDIO
            ) {
              const audioBuffers = StegaCassette.decode({
                source,
                bitDepth: metadata?.bitDepth || defaults.bitDepth,
                channels: metadata?.channels || defaults.channels,
                encoding: metadata?.encoding || defaults.encoding,
                borderWidth: metadata?.borderWidth || defaults.borderWidth,
              });
              const audio = await playDecodedAudioBuffers({
                audioBuffers,
                audioContext,
                sampleRate: metadata?.sampleRate || defaults.sampleRate,
              });
              stop = () => audio.stop();
            }
          }
        },
      },
    ],
  });

  run(values);

  async function run(values: FormData) {
    const sampleRate = values.sampleRate;
    defaults.sampleRate = values.sampleRate;
    defaults.bitDepth = parseInt(values.bitDepth) as 8 | 16 | 24;
    defaults.encoding = values.encoding;
    defaults.borderWidth = values.borderWidth;
    defaults.channels = parseInt(values.channels) as 1 | 2;
    // defaults.encodeMetadata = values.encodeMetadata
    // defaults.aspectRatio = values.aspectRatio

    const splitOutput = parseInt(values.splitOutput);
    const sources = Array(splitOutput)
      .fill(0)
      .map((_, i) => (i % 2 === 0 ? source : source2));

    const result = StegaCassette.encode({
      source: splitOutput === 1 ? source : sources,
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
      aspectRatio:
        values.aspectRatio === "undefined"
          ? undefined
          : parseFloat(values.aspectRatio),
    });
    output.innerHTML = "";
    if (Array.isArray(result)) {
      result.forEach((r) => output.appendChild(r));
    } else {
      output.appendChild(result);
    }
  }
}
