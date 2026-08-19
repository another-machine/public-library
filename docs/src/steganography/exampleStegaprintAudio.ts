import {
  Stegaprint,
  loadAudioBuffersFromAudioUrl,
  playDecodedAudioBuffers,
} from "../../../packages/amplib-steganography/src";
import { createForm } from "../createForm";

/**
 * No 2000 here, though the format handles it and §3.1's cheapest 30 seconds
 * assumes it: OfflineAudioContext, which the resampling helper uses, refuses any
 * rate below 3000. That is a Web Audio limit rather than a Stegaprint one — the
 * same clip resamples and round-trips fine at 2 kHz outside the browser.
 */
const RATE_OPTIONS = ["4000", "8000", "11025"] as const;
const BITS_OPTIONS = ["4", "8", "16"] as const;

type FormData = {
  sampleRate: string;
  bitsPerSample: string;
  ecc: string;
  seconds: number;
  quality: number;
};

/**
 * The same mp3 the Stegassette demo uses, through STGP and a real JPEG.
 *
 * Two things make this slower than the text demo and shape how it is written:
 * an encode of a second of audio is a canvas of a million-odd pixels and takes
 * seconds, and decoding the mp3 at a given rate is worth doing once rather than
 * per keystroke. So the resampled audio is cached by rate, and every run is
 * generation-guarded — a dragged slider queues several and only the last may
 * paint.
 */
export default async function example() {
  const section = document.getElementById("example-stegaprint-audio")!;
  const sourceImg = section.querySelector<HTMLImageElement>("img")!;
  const slot = section.querySelector<HTMLElement>('[data-figure="audio"]')!;
  const caption = section.querySelector<HTMLElement>('[data-caption="audio"]')!;
  const out = section.querySelector<HTMLElement>('[data-output="audio"]')!;
  const form = section.querySelector("form")!;
  // getAttribute, not .src — Parcel rewrites this to a hashed filename.
  const audioUrl = section.querySelector("audio")!.getAttribute("src")!;
  const audioContext = new AudioContext();

  let generation = 0;
  let cachedRate = "";
  let cachedChannel: Float32Array | null = null;
  /** Trimmed source and what came back out of the JPEG, for the two buttons. */
  let sourceClip: Float32Array | null = null;
  let recovered: Stegaprint.ParsedAudioEntry | null = null;
  let playing: AudioBufferSourceNode | null = null;

  function play(channels: Float32Array[], sampleRate: number) {
    playing?.stop();
    playDecodedAudioBuffers({ audioBuffers: channels, audioContext, sampleRate })
      .then((node) => (playing = node))
      .catch((err) => (out.innerText = `// playback failed — ${err}`));
  }

  const { values } = createForm<FormData>({
    form,
    inputs: {
      sampleRate: {
        name: "sampleRate",
        type: "select",
        options: [...RATE_OPTIONS],
        value: "4000",
      },
      bitsPerSample: {
        name: "bitsPerSample",
        type: "select",
        options: [...BITS_OPTIONS],
        value: "4",
      },
      // "full" rather than the library default of "light", because this demo
      // runs against the browser's own JPEG encoder and the Δ profile was
      // measured against jpeg-js. Chrome is harsher: at "light" and repeat 1,
      // three samples in 24000 come back wrong — inaudible as noise, audible as
      // three faint clicks. "full" takes that to zero. Switch it back to hear
      // them; that is the control doing its job, not the demo failing.
      ecc: {
        name: "ecc",
        type: "select",
        options: ["full", "light", "none"],
        value: "full",
      },
      // Capped at 6: eight seconds of 8-bit 8 kHz is a 1900px canvas and the
      // encode is already seconds of main-thread DCT at that size.
      // Defaults to the whole 30 seconds at the cheap end of the ladder, which
      // is the claim worth showing on load: half a minute of audio out of a
      // JPEG. 4 kHz 4-bit puts that in 10 megapixels and under three seconds of
      // encoding; 8 kHz 8-bit would want 40 and is refused below.
      seconds: { name: "seconds", type: "range", value: 30, min: 1, max: 30, step: 1 },
      quality: { name: "quality", type: "range", value: 75, min: 40, max: 95, step: 5 },
    },
    onInput: run,
    actions: [
      {
        name: "play source",
        action: () =>
          sourceClip && play([sourceClip], Number(values.sampleRate)),
      },
      {
        name: "play from the jpeg",
        action: () =>
          recovered && play(recovered.channels, recovered.sampleRate),
      },
    ],
  });

  sourceImg.onload = () => run(values);
  if (sourceImg.complete && sourceImg.naturalWidth) run(values);

/**
 * Pixels this demo will encode before it refuses.
 *
 * Encoding is main-thread DCT over every block, measured at roughly 0.7s per
 * megapixel here, and the planes are Float64 — a 40-megapixel canvas is about a
 * gigabyte of them plus the copies the convergence loop makes. Thirty seconds of
 * 8 kHz 8-bit at ecc "full" asks for exactly that, so the combination is refused
 * with the arithmetic rather than attempted and hung.
 */
  const PIXEL_BUDGET = 12_000_000;
  /** Rough encode cost, from measuring this page: ~0.7s per megapixel. */
  const SECONDS_PER_MPX = 0.7;

  /**
   * Smallest canvas at the source's aspect whose capacity holds `bytes`.
   *
   * Sizing runs the other way inside encode — the payload picks the canvas — so
   * this reproduces the answer ahead of time to decide whether to start at all.
   */
  function canvasFor(bytes: number, ecc: string, aspect: number) {
    let h = 256;
    for (let i = 0; i < 200; i++) {
      const w = Math.round(h * aspect);
      if (
        Stegaprint.capacity(w, h, { ecc: ecc as "none" | "light" | "full" })
          .bytes >= bytes + 64
      )
        return { w, h, mpx: (w * h) / 1e6 };
      h = Math.round(h * 1.08);
    }
    return null;
  }

  function fillValues(data: FormData) {
    for (const [key, value] of Object.entries(data)) {
      section
        .querySelectorAll<HTMLElement>(`[data-value="${key}"]`)
        .forEach((el) => (el.innerText = String(value)));
    }
  }

  async function run(data: FormData) {
    try {
      await runInner(data);
    } catch (err) {
      out.innerText = `// failed — ${err}`;
      caption.innerText = "failed";
    }
  }

  async function runInner(data: FormData) {
    if (!sourceImg.naturalWidth) return;
    const mine = ++generation;
    fillValues(data);
    caption.innerText = "encoding…";

    const rate = Number(data.sampleRate);
    const bits = Number(data.bitsPerSample) as Stegaprint.AudioBits;

    if (cachedRate !== data.sampleRate || !cachedChannel) {
      const channels = await loadAudioBuffersFromAudioUrl({
        url: audioUrl,
        audioContext,
        channels: 1,
        sampleRate: rate,
      });
      if (mine !== generation) return;
      cachedChannel = channels[0];
      cachedRate = data.sampleRate;
    }

    const clip = cachedChannel.slice(0, rate * data.seconds);
    sourceClip = clip;

    const entry = Stegaprint.buildAudioEntry({
      channels: [clip],
      sampleRate: rate,
      bitsPerSample: bits,
      name: "example.mp3",
    });

    const t0 = performance.now();
    const aspect = sourceImg.naturalWidth / sourceImg.naturalHeight;
    const est = canvasFor(entry.data.length, data.ecc, aspect);
    if (!est || est.mpx > PIXEL_BUDGET / 1e6) {
      caption.innerText = "too large to encode here";
      out.innerText = [
        `// ${data.seconds}s at ${rate}Hz ${bits}-bit is ` +
          `${(entry.data.length / 1024).toFixed(0)}KB, which needs ` +
          `${est ? est.mpx.toFixed(1) + " megapixels" : "more than this demo will size"} at ecc ${data.ecc}`,
        `// past the ${PIXEL_BUDGET / 1e6} megapixel budget this page encodes on the main thread.`,
        `// lower the rate or the depth, or drop ecc to "light" — that is the trade,`,
        `// not a limit of the format: duration is bought with fidelity.`,
      ].join("\n");
      return;
    }

    const encoded = Stegaprint.encode({
      source: sourceImg,
      entries: [entry],
      ecc: data.ecc as "light" | "full" | "none",
    });
    const encodeMs = Math.round(performance.now() - t0);
    if (mine !== generation) return;

    const { canvas, bytes } = await Stegaprint.jpegRoundTrip(
      encoded,
      data.quality / 100,
      1
    );
    if (mine !== generation) return;

    slot.querySelector("canvas")?.remove();
    slot.appendChild(canvas);
    caption.innerText =
      `${canvas.width}×${canvas.height} — JPEG q${data.quality}, ` +
      `${(bytes[0] / 1024).toFixed(0)}KB`;

    const { entries: got, header } = Stegaprint.decode({ source: canvas });
    const audio = Stegaprint.parseAudioEntry(got[0]);
    recovered = audio;

    // How far the recovered samples sit from the source, against the step the
    // chosen bit depth quantizes to. Within one step means the channel added
    // nothing the depth had not already thrown away.
    const step = 2 / ((1 << bits) - 1);
    let worst = 0;
    let damaged = 0;
    const n = Math.min(clip.length, audio.channels[0].length);
    for (let i = 0; i < n; i++) {
      const d = Math.abs(clip[i] - audio.channels[0][i]);
      if (d > step * 2) damaged++;
      if (d > worst) worst = d;
    }

    out.innerText = [
      `// ${(entry.data.length / 1024).toFixed(1)}KB of audio, ` +
        `${audio.channels[0].length} samples at ${audio.sampleRate}Hz ` +
        `${audio.bitsPerSample}-bit, written ${header.repeat}×, ` +
        `encoded in ${(encodeMs / 1000).toFixed(1)}s`,
      `// ${damaged} of ${n} samples damaged beyond the ${step.toFixed(4)} quantization step` +
        `, worst ${worst.toFixed(4)}`,
    ].join("\n");
  }
}
