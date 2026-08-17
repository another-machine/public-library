import { Stegassette } from "../../../packages/amplib-steganography/src";
import { createForm } from "../createForm";

const ASPECT_OPTIONS = ["source", "1:1", "4:3", "16:9", "3:4", "9:16"] as const;
type AspectOption = (typeof ASPECT_OPTIONS)[number];

function parseAspect(opt: AspectOption): number | undefined {
  if (opt === "source") return undefined;
  const [w, h] = opt.split(":").map(Number);
  return w / h;
}

type FormData = {
  message: string;
  combine: string;
  keymap: string;
  traversal: string;
  direction: "out" | "in";
  fit: "compact" | "shape";
  border: number;
  aspectRatio: AspectOption;
};

export default async function example({
  onResult,
}: {
  onResult: (canvas: HTMLCanvasElement) => void;
}) {
  const section = document.getElementById("example-stegassette-text")!;
  const source = section
    .querySelector("figure:nth-of-type(1)")!
    .querySelector("img")!;
  const output = section.querySelector("figure:nth-of-type(2)")!;
  const form = section.querySelector("form")!;
  const decodeOutput = section.querySelector<HTMLElement>(
    '[data-output="decode-text"]'
  )!;

  const { values, setFieldHidden } = createForm<FormData>({
    form,
    inputs: {
      // Long enough that the encode has some visible structure — the canvas is
      // sized by the payload, so "hi" would produce a handful of pixels.
      message: {
        name: "message",
        type: "text",
        value: "A stegassette is sized by what it carries.",
      },
      // All 11, deliberately. Every combine round-trips the payload exactly —
      // LOSSLESS_COMBINES is about whether the *cover* survives, not the bytes.
      // A keyless keymap narrows this at run time (see run()), because the ops
      // that rewrite the key pixel have nowhere to write.
      combine: {
        name: "combine",
        type: "select",
        options: [...Stegassette.COMBINE_NAMES],
        value: "xor",
      },
      keymap: {
        name: "keymap",
        type: "select",
        options: [...Stegassette.KEYMAP_NAMES],
        value: "adjacent",
      },
      traversal: {
        name: "traversal",
        type: "select",
        // center-out is omitted: it's superseded by radial and kept in the
        // package only so old decodes still work, not as something to encode
        // with.
        options: Stegassette.TRAVERSAL_NAMES.filter(
          (name) => name !== "center-out"
        ),
        value: "raster",
      },
      // Only "radial" reads this. The other eight ignore it, and the descriptor
      // only carries it for radial, so leaving it set costs nothing.
      direction: {
        name: "direction",
        type: "select",
        options: ["out", "in"],
        value: "out",
        // Shown by run() when the traversal is radial; hidden here so the first
        // paint matches rather than flashing a control that is about to go.
        hidden: true,
      },
      // Sizing, not encoding: "shape" enlarges the canvas so the payload ends
      // at the traversal's own declared boundary — radial's inscribed ellipse,
      // a 4/π canvas — instead of the corners. It is not in the header — the
      // decoder reads the dimensions off the image.
      fit: {
        name: "fit",
        type: "select",
        options: ["compact", "shape"],
        value: "compact",
        hidden: true,
      },
      border: { name: "border", type: "number", value: 1, min: 1 },
      aspectRatio: {
        name: "aspectRatio",
        type: "select",
        options: [...ASPECT_OPTIONS],
        value: "source",
      },
    },
    onInput: run,
    actions: [],
  });

  source.onload = () => run(values);
  if (source.complete && source.naturalWidth) run(values);

  function run(data: FormData) {
    if (!source.naturalWidth) return;

    // `direction` is the one param radial reads, so the control follows it.
    // `fit: "shape"` sizes the canvas to the traversal's declared boundary
    // (TRAVERSAL_SHAPE) — for a traversal that declares none it means the
    // same thing as compact, so the control only shows where it changes
    // anything.
    const radial = data.traversal === "radial";
    const shaped = data.traversal in Stegassette.TRAVERSAL_SHAPE;
    setFieldHidden("direction", !radial);
    setFieldHidden("fit", !shaped);

    // A keyless keymap has no key pixel, so the combines that stash bits there
    // would throw. Fall back to xor and say so, rather than showing an error
    // for a pairing the controls let you pick.
    const keyless = Stegassette.isKeylessKeymap(
      data.keymap as Stegassette.KeymapName
    );
    const combine =
      keyless && Stegassette.KEY_MOD[data.combine as Stegassette.CombineName]
        ? "xor"
        : (data.combine as Stegassette.CombineName);
    const coerced = combine !== data.combine;

    section
      .querySelectorAll<HTMLElement>(`[data-value="aspectRatio"]`)
      .forEach((el) => {
        const ratio = parseAspect(data.aspectRatio);
        el.innerText = ratio === undefined ? "undefined" : ratio.toFixed(4);
      });

    let encoded: HTMLCanvasElement;
    try {
      encoded = Stegassette.encode({
        source,
        entries: [
          {
            mimetype: "text/plain",
            name: "message.txt",
            data: data.message,
          },
        ],
        combine,
        keymap: data.keymap as Stegassette.KeymapName,
        traversal: data.traversal as Stegassette.TraversalName,
        params: radial ? { direction: data.direction } : undefined,
        // Dropped alongside its hidden code line: the sample then shows a call
        // with no fit, and this call means the same thing.
        fit: shaped ? data.fit : undefined,
        border: data.border,
        aspectRatio: parseAspect(data.aspectRatio),
      });
    } catch (err) {
      decodeOutput.innerText = `// encode failed — ${err}`;
      return;
    }

    // Replace only the previous canvas, not the whole figure — a figcaption
    // belongs to the markup and must survive a re-encode.
    output.querySelector("canvas")?.remove();
    output.appendChild(encoded);
    onResult(encoded);

    // The image decodes itself: every option above is recovered from the STGC
    // header in the border, so decode takes no arguments beyond the source.
    let entries: Stegassette.DecodedEntry[];
    let opts: Stegassette.StgcOpts;
    try {
      ({ entries, opts } = Stegassette.decode({ source: encoded }));
    } catch (err) {
      decodeOutput.innerText = `// decode failed — ${err}`;
      return;
    }
    const entry = entries[0];
    if (!entry) {
      decodeOutput.innerText = "// decode recovered no entries";
      return;
    }
    const recovered = new TextDecoder().decode(entry.data);
    decodeOutput.innerText = [
      `// ${entry.name} (${entry.mimetype}), ${entry.data.length} bytes`,
      `// header: ${opts.combine} / ${opts.keymap} / ${opts.traversal}, border ${opts.borderWidth}`,
      `// ${encoded.width}x${encoded.height}px` +
        (keyless
          ? " — keyless: every interior pixel carries payload, so no cover to recover"
          : " — half the interior is key pixels, which is what makes the cover recoverable"),
      ...(coerced
        ? [`// "${data.combine}" rewrites the key pixel; keyless has none, so xor was used`]
        : []),
      // Say so rather than printing mangled text as if it were the answer. A
      // lossless combine can still lose bytes if the keymap hands two data
      // pixels the same key pixel — the second write destroys what the first
      // stashed there. See the note under this block.
      ...(recovered === data.message
        ? []
        : ["// did not round-trip at this keymap — see the note below"]),
      JSON.stringify(recovered),
    ].join("\n");
  }
}
