import { Stegaprint, Stegassette } from "../../../packages/amplib-steganography/src";
import { createForm } from "../createForm";

const ECC_OPTIONS = ["light", "none", "full"] as const;
const KEY_OPTIONS = ["adjacent", "none"] as const;

type FormData = {
  message: string;
  quality: number;
  passes: number;
  keymap: string;
  ecc: string;
};

/**
 * The demonstration is the comparison, not the encode.
 *
 * Stegaprint surviving a JPEG round trip is only interesting next to Stegassette
 * not surviving one — and Stegassette does not fail gradually here, it fails
 * completely, because its header lives in an alpha channel JPEG does not have.
 * Both formats encode the same message into the same picture and both go through
 * the same real `canvas.toBlob("image/jpeg")`.
 */
export default async function example() {
  const section = document.getElementById("example-stegaprint")!;
  const source = section.querySelector("img")!;
  // The data-figure hooks are the canvas slots *inside* each figure, so the
  // caption is a sibling of the slot rather than a child of it.
  const printSlot = section.querySelector<HTMLElement>('[data-figure="print"]')!;
  const jpegSlot = section.querySelector<HTMLElement>('[data-figure="jpeg"]')!;
  const jpegCaption = jpegSlot
    .closest("figure")!
    .querySelector<HTMLElement>("figcaption")!;
  const form = section.querySelector("form")!;
  const out = section.querySelector<HTMLElement>('[data-output="stegaprint"]')!;
  const compare = section.querySelector<HTMLElement>('[data-output="compare"]')!;
  const capacityOut = section.querySelector<HTMLElement>('[data-output="capacity"]')!;

  const { values } = createForm<FormData>({
    form,
    inputs: {
      message: {
        name: "message",
        type: "text",
        value: "A print survives being passed around.",
      },
      // 0.4 is below the profiled floor on purpose — the format declares Q75 and
      // the control lets you go under it, which is where the errors start.
      quality: { name: "quality", type: "range", value: 75, min: 40, max: 95, step: 5 },
      passes: { name: "passes", type: "range", value: 1, min: 1, max: 3, step: 1 },
      keymap: { name: "keymap", type: "select", options: [...KEY_OPTIONS], value: "adjacent" },
      ecc: { name: "ecc", type: "select", options: [...ECC_OPTIONS], value: "light" },
    },
    onInput: run,
    actions: [],
  });

  source.onload = () => run(values);
  if (source.complete && source.naturalWidth) run(values);

  let generation = 0;

  async function run(data: FormData) {
    if (!source.naturalWidth) return;
    // Every control re-encodes, and an encode is slow enough that a dragged
    // slider can land results out of order. Only the newest run may paint.
    const mine = ++generation;

    const entries = [
      {
        type: Stegaprint.EntryType.Text,
        name: "message.txt",
        data: new TextEncoder().encode(data.message),
      },
    ];

    let encoded: HTMLCanvasElement;
    const t0 = performance.now();
    try {
      encoded = Stegaprint.encode({
        source,
        entries,
        keymap: data.keymap as "adjacent" | "none",
        ecc: data.ecc as "light" | "none" | "full",
      });
    } catch (err) {
      out.innerText = `// encode failed — ${err}`;
      return;
    }
    const encodeMs = Math.round(performance.now() - t0);
    if (mine !== generation) return;

    printSlot.querySelector("canvas")?.remove();
    printSlot.appendChild(encoded);

    const cap = Stegaprint.capacityFor(encoded.width, encoded.height, {
      keymap: data.keymap as "adjacent" | "none",
      ecc: data.ecc as "light" | "none" | "full",
    });
    capacityOut.innerText =
      `// ${encoded.width}×${encoded.height}px, border ${cap.border} blocks — ` +
      `holds ${(cap.bytes / 1024).toFixed(1)}KB, carrying ${data.message.length}B`;

    // The actual JPEG. Everything above this line is preparation.
    const { canvas: jpeged, bytes } = await Stegaprint.jpegRoundTrip(
      encoded,
      data.quality / 100,
      data.passes
    );
    if (mine !== generation) return;

    jpegSlot.querySelector("canvas")?.remove();
    jpegSlot.appendChild(jpeged);
    jpegCaption.innerText =
      `JPEG q${data.quality}` +
      (data.passes > 1 ? ` ×${data.passes}` : "") +
      ` — ${(bytes[bytes.length - 1] / 1024).toFixed(0)}KB`;

    try {
      const { entries: got, header, registered } = Stegaprint.decode({ source: jpeged });
      const entry = got[0];
      const recovered = entry ? new TextDecoder().decode(entry.data).replace(/\0+$/, "") : "";
      const exact = recovered === data.message;
      out.innerText = [
        `// header: ${header.modulate} / ${header.keymap} / ${header.traversal}, ` +
          `M=${header.M}, carriers [${header.carriers.join(",")}], ecc ${header.ecc}`,
        `// corner marks ${registered ? "registered" : "DID NOT register"}` +
          `, payload crc ${entry?.crcOk ? "ok" : "mismatch"}` +
          `, encoded in ${encodeMs}ms`,
        exact
          ? "// recovered exactly"
          : "// did not round-trip — the payload is damaged, not absent",
        JSON.stringify(recovered),
      ].join("\n");
    } catch (err) {
      out.innerText = `// decode failed — ${err}`;
    }

    // ---- the same message, the same picture, the lossless format
    let cassetteLine: string;
    try {
      const cassette = Stegassette.encode({
        source,
        entries: [{ mimetype: "text/plain", name: "message.txt", data: data.message }],
      });
      const { canvas: cassetteJpeg } = await Stegaprint.jpegRoundTrip(
        cassette,
        data.quality / 100,
        data.passes
      );
      if (mine !== generation) return;
      try {
        const { entries: got } = Stegassette.decode({ source: cassetteJpeg });
        const recovered = new TextDecoder().decode(got[0]?.data ?? new Uint8Array());
        cassetteLine =
          recovered === data.message
            ? `// recovered exactly — unexpected; STGC is not built for this channel`
            : `// decoded, but the bytes are wrong: ${JSON.stringify(recovered.slice(0, 48))}`;
      } catch (err) {
        cassetteLine = `// ${err}`;
      }
    } catch (err) {
      cassetteLine = `// encode failed — ${err}`;
    }
    if (mine !== generation) return;
    compare.innerText = cassetteLine;
  }
}
