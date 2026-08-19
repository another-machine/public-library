# Stegaprint — a JPEG-survivable sibling to Stegassette

Design plan. **Phases 0 and 1 are built** — `src/Stegaprint/`, with
`npm run measure` (the phase 0 rig) and `npm run verify` (the phase 1 criteria).
Phases 2–4 are not.

Where a measurement disagreed with something predicted here, the prediction is
struck and the measured value stands. Two of them mattered: §2.3 promoted the DC
coefficient to the best carrier and it is the worst, and §3's capacity table was
optimistic by 7–9% because it did not charge for the border ring.

STGC assumes pixels come back exactly as written. Stegaprint assumes they come
back *approximately* — through an unknown JPEG encoder, at an unknown quality,
possibly more than once. Everything follows from that one change.

A print is the metaphor: a picture made to be reproduced and passed around, which
survives copying, and which wears a visible mark saying what it is. Where a
cassette is private and exact, a print is public and worn — and it carries
whatever is printed on it, sound or text or anything else.

Two premises, both settled, both load-bearing throughout:

- **Robustness before convention.** Where an STGC convention makes the format
  fragile, it goes (§7.2, §6.3).
- **Visible is fine.** Not a cost the format pays but a constraint it never
  accepted — which is where roughly half the capacity in §3 comes from (§2.2,
  §2.3, §6.1).

---

## 1. What JPEG breaks in STGC

Five separate failures, each fatal on its own:

| # | Mechanism | What it kills |
| - | --------- | ------------- |
| 1 | **No alpha channel.** Baseline JFIF has none. | The entire header. `applyAlphaHeader` writes the border ring's alpha; JPEG discards it before quantization ever runs. Format becomes unreadable, not degraded. |
| 2 | **RGB → YCbCr.** | Channel plans. `r.additive+g.xor` presumes R, G and B are independently addressable. After the color transform each of them is a mix of all three planes. |
| 3 | **Chroma subsampling (4:2:0).** | Half of #2 again, worse. Cb/Cr are averaged over 2×2 pixels. Anything written per-pixel into chroma is gone before quantization. |
| 4 | **8×8 DCT + quantization.** | Every combine op. All eleven encode payload as a *difference between adjacent pixels* — and the data/key checkerboard puts that difference at exactly the Nyquist frequency, the highest-frequency content an 8×8 block can hold. It is the first thing the quantizer zeroes. |
| 5 | **Rounding.** | The remainder. Even at quality 100, RGB→YCbCr→RGB is not identity; ±1–2 per channel is normal. `xor` on a value that moved by 1 returns garbage, not a near-value. |

Note that #4 and #5 are different problems. #5 says "values move a little," which
is survivable with coarse quantization. #4 says "this specific spatial frequency
is deleted," which no amount of coarseness fixes — you have to stop using it.

So this is not a hardening pass on Stegassette. It is a sibling format that keeps
the vocabulary (entries, traversal, keymap, combine, channel plan, self-describing
header) and replaces the substrate underneath all of it.

---

## 2. The substrate

**Work in the block-DCT domain of the YCbCr planes, and embed with
quantization index modulation.**

Two sub-decisions worth being explicit about.

### 2.1 Pixel-domain embedding, not coefficient-domain

The tempting design is to write directly into a JPEG's quantized coefficients —
parse the entropy-coded stream, modify, re-encode. It gives exact control for
*that one file*, and it breaks completely the first time Instagram re-encodes with
a different quantization table.

Instead: compute the DCT ourselves, embed, invert, emit pixels (and then encode
those pixels to JPEG at a chosen quality). The embedding is defined against pixel
values, so it is agnostic to which encoder touches the file afterward. This is the
same stance §1.11 of the provisional description already takes — *"requires only
the ability to read and write pixel values"* — held one step further, into
"read and write pixel values approximately."

The cost is an iteration loop, see §10.2.

### 2.2 Quantization index modulation

For each carrier coefficient `c`, an embedding step `Δ`, and a symbol `s` drawn
from an alphabet of size `M`:

```
encode:  c' = Δ · round((c − d_s) / Δ) + d_s        where d_s = Δ·s/M
decode:  s  = round(M · frac(c / Δ))  mod M
```

The symbol survives any perturbation smaller than `Δ / 2M`. That is the whole
robustness story in one inequality, and it makes `Δ` the format's central dial —
the direct analog of "which combine op," except it is continuous and it trades
against something legible.

**Choosing Δ.** The JPEG quantizer at quality Q rounds coefficient *i* to a
multiple of `q_i(Q)`, so re-quantization moves it by at most `q_i/2`. Survival
needs `Δ/2M > q_i/2`, i.e. `Δ > M · q_i`. With margin:

```
Δ_i = 2 · M · q_i(Q_floor)
```

where `Q_floor` is the **declared quality floor** — the format states, in its own
header, the worst re-encode it claims to survive. `Δ` is derived from it, so the
decoder never needs to know Q; it reads Q_floor and recomputes.

Worked: standard luminance table, coefficient with `q₅₀ = 20`. At Q=75 the scale
factor is 0.5, so `q = 10`. With M=2 (one bit), `Δ = 40`. A DCT coefficient of
±40 spreads over its 64 pixels at basis amplitude ¼ — about ±10 levels peak in the
spatial domain. Visible as a faint block texture, in the same register as the
existing format's speckle. Acceptable.

At M=4 (two bits) the same floor needs `Δ = 80` — ±20 levels, clearly visible.

**Visibility is not a constraint on this format, so M=4 is the default.** That is
worth stating as a decision rather than a detail: the entire tension in §2.2 was
between robustness and invisibility, and removing the second term collapses it.
Two bits per carrier instead of one, at the same quality floor, for a cost the
format has already accepted elsewhere (§6.1). Capacity doubles.

M=8 (three bits, `Δ = 160`, ±40 levels) is the next rung and is probably a step
too far — at that amplitude the carrier stops reading as texture over the picture
and starts reading as a separate image competing with it. Worth *measuring* in
phase 0 rather than assuming, since "too far" is an aesthetic judgment and this
project may want it.

### 2.3 Carrier coefficient selection

Per 8×8 block, in zig-zag index order:

- **Index 0 (DC)** — ~~included~~ **excluded, by measurement.** Two drafts of
  this section were wrong in opposite directions. It was first excluded as too
  visible, then reinstated once visibility stopped being a constraint, on the
  reasoning that it has the finest quantization step and that a block mean is
  roughly what a downscale computes.

  Phase 0 says it is the *worst* carrier available. Measured p99 of |Δc| is 8.9
  against 3.5 for index 4 — it moves nearly three times as far as a mid-frequency
  coefficient — and it is the only index that degrades under chained re-encoding:
  20.75% symbol error through Q75×3, where every carrier finally chosen holds 0%.
  The reason is structural and should have been predictable: JPEG codes DC
  differentially across blocks (DPCM along the scan), so DC errors accumulate
  rather than staying local.

  The capacity claim that depended on it survives anyway, because seven AC
  carriers were available without it.
- **Indices 1–15** — the AC carrier set. Low enough to survive quantization, high
  enough not to read as blotches.
- **Index ≥ 16** — excluded. Quantized to zero at any realistic quality, and no
  amount of Δ fixes a coefficient whose step size exceeds its range.

Default carrier set: **zig-zag [2, 3, 4, 6, 7, 8, 12]** — seven AC coefficients,
at M=4, for 14 bits per block. Chosen by scoring every index 0–20 through Q75,
Q75 chained three times, and Q60; these survive all of them at 0%. The exact
subset is a header parameter (`carriers`), tunable per image without a format
change.

### 2.4 Planes, not channels

The channel plan becomes a **plane plan** over Y / Cb / Cr:

| plane | block covers | quant table | verdict |
| ----- | ------------ | ----------- | ------- |
| `y`   | 8×8 px | luminance, fine | the default and the workhorse |
| `cb`, `cr` | 16×16 px under 4:2:0 | chroma, much coarser | ¼ the blocks, ~3× the Δ — a bad capacity deal |

Chroma is not worth it for capacity. It is worth it for **look**: payload in
chroma reads as colored block noise rather than luminance texture, which is a
distinct aesthetic. Offer it, don't default to it.

One cliff to document: many pipelines use 4:4:4 at high quality and switch to
4:2:0 below ~Q90. A chroma-carrying image that survives a Q95 re-encode can fail
a Q85 one for reasons that have nothing to do with Δ.

---

## 3. Capacity — the honest headline

This should be the first thing anyone reads, because it reframes what the format
is *for*.

```
blocks         = W·H / 64
data blocks    = blocks       (keyless)  or  blocks/2  (keyed checkerboard)
bits per block = 7 carriers × 2 bits = 14      (DC + 6 AC, M=4)
raw bytes      ≈ W·H / 73     (keyed)      W·H / 37  (keyless)
at ecc "light" ≈ W·H / 97     (keyed)      W·H / 49  (keyless)
```

**≈ 19 KB per megapixel at the defaults**, which are keyless — see below. A
keyed layout halves that to ≈ 9 KB and is only needed by `pair`.
Against Stegassette's ≈ 1.5 MB per megapixel that is roughly **160× less**.

Measured against the built format (`npm run verify` §4), with the predictions
this document made before it existed:

| Image | keyed | (predicted) | keyless | (predicted) |
| ----- | ----- | ----------- | ------- | ----------- |
| 1024² (1 Mpx) | **9 KB** | 11 | **19 KB** | 21 |
| 1600² (2.6 Mpx) | **24 KB** | 26 | **47 KB** | 53 |
| 2048² (4.2 Mpx) | **39 KB** | 43 | **78 KB** | 86 |
| 4096² (17 Mpx) | **160 KB** | 172 | **321 KB** | 344 |

The 7–9% shortfall is the border ring, which the arithmetic above never charged
for. It is a fixed ~1000 blocks (§6.1: 40 header bytes × 8 × 3 repeats, plus
corner marks), so it costs proportionally less as the canvas grows — 9% of a
1024² and 2% of a 4096².

### 3.1 Audio: rate and depth are the real dial

The original ask allowed limiting what can be carried, and audio is where that
pays. Time is capacity ÷ bitrate, and **bitrate is two independent knobs**:

| depth × rate | bytes/s | character |
| ------------ | ------- | --------- |
| 8-bit 8 kHz | 8000 | telephone |
| 8-bit 4 kHz | 4000 | muffled, AM-radio band |
| 4-bit 8 kHz | 4000 | full band, audible quantization hiss |
| 4-bit 4 kHz | 2000 | lo-fi, speech clearly intelligible |
| 4-bit 2 kHz | 1000 | texture, rhythm and pitch survive; words barely |

4-bit is a natural fit rather than a compromise here: at M=4 a sample is exactly
two symbols, and Gray coding (§9.1) is trivial over 16 levels.

Duration at those bitrates:

Recomputed from the measured capacities above, not the predicted ones:

| | 8 kHz/8b | 4 kHz/8b | 4 kHz/4b | 2 kHz/4b |
| --- | --- | --- | --- | --- |
| 1600² keyed | 3.0 s | 6.0 s | 12 s | 24 s |
| 2048² keyed | 4.9 s | 9.8 s | 20 s | **39 s** |
| 2048² keyless | 9.8 s | 20 s | 39 s | 78 s |
| 4096² keyless | 40 s | 80 s | 2.7 min | **5.4 min** |

That last cell changes what the format is for. "A few seconds of audio" was the
honest headline two drafts ago; **a whole lo-fi song in a JPEG that survives being
posted** is a different proposition, and it is reachable at poster dimensions
without any new mechanism — only by spending the capacity on duration instead of
fidelity.

The sound at 2 kHz / 4-bit is not incidental to this. It is a specific, coherent
lo-fi — closer to a worn tape or a voice through a wall than to a compressed file
— and it sits naturally in a family whose other member is named after a cassette.

### 3.2 The payload menu

- **Text** — a poem, lyrics, a message, a URL, a key. Comfortable at any size.
- **Structured data** — JSON, a manifest, credentials, a pointer. Comfortable.
- **Audio** — seconds to minutes, depending on how much fidelity you spend
  (§3.1). A loop, a verse, a voice memo, or a whole track at 2 kHz.
- **Still not feasible** — a nested full-resolution image, a website, an album of
  separate tracks.

### 3.3 The hybrid entry

Downgraded from "probably the most valuable single feature" — at 43 seconds of
audio in a 2048² image it is no longer the only way to ship something substantial.
It remains the right answer for anything genuinely large:

> The JPEG carries a short manifest — title, artwork hash, a URL, and a
> decryption key. The full payload lives at that URL as a real Stegassette PNG.
> The JPEG survives Instagram; the link recovers the album.

Cheap to build, uses the capacity that actually exists, and makes the two formats
a system rather than alternatives. Worth designing the entry mimetype for
deliberately (`application/vnd.stegassette.pointer+json` or similar).

---

## 4. What carries over from STGC unchanged

More than expected. This is where the "as feature-rich as the lossless" ambition
gets cheap.

### 4.1 Traversals — all ten, verbatim

`getPathIndices(W, H, name, params, keyless)` in `traversal.ts` is a pure function
over a grid with an `isDataPixel` checkerboard filter. It has no idea its cells
are pixels. Feed it **block** dimensions and every traversal works untouched:
raster, boustrophedon, spiral, angle, fisher-yates, center-out, hilbert, polar,
bayer, radial.

Zero conceptual work, full parity. Extract to `src/shared/` and both formats
import it.

One asymmetry: the STGP header carries no traversal params beyond `seed`, so
`radial` is always `direction=out` here and `spiral` always clockwise. Encode and
decode agree because neither side can ask for the other — but a future param
worth exposing needs a header field, not just a plumbed option. `TRAVERSALS` in
`Stegaprint/header.ts` must stay in step with Stegassette's `TRAVERSAL_NAMES` by
appending only: STGP stores the **index**, so a name missing from the list packs
as 0 and the decoder reads the payload back in the wrong order.

### 4.2 Keymaps — all seven, at block granularity

Same story. `keymap.ts` maps `(dx, dy, IW, IH)` → key coordinates. At block
granularity: `adjacent`, `poles`, `mirror-x`, `mirror-y`, `offset`, `rotate`,
`none`. A key *block* supplies the reference; a checkerboard of blocks is held
back exactly as a checkerboard of pixels is today.

The keyless/keyed capacity split (§3) is identical in shape to STGC's.

### 4.3 The audio pipeline, and everything above the container

`pcm.ts`, `audio.ts`, `audioPrep.ts`, `collection.ts`, `wav.ts` and `geometry.ts`
are format-agnostic and carry over untouched. So do the `Entry` / `DecodedEntry`
types — the *concept* of an entry is shared even though its serialization is not.

That means a payload can be built once and sent through either container, which is
the right relationship between the two formats.

**`entries.ts` is the exception and does not carry over.** Its variable-length
record layout is precisely what makes the container fail catastrophically under
noise (§7.1), so Stegaprint gets its own serialization with fixed-width records.
Same `Entry` in, same `DecodedEntry` out, different bytes in between.

---

## 5. What is genuinely new

### 5.1 Modulation ops — the analog of combine ops

STGC's combine op maps `(payload byte, key value) → pixel value`. Stegaprint's
modulation op maps `(payload symbol, key value) → coefficient bin`. Same slot in
the architecture, same descriptor position, different mathematics.

| name | mechanism | robustness | notes |
| ---- | --------- | ---------- | ----- |
| `qim` | plain dither modulation, key = 0 | baseline | the only option when keyless |
| `dither` | key block's coefficient selects the dither offset | baseline | the self-keying analog |
| `parity` | sign of `c_a − c_b`, two coefficients in one block | **high** | immune to per-block gain |
| `pair` | difference of the same coefficient across data/key block | **high** | survives global tone curves |
| `rank` | ordering of *k* coefficients carries `log₂(k!)` bits | **highest** | immune to any monotone transform |
| `spread` | ± sign on a pseudorandom chip sequence over N coefficients | **highest** | very low capacity, very hard to kill |

The `parity` / `pair` / `rank` family is the real spiritual successor to what STGC
already does. Its whole idea is that payload lives in a *relation between two
values*, never an absolute — and that is precisely why it survives: a global
brightness shift, a tone curve, or a re-quantization moves both members of the
pair the same direction. **The lossless format's differential paired-pixel core
becomes a differential paired-coefficient core, and the property that made it
elegant is the property that makes it robust.** That through-line is worth
building the documentation around.

### 5.2 Perceptual masking

`Δ` need not be uniform. High-variance blocks (texture, foliage, noise) hide a
much larger `Δ` than flat blocks (sky, skin, gradients) — so scale it per block by
local energy and you buy either invisibility or robustness, choice of.

The constraint is that the decoder must derive the same scale factor without being
told. Do it from the *received* block's own DC and lowest-AC energy, which is
robust enough to agree across a JPEG round trip. Standard trick, and it needs a
hysteresis band so a block near a threshold doesn't flip classification.

```
mask: "flat" | "adaptive"
```

`flat` for predictability and for the test harness; `adaptive` for real images.

### 5.3 Defaults, chosen for robustness

Where STGC's defaults were chosen for compactness and continuity with earlier
output, these are chosen for survival. Every one of them differs from the
equivalent STGC default, and each difference is deliberate:

| parameter | STGC default | Stegaprint default | why |
| --------- | ------------ | ------------------ | --- |
| header placement | border alpha | **fiducial border** | §6.1 — must not degrade |
| header format | ASCII descriptor | **fixed-width binary** | §6.3 — no parse state |
| traversal | `raster` | **`bayer`** | §7.4 — interleaves bursts, free |
| modulation / combine | `xor` | **`qim`** | §5.1 — `pair` is built but unmeasured; see §12 |
| keymap | `adjacent` | **follows the op** | keyless for `qim`, `adjacent` for `pair` — see below |
| repeat | — | **`auto`** | §7.5 — spare interior becomes redundancy |
| planes / channels | `rgb` packed | **`y` only** | §2.4 — chroma is a bad trade |
| carriers | all 3 channels | **DC + 6 AC** | §2.3 — DC is the most robust of all |
| alphabet | 8-bit bytes | **M=4, Gray** | §2.2, §9.1 — visibility is free |
| payload ECC | none (implicit) | **`light`** | §7.3 |
| entry table | variable-length | **fixed 32 B records** | §7.2 |
| lengths | bytes | **blocks** | §7.2 |

The keymap default deserves its own note, because an earlier draft got it wrong.
It was fixed at `adjacent` on the reasoning that a keyed checkerboard is what
makes the cover recoverable — true, and irrelevant to the op that actually
ships. `qim` never reads a key. Defaulting it to a keyed layout reserved half
the interior for reference blocks nothing consults, halving capacity to buy
nothing at all: the same 8 KB payload lands at 688×696 keyless against 952×960
keyed. The default now follows the modulation op, and `pair` with a keyless
keymap is refused rather than silently degraded.

The aesthetic settings all remain reachable — `ecc: "none"`, `header: "covert"`,
chroma planes, a keyed layout — they are simply no longer what you get by not
choosing.

### 5.4 Declared-intent encoding

STGC hands you eleven combine ops and lets you choose. Stegaprint has more knobs
(`Δ`, `M`, carrier set, ECC rate, plane plan, Q_floor) and they interact, so the
better API inverts the relationship:

```ts
Stegaprint.encode({
  source: image,
  entries: [audioEntry],
  survives: { quality: 60, resize: 0.5 },   // declared intent
  prefer: "invisibility",                    // or "capacity"
});
```

The encoder solves for parameters and reports what it chose, and *why it had to
grow the canvas* if it did. Manual override stays available for everything. This
is a real improvement over STGC's surface, not just an accommodation.

---

## 6. The header — engraved, not protected

The alpha border ring is gone and there is no replacement channel.

Some part of this format cannot degrade. Get `Δ` or the traversal wrong and
*every* symbol in the image decodes wrong — that failure has no graceful version,
it is not a spectrum. So the header is the one place robustness has to be bought
outright, and the honest way to buy it is a substrate with a low error rate rather
than redundancy layered over a noisy one.

### 6.1 Fiducial header (the default)

The TODO already sketches it: *"8x8 pixel corners, 8px border repeating
pattern."* A visible high-contrast pattern in the border ring, carrying the header
as printed data plus four corner registration marks.

- Header bits as full-contrast 8×8 blocks — black or white, nothing subtle. These
  survive quantization at any quality, because a quantizer that destroyed them
  would destroy the picture too.
- Four corner marks of known structure, detected by correlation.

Two things it buys that no covert embedding can:

1. Survives transformations that would erase any in-band header — screenshots,
   re-photographs, heavy downscales, aggressive quality floors.
2. **Registration.** The corner marks give the affine fit needed to undo a rescale
   (§8). Without them, geometric recovery is guesswork.

It is visible — a band of machine-readable pattern framing the picture — and
**visibility is a premise of this format rather than a cost it pays.** That
decision propagates well beyond the border: it is also why M=4 (§2.2), the DC
carrier (§2.3) and chroma (§2.4) are all available, and together those roughly
doubled the capacity in §3. A format that is beautiful when it works and absent
when it doesn't has not solved the problem it exists to solve.

The image wears a mark saying it is carrying something, and everything inside the
mark is then free to decay.

### 6.2 Covert header (opt-in)

Same header bytes embedded in the payload substrate instead, at a fixed
conservative profile the decoder attempts blind: Y plane, border ring of blocks,
`Δ` at the Q=50 luminance step × 2M, M=2, repetition ×5, majority-voted, CRC.

Kept for completeness rather than because anything needs it. It gives up rescale
recovery entirely (no registration marks) and it is the one place in the format
where redundancy does work that a better substrate would do for free. If phase 1
runs long, this is the first thing to cut.

```
header: "fiducial" | "covert"
```

### 6.3 Fixed-width binary, not an ASCII descriptor

STGC's `\x01`-separated `key=value` descriptor is compact and readable, and it is
variable-length text — the same fragility class as the entry table (§7). Length
bytes that determine where the next field starts have no place in the one
structure that must be exact.

The STGP header is **fixed-width binary at fixed offsets**. Every field is at a
known byte position, so no parse state exists to desynchronize; a corrupted field
corrupts itself and nothing else. CRC-32 over the whole thing, no zero-clamping
hack (that existed only because alpha 0 was a problem in PNG, and there is no
alpha here).

Fields: magic, version, original width/height, block grid origin, Q_floor, M,
carrier set, modulation op, keymap, traversal + params, plane plan, mask mode,
ECC level, interior block count, entry count, CRC. Roughly 40–48 bytes fixed.

---

## 7. Structure that degrades

STGC deliberately has no payload integrity: *"degradation is an aesthetic property
of the format."* The reflex is that this stance cannot survive a noisy channel and
has to be bought off with error correction. It can survive — but only if the
container stops being built the way STGC's is.

### 7.1 Why the entry table breaks differently than audio does

Errors in audio are **local**. Errors in the entry table are **positional**, and
they propagate forward without bound.

Look at the parse loop in `Stegassette/entries.ts`:

```
off += 2;        // read mtLen from the stream
off += mtLen;    // ← advance by a value that just came off the wire
off += 2;        // read nmLen
off += nmLen;    // ← again
off += 4;
```

`mimetypeLen` is an unbounded UInt16. `"audio/L8; rate=8000; channels=1"` is 30
bytes, stored `[0x1E, 0x00]`; one bit in the high byte reads 8222, the parser
skips 8 KB, and every field after it is read from the wrong offset. Not a
corrupted entry — *no* entries. `payloadLen` is worse: 15000 is `0x00003A98`, and
one bit in the top byte makes it 2.1 billion.

Header plus one audio table record is ~100 bytes, 800 bits:

| bit error rate | P(structure parses) | payload at the same rate |
| -------------- | ------------------- | ------------------------ |
| 10⁻⁴ | 92% | inaudible |
| 10⁻³ | **45%** | ~0.8% of samples off by one step — faint grain |
| 10⁻² | **0.03%** | ~8% off by one step — soft hiss, still music |

At 10⁻³ — a realistic JPEG round trip — the payload sounds exactly like the
intended aesthetic and the file has a coin-flip chance of not opening.

That is the actual problem, and it is worth stating precisely: **grain is a
degraded artifact; a parse failure is the absence of one.** STGC never had to
distinguish those because its error rate was zero.

### 7.2 The fix is the container, not a code

The table fails catastrophically because of three specific design choices, all of
which are conventions rather than requirements. Change them and structure degrades
the way samples do, with no redundancy added anywhere.

**1. Fixed-width records.** Mimetype string → a 1-byte type enum against a small
registry (`0` octet-stream, `1` audio/L8, `2` audio/L16, `3` text/plain, `4`
pointer, …). Name → fixed 24 bytes, null-padded. Record becomes a constant 32
bytes, so `off` advances by a constant and the parser's position never depends on
data. An error garbles one field of one entry and stops there — a mangled name,
not a missing album.

Incidentally this is *smaller* than STGC's table for typical entries (32 B vs
~46 B), because the mimetype string was most of it.

**2. Lengths in blocks, not bytes.** Payload length as a block count. A bit error
then changes the length by some number of blocks: the payload comes out short
(audio ends early) or long (a burst of noise at the tail). Both are degradation. A
4-byte byte-count gives a 2 GB slice attempt instead.

**2b. Never clamp a length on the way *in*.** Clamping is right on decode and
wrong on encode, and the record originally did both: `chunkCount` was a uint16,
so `Math.min(0xffff, …)` silently truncated any payload over 65535 chunks —
exactly 1 MiB. The loss was invisible in the worst way. The record claimed the
shorter length, the CRC was computed over the shorter payload, `crcOk` came back
true, and decode returned a byte-perfect prefix of a file that had been quietly
cut in half. It surfaced only on a 1.1 MB payload, where the first wrong byte
landed at 1,048,560 — not the scatter of a noisy channel but a hard cliff at
65535 × 16. The count is 32-bit now and an oversized entry is refused.

**2c. Store the padding count.** Lengths in chunks cost the exact byte length: a
binary payload comes back with up to CHUNK−1 trailing zeros indistinguishable
from content, which is fine for text and not fine for a file. One byte in the
record holds the padding, so the payload is returned exactly.

**3. Clamp on parse.** Any length exceeding the remaining stream clamps to what is
left. Never throw, never return empty. One line, and it converts a whole class of
catastrophes into truncations.

Payloads are block-aligned as a consequence of (2), which costs a few padding
bytes per entry and is worth it.

### 7.3 What ECC is left for

Not the structure. The payload only, and it stays the user's choice:

```
ecc: "none" | "light" | "full"
```

`"none"` is exactly the STGC stance — errors become audible grain, image and sound
physically coupled. `"light"` (default) is a light systematic code that fixes
isolated errors and leaves bursts alone. `"full"` is for text and pointer entries,
where a single wrong character is worth more than a little capacity.

Default `"light"` rather than `"none"` because a format whose premise is
robustness should work by default; the aesthetic setting is one word away.

### 7.4 Interleaving matters more than any code

JPEG errors are bursty and spatially clustered — one badly-quantized region ruins
every symbol in it. Spreading consecutive stream bytes across distant blocks turns
a burst into scattered single errors that even `"light"` handles.

The `bayer` traversal already does this for free: every prefix of its path is a
uniform sample of the plane. **Make it the default traversal**, not `raster`.
`fisher-yates` is the seeded alternative. This is the cheapest robustness in the
whole document — a default change, no new code.

---

### 7.5 Spare interior becomes redundancy

The canvas has a floor: the header ring needs about 960 blocks however short the
message (§6.1). So a small payload does not fill the canvas it paid for — at 780
bytes only **10% of interior blocks carry anything**, and the rest are written
back exactly as they were found. Measured, a 40-byte payload touches 1%.

That is a lot of paid-for surface doing nothing, and the fix is to write the
payload again. `repeat` fills whatever the interior has spare with whole copies
of the symbol stream, majority-voted position by position on decode. Voting on
*symbols* rather than bits is what makes it work: a corrupted carrier moves a
symbol to an adjacent QIM bin, so wrong answers scatter across the alphabet while
the right one repeats.

It costs nothing that was being used, and it collapses exactly the cases §7.3
said needed error correction:

| payload | copies | `85→75→60` | `Q40` |
| ------- | ------ | ---------- | ----- |
| 400 B | 1 | 3 bad bytes | 9 bad bytes |
| 400 B | 19 (auto) | **0** | **0** |
| 2000 B | 1 | 8 bad bytes | 71 bad bytes |
| 2000 B | 4 (auto) | **0** | **0** |

Q40 is two full steps below the declared floor and it now round-trips clean. The
declared floor is about what a *full* canvas survives; anything short of full
buys margin beyond it for free.

Note what this does not do: it cannot help a payload that fills the canvas, which
is why the ECC levels in §7.3 stay. The two are complements — `ecc` protects a
full canvas, `repeat` spends an empty one.

---

## 8. Geometry — resize and crop (phase 3, gated)

From the TODO: *"stronger resistance to jpg and scaling."* These are separable
problems and should be separately scheduled. JPEG at constant dimensions is
achievable and reliable. Rescaling is genuinely hard.

The block grid is the whole difficulty. After a resize the 8×8 lattice no longer
aligns to anything, and after a crop its origin has moved. Recovery needs:

1. **Detect** the four fiducial corners by correlation (requires `header:
   "fiducial"`).
2. **Fit** an affine transform from the detected corners to the header's declared
   original dimensions.
3. **Resample** back to original pixel dimensions with a good kernel.
4. *Then* extract blocks.

Realistic target: survives downscale to ~50% and modest crops. Not: rotation,
perspective, heavy crops. Say so plainly in the docs.

Everything before this phase should assume **dimensions are preserved**, and the
encoder should round output dimensions to a multiple of 16 so the block grid is
unambiguous under 4:2:0.

---

## 9. Audio, specifically

Mono throughout — stereo doubles the bitrate to carry information a listener at
this fidelity will not recover.

Beyond that there is no single answer, and §3.1 is the reason: rate and depth are
a **dial the work sits on**, not a constraint the format imposes. 8-bit/8 kHz for
a short clean loop, 4-bit/2 kHz for five minutes of something worn. The encoder
should accept a target *duration* and solve for the rate/depth pair that fits,
reporting what it chose — the same declared-intent shape as §5.4.

Four changes to how audio maps into the stream, all of which matter more here than
they ever did in STGC:

### 9.1 Gray-code the symbol alphabet

Under QIM an error moves a symbol to an *adjacent bin*. With binary coding,
adjacent bins can differ in the high bit — a one-step channel error becomes a
half-scale amplitude jump, i.e. a click. Gray coding makes an adjacent-bin error a
one-step amplitude error, i.e. inaudible. This is nearly free and should be
unconditional.

### 9.2 Bit-plane-aware carrier assignment

Not all carriers are equally robust. Sort them by expected reliability and assign:

- **MSBs** → lowest-frequency carriers, largest Δ
- **LSBs** → highest-frequency carriers, smallest Δ, or dropped entirely

A new concept with no STGC equivalent, and exactly where "it's OK to limit what
can be carried" earns its keep: dropping the bottom two bits of 8-bit audio costs
almost nothing audible and buys 25% capacity or a meaningful robustness margin.

At 4-bit (§3.1) this stops being an optimization and becomes the layout — a sample
is two symbols, the high one goes to the DC carrier and the low one to an AC
carrier, and an error in the reliable half is the only one that would be audible.

### 9.4 Resample properly, and low-pass first

The rate ladder in §3.1 only sounds like the description if the downsampling is
done right. Decimating by dropping samples aliases everything above the new
Nyquist back down as inharmonic noise — at 2 kHz that is most of the content of
any real recording, and it is the difference between "worn tape" and "broken."
Low-pass to the target Nyquist first, then resample.

Cheap to get right, easy to skip, and it determines whether the most interesting
cell in the §3.1 duration table is usable at all.

### 9.3 Carry samples as symbols, not as bytes

Rather than serializing PCM to bytes and then bytes to symbols, map an audio
sample straight onto the M-ary alphabet with an amplitude-ordered Gray mapping.
A channel error then *is* a small amplitude error by construction, with no byte
layer in between to amplify it.

This is the same move as §7.2 applied to samples instead of structure: graceful
degradation becomes a property of the representation rather than something error
correction has to manufacture afterward. Which is why it belongs in the design
rather than in a list of experiments — it is the reason `ecc: "none"` can remain a
legitimate setting.

The byte-oriented path stays for non-audio entries, which genuinely are byte
sequences. Audio gets its own mapping, declared by the type enum (§7.2) so the
decoder knows which it is looking at.

---

## 10. Implementation notes that are easy to get wrong

### 10.1 The cover is perturbed, not replaced

Worth naming because it inverts a core STGC property. QIM moves each carrier
coefficient by at most `Δ/2`; the block is otherwise the original block. **The
cover image is always fully present, everywhere, just noisier.**

STGC destroys data pixels and reconstructs an approximation from key pixels
(`reconstruct.ts`, §2.5 of the provisional description). Stegaprint needs none of
that — there is nothing to reconstruct. It is structurally a *watermark* where
STGC is a *replacement*. That difference should be stated in the docs; it changes
what the format is aesthetically, not just technically.

It also means `reconstruct.ts` has no analog, and `revealSurface.ts` / the player's
progressive-reveal UI needs rethinking — there is no "develops from black."

### 10.2 The encoder must iterate

Embed in DCT → inverse DCT → round to 8-bit integers → **that rounding perturbs
the coefficients you just set.** Naive DCT stego fails here and the failure looks
like a mysteriously high error rate on a lossless round trip.

Fix: embed, inverse, round, forward-DCT the rounded pixels, measure the drift,
correct, repeat. Two or three passes converge. Verify a **lossless** round trip
reaches zero errors before testing any JPEG at all — if it doesn't, nothing
downstream is meaningful.

### 10.3 Emit a JPEG, not pixels

`encode()` should return a JPEG at a chosen quality, not an ImageData for the
caller to encode. Otherwise the first encode is outside our control and the
quality floor guarantee is meaningless. The declared floor then means "survives
*further* re-encoding at ≥ Q_floor," which is the useful claim.

### 10.4 Don't trust one encoder

`canvas.toBlob('image/jpeg', q)` produces different quantization tables in
different browsers, and libjpeg-turbo, mozjpeg and Sharp all differ again. The
pixel-domain design (§2.1) is what makes this survivable, but the test harness has
to actually verify it across encoders rather than assuming.

---

## 11. Package structure

**A new module inside `amplib-steganography`, not a new package.** It shares the
entry table, the whole audio pipeline, traversals, keymaps, geometry and
collections; the memory of the `amplib-color` split says a package leaves only
when it has a consumer that doesn't want its sibling, and that is not the case
here. A user choosing a container wants one import.

```
src/
  shared/            ← extracted from Stegassette/, imported by both
    traversal.ts       (pure grid paths — no changes)
    keymap.ts          (pure grid pairing — no changes)
    pcm.ts  audio.ts  audioPrep.ts  geometry.ts  collection.ts
    types.ts           (Entry, DecodedEntry, StegaImageData, …)
  Stegassette/       ← STGC. Loses the shared files, keeps its own entries.ts.
  Stegaprint/        ← new
    dct.ts             forward/inverse 8×8 DCT-II
    quant.ts           JPEG quant tables, quality scaling, Δ derivation
    modulate.ts        the modulation-op table (§5.1)
    blocks.ts          plane extraction, YCbCr conversion, block grid
    records.ts         fixed-width entry records, block-aligned (§7.2)
    ecc.ts             CRC-32 + the light/full payload codes (§7.3)
    fiducial.ts        corner marks, border pattern, registration (§6.1, §8)
    header.ts          STGP fixed-width binary header (§6.3)
    container.ts       encode/decode, mirroring Stegassette/container.ts
    index.ts
  jpeg.ts            ← JPEG I/O: canvas in browser, a codec dep in Node
```

Note that `entries.ts` stays in `Stegassette/` rather than moving to `shared/` —
the two formats serialize entries differently (§4.3) and forcing a common layout
would mean either STGC changing its bytes or Stegaprint inheriting the fragility
it exists to avoid.

The `shared/` extraction is a prerequisite and should be its own commit, verified
by `npm run test:parity` before any new format code lands.

New dependency: a JPEG codec for Node (`sharp` or `jpeg-js`), as an
`optionalDependency` alongside `pngjs`. Browser uses canvas.

---

## 12. Phasing

**Phase 0 — measure before designing. ✅ `npm run measure`**

Vindicated immediately. Deriving Δ from the standard quantization tables produced
error rates that were *not monotonic in quality* — Q95 worse than Q50 — because
encoders are not obliged to use those tables, jpeg-js does not, and the QIM
lattice was beating against the encoder's real one. Nothing about that is visible
from the arithmetic in §2.2; it took a round trip through a real encoder.

What the rig measures instead is the only thing that is ground truth: how far
each coefficient actually moves. `src/Stegaprint/profile.ts` holds the result and
everything else derives from it.

Three findings changed the design:

1. **DC is the worst carrier, not the best** (§2.3, corrected in place).
2. **Safety 2× cannot reach zero, by construction.** Δ = 2·M·p99 leaves 1% of
   coefficients outside the tolerance definitionally, and measured 1.0–4.5% at
   Q75. 3× is at the edge; **4× is clean**, costing ~6 dB of PSNR — which this
   format does not care about (§6.1).
3. **Carriers are not independent.** Measuring one at a time and summing is
   wrong: each carrier's inverse DCT perturbs every other coefficient in the same
   block, so the convergence loop has to satisfy all of them at once.

Still outstanding from this phase: two more encoders (only jpeg-js so far), the
**still-as-video** channel (§13.1), and **M=8** (§2.2).

**Phase 1 — core, at the robust defaults. ✅ `npm run verify`**

All three criteria met, on the first canvas that exercised them:

| | result |
| --- | --- |
| lossless round trip | bit-exact |
| Q75 | 0 bad bytes of 8192 |
| Q75 → Q75 → Q75 | 0 bad bytes |
| Q60, Q60 → Q60 | 0 bad bytes (better than expected) |
| Q50 | 1 bad byte |
| Q85 → Q75 → Q60 | 119 bad bytes (1.45%) — the hard case, as predicted |
| interior PSNR | 35.6 dB |

The mixed-quality chain is the one case that needs the payload ECC, exactly as
§7.3 anticipated. Note that whole-image PSNR reads 15 dB rather than 35: the
fiducial border replaces ~10% of the pixels with full-contrast black and white on
purpose, and it dominates the metric. PSNR stopped being the right measure the
moment visibility became a premise.

One real bug surfaced only under a forced canvas size: `borderForHeader` could
return a ring shallower than the 3-block corner marks, so the marks painted over
live interior data. It cost a handful of bytes on an otherwise perfect lossless
round trip and was invisible at every canvas the payload-driven sizing happened
to choose. Fixed by flooring the border at `CORNER`.

Two things surfaced only after the docs demo made the format visible, and both
were defaults quietly costing something:

1. **The default keymap contradicted the default op.** `qim` ships as the
   modulation op and never reads a key, but the keymap defaulted to `adjacent`,
   which holds back half the interior as key blocks. Capacity doubled by
   deleting an assumption (§5.3).
2. **Most of the interior was empty.** A 780-byte payload touched 10% of its
   blocks. `repeat` now fills the rest with copies and majority-votes them,
   which takes the two weak cases — the mixed `85→75→60` chain and `Q40` — from
   3–71 bad bytes to zero (§7.5).

Phase 1 also gained something not in the plan: `encode({ width, height })` to
force an exact canvas, and `capacity(w, h)` to ask what fits. The default is
still payload-driven sizing, but §13.3 needs fixed dimensions for video frames,
and a caller replacing an existing asset usually cannot change its shape.

Shipped: Y plane, `bayer`, fiducial border read at native resolution,
fixed-width block-aligned records, CRC-32, Gray-coded symbols, Hamming(15,11)
payload ECC, text entries, corner verification. `qim` rather than `pair` is the
built default — `pair` is implemented but unmeasured, and shipping the
unmeasured one as the default would undo the point of phase 0.

**Phase 2 — parity.** All ten traversals, all seven keymaps at block granularity,
the full modulation-op table, plane plans, adaptive masking, payload ECC levels,
Gray-coded audio symbols, bit-plane carrier assignment, declared-intent encoding,
the covert header as an alternative.

**Phase 3 — geometry.** Affine fit from the phase-1 corner marks, resampling,
rescale and crop tolerance. Separately schedulable; phase 2 is a complete useful
format without it.

**Phase 4 — surface.** Docs page at `amplib.app/steganography` alongside
Stegassette, lab UI, and the hybrid pointer entry (§3.3) wired to stega.now.

Phase 1 is the one that proves the format exists. Phases 2–4 are additive and can
be reordered against whatever the sites need.

---

## 13. Video (mp4) as a carrier

Yes — and the obvious reading of the question is the least interesting one.

"Each frame is a Stegaprint carrying its own payload" does not work. Only I-frames
are coded independently; everything else is a motion-compensated difference from a
neighbour, so per-frame variation in the carrier is exactly what inter-prediction
is built to discard. Per-frame bit budgets are also ~25× tighter than a JPEG's
(1080p at 8 Mbps/30fps is ~33 KB/frame against ~500 KB for a 2 Mpx JPEG at Q75).

The interesting case is the opposite one.

### 13.1 A still image as a video is plausibly *more* robust than the JPEG of it

Counterintuitive, and it falls out of rate control. When the content is static,
every P-frame after the first costs almost nothing — so the encoder has a whole
GOP's bit budget and nothing to spend it on but the I-frame. A static scene gets a
*generously* coded keyframe, often at an effective quality above what the same
image would survive as a posted JPEG.

Then inter-prediction works in our favour rather than against us: the carrier is
part of the picture, the picture doesn't change, so the encoder's entire job is
reproducing our carrier exactly for the rest of the GOP.

Since posting a still as a video is now an ordinary distribution pattern, this may
be the single best channel available to the format. **Worth measuring in phase 0
alongside the JPEG ladder** — it is a claim about rate-control behaviour, not a
theorem, and platforms differ.

Capacity is one frame's worth, at video's fixed dimensions — measured from the
built format via `capacity()`, with this document's earlier predictions beside:

| | keyed | (pred) | keyless | (pred) | at 4-bit/2 kHz, keyless |
| --- | --- | --- | --- | --- | --- |
| 1080p (2.1 Mpx) | **18.9 KB** | 23 | **37.8 KB** | 46 | 38 s |
| 4K (8.3 Mpx) | **78.4 KB** | 92 | **156.8 KB** | 184 | 2.6 min |

Note that 1920×1080 and 1080×1920 come out identical, as they should — the
substrate counts blocks, not orientation.

### 13.2 Temporal redundancy is real, but smaller than it looks

The tempting claim is that N frames give N independent reads, so error rate
collapses. It does not, and the reason matters: if frames 2..N are predicted from
frame 1 with near-zero residual, they are all *the same reconstruction with the
same errors*. Averaging identical things gains nothing. The errors are correlated,
not independent.

Independent reads come only from **independently coded frames** — i.e. I-frames.
A 30-second video with a keyframe every 2 seconds gives ~15 genuinely independent
samples, which is still a strong majority vote, just not 900 of them.

The decoder should therefore **decode every frame to symbols independently and
majority-vote per symbol position**, rather than averaging pixels. Correlated
frames vote identically (harmless, merely redundant); independent I-frames break
ties. This needs no knowledge of the GOP structure, which is essential, because
the platform re-encodes and you never learn it.

### 13.3 What changes against the JPEG design

Three concrete differences, one of which undoes a decision made two sections ago:

1. **Deblocking may cost us the DC carrier.** H.264/265 apply an adaptive in-loop
   deblocking filter (plus SAO in HEVC) specifically to smooth block-edge
   discontinuities. DC modulation *is* a block-mean step — the artifact the filter
   exists to remove. §2.3 promoted DC to the most valuable carrier in the block;
   video may take it straight back. Either raise Δ for DC specifically or drop it
   in video mode, decided by measurement.
2. **4:2:0 is effectively mandatory**, so the chroma option (§2.4) is worse here
   than in JPEG, not better.
3. **Dimensions are locked** to standard video sizes, which removes the
   capacity-by-scaling lever — §3's "use a bigger canvas" answer is unavailable.

### 13.4 Moving video is a different project

Everything above assumes static content. Once the picture moves, QIM stops being
frame-invariant: the coefficient value changes with the content, so re-quantizing
to a bin produces a *different modification* each frame, which is precisely the
unpredictable residual inter-prediction crushes.

Carrying payload through moving video means an **additive, frame-invariant
spread-spectrum carrier** rather than QIM — a fixed pattern added to every frame
and recovered by correlation. That is a well-trodden approach and a genuinely
separate build: different modulation, different detector, different capacity
model, and much lower bitrate.

Worth being explicit that it is out of scope rather than implied by §13.1.

### 13.5 Recommendation

Treat **still-as-video as a phase 0 measurement and a phase 4 output format**, not
a new format. If the measurement holds, `encode()` gains an option to emit an mp4
of a static frame instead of a JPEG, and nothing else in the design changes —
same header, same records, same substrate, same decoder plus a frame loop and a
vote.

Moving video is a phase 5 that may never be worth starting.

---

## 14. Open questions

1. ~~**Name.**~~ **Resolved:** `Stegaprint`, magic `STGP`. An earlier draft used
   `Stegaphone` for the telephone bandwidth, which wrongly implied the format only
   carries audio — it carries anything, and audio is one entry type among several.
   `Stegastamp` was ruled out as a collision with a known 2019 paper on physically
   robust image steganography.

2. ~~**Does the aesthetic survive the ECC?**~~ **Resolved.** The premise is
   robustness first, existing conventions second — so the container was
   redesigned to degrade (§7.2) rather than protected with redundancy, and the
   header moved to a substrate that does not need protecting (§6.1). The
   aesthetic stance survives intact as `ecc: "none"`, which is now a setting
   rather than an assumption. STGC's entry table, ASCII descriptor, byte lengths,
   `raster` default and `xor` default were all dropped in the process; none of
   them were load-bearing, only familiar.

3. **Is chroma worth building?** It costs real work for a bad capacity trade and a
   robustness cliff (§2.4). Its only argument is the look. Defer to phase 2 and
   decide by prototyping the look first.

4. **Should phase 1 target a fixed Q_floor?** Declaring it in the header is more
   flexible; hardcoding Q=75 for phase 1 removes a variable while the substrate
   is being proven. Recommend hardcoding, then generalizing.

5. **How visible is the fiducial border allowed to be?** Now that it is the
   default (§6.1), its design is a front-of-house decision rather than a technical
   one — width, contrast, whether the pattern is legibly machine-readable or
   styled to read as an ornamental frame. It is the first thing anyone sees about
   the format. Worth a sketch before phase 1 rather than a default that ships by
   accident.
