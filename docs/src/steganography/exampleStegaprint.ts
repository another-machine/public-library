import { Stegaprint, Stegassette } from "../../../packages/amplib-steganography/src";
import { createForm } from "../createForm";

const ECC_OPTIONS = ["light", "none", "full"] as const;
const KEY_OPTIONS = ["none", "adjacent", "mirror-x", "poles", "rotate"] as const;
const MODULATE_OPTIONS = ["qim", "pair"] as const;
const TRAVERSAL_OPTIONS = [
  "bayer", "fisher-yates", "raster", "hilbert", "spiral", "radial", "center-out",
] as const;

type FormData = {
  message: string;
  quality: number;
  passes: number;
  modulate: string;
  keymap: string;
  traversal: string;
  ecc: string;
};

/**
 * The demonstration is the comparison, not the encode.
 *
 * Stegaprint surviving a JPEG round trip is only interesting next to Stegassette
 * not surviving one — and Stegassette does not fail gradually here, it fails
 * completely, because its header lives in an alpha channel JPEG does not have.
 * Both formats encode the same message into the same picture and both go through
 * the same real canvas.toBlob("image/jpeg").
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
  const headerBody = section.querySelector<HTMLElement>(
    '[data-output="header-table"] tbody'
  )!;

  const { values } = createForm<FormData>({
    form,
    inputs: {
      message: {
        name: "message",
        type: "text",
        value: "A print survives being passed around.",
      },
      // Below the declared floor of 75 on purpose — the controls should reach
      // the range where the format is supposed to start losing.
      quality: { name: "quality", type: "range", value: 75, min: 40, max: 95, step: 5 },
      passes: { name: "passes", type: "range", value: 1, min: 1, max: 3, step: 1 },
      modulate: {
        name: "modulate",
        type: "select",
        options: [...MODULATE_OPTIONS],
        value: "qim",
      },
      keymap: {
        name: "keymap",
        type: "select",
        options: [...KEY_OPTIONS],
        value: "none",
      },
      traversal: {
        name: "traversal",
        type: "select",
        options: [...TRAVERSAL_OPTIONS],
        value: "bayer",
      },
      ecc: { name: "ecc", type: "select", options: [...ECC_OPTIONS], value: "light" },
    },
    onInput: run,
    actions: [],
  });

  // Declared before the first run(): when the image is already cached,
  // source.complete is true and run() is called synchronously from here, which
  // reaches `generation` in its temporal dead zone if it is declared below.
  // First load takes the async onload path and hides the bug; a reload does not.
  let generation = 0;

  source.onload = () => run(values);
  if (source.complete && source.naturalWidth) run(values);

  /**
   * createForm only fills [data-value] spans inside the form's own parent, and
   * two of this section's code samples sit outside that sidebar. Fill every span
   * in the section instead, so a sample never renders with a hole where a value
   * should be.
   */
  function fillValues(data: FormData) {
    for (const [key, value] of Object.entries(data)) {
      section
        .querySelectorAll<HTMLElement>(`[data-value="${key}"]`)
        .forEach((el) => (el.innerText = String(value)));
    }
  }

  function showHeader(rows: Array<[string, string]>) {
    headerBody.replaceChildren(
      ...rows.map(([k, v]) => {
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.textContent = k;
        const td = document.createElement("td");
        td.textContent = v;
        tr.append(th, td);
        return tr;
      })
    );
  }

  async function run(data: FormData) {
    try {
      await runInner(data);
    } catch (err) {
      out.innerText = `// example failed — ${err}`;
      showHeader([["error", String(err)]]);
    }
  }

  async function runInner(data: FormData) {
    if (!source.naturalWidth) return;
    // Every control re-encodes, and an encode is slow enough that a dragged
    // slider can land results out of order. Only the newest run may paint.
    const mine = ++generation;
    fillValues(data);

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
        modulate: data.modulate as "qim" | "pair",
        keymap: data.keymap as Stegaprint.StgpHeader["keymap"],
        traversal: data.traversal as Stegaprint.StgpHeader["traversal"],
        ecc: data.ecc as "light" | "none" | "full",
      });
    } catch (err) {
      // pair needs a key block and keyless has none — a pairing the controls
      // allow, so say what happened rather than showing a dead figure.
      out.innerText = `// encode failed — ${err}`;
      showHeader([["error", String(err)]]);
      return;
    }
    const encodeMs = Math.round(performance.now() - t0);
    if (mine !== generation) return;

    printSlot.querySelector("canvas")?.remove();
    printSlot.appendChild(encoded);

    const cap = Stegaprint.capacityFor(encoded.width, encoded.height, {
      modulate: data.modulate as "qim" | "pair",
      keymap: data.keymap as Stegaprint.StgpHeader["keymap"],
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
      const recovered = entry
        ? new TextDecoder().decode(entry.data).replace(/\0+$/, "")
        : "";
      const exact = recovered === data.message;
      out.innerText = [
        `// corner marks ${registered ? "registered" : "DID NOT register"}` +
          `, payload crc ${entry?.crcOk ? "ok" : "mismatch"}` +
          `, encoded in ${encodeMs}ms`,
        exact
          ? "// recovered exactly"
          : "// did not round-trip — the payload is damaged, not absent",
        JSON.stringify(recovered),
      ].join("\n");

      showHeader([
        ["magic / version", `STGP v${header.version}`],
        ["canvas", `${header.blocksWide}×${header.blocksHigh} blocks`],
        ["border", `${header.border} blocks (${header.border * 8}px), header only`],
        ["modulate", header.modulate],
        ["keymap", header.keymap + (header.keymap === "none" ? " (keyless)" : "")],
        ["traversal", header.traversal],
        ["alphabet", `M=${header.M} (${Math.log2(header.M)} bits per carrier)`],
        ["carriers", `zig-zag [${header.carriers.join(", ")}]`],
        ["ecc", header.ecc],
        ["quality floor", `Q${header.qualityFloor}`],
        ["entries", String(header.entryCount)],
        ["symbols", `${header.symbolCount} × ${header.repeat} copies`],
        ["corner marks", registered ? "registered" : "not found"],
      ]);
    } catch (err) {
      out.innerText = `// decode failed — ${err}`;
      showHeader([["error", String(err)]]);
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
