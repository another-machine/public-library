# StegaCassette Encoding Guide

StegaCassette hides audio data inside images by treating the image like a magnetic tape. Instead of magnetic particles, it uses the pixels of an image to store sound waves.

This document breaks down the different ways we can "record" onto an image, how much quality we can store, and how the data is physically arranged on the "tape."

## 1. The Core Concepts

There are two main ways StegaCassette stores data in an image: **Differential** and **Solid**.

### The Pixel Pair (Differential)

Used by **Additive**, **Subtractive**, **Difference**, and **Noise** encodings.

To store a piece of sound without destroying the image, we don't just overwrite a pixel. Instead, we take **two pixels** and create a relationship between them:

- **Source Pixel:** Keeps the original color of the image.
- **Encoded Pixel:** Holds the modified color that represents the sound.

By comparing these two pixels during playback, the decoder can calculate the exact sound wave that was stored.

**The Checkerboard Scramble**
If we always put the "Source" on the left and "Encoded" on the right, the image might look weirdly striped. To prevent this, we swap their positions in a checkerboard pattern. This blends the hidden data into the image texture, making it look like natural grain or noise rather than a glitch.

### The Key Pixel (Solid)

Used by the **Solid** encoding.

Instead of using pairs of pixels, this method uses a single **Key Pixel** (located at the top-left corner of the content area, `borderWidth, borderWidth`) as the reference for the _entire_ image.

- **Key Pixel:** The single reference color for the whole stream.
- **Encoded Pixels:** Every other pixel in the image is compared against this one Key Pixel.

**Efficiency:** Because we don't need a "Source Pixel" for every "Encoded Pixel", this method is **twice as dense**. We can store double the amount of audio in the same image size.

---

## 2. Encoding Methods (The "Flavor" of Noise)

Different methods change the "Encoded Pixel" in different ways. This affects both how the image looks and how robust the data is.

### ➕ Additive

- **How it works:** The sound value is **added** to the pixel's color. If the color gets too bright (over 255), it wraps around to 0 (black).
- **Visual Style:** Creates a high-contrast, digital-looking noise.
- **Best for:** Glitch art aesthetics.

### ➖ Subtractive

- **How it works:** The sound value is **subtracted** from the pixel's color. If it goes below 0, it wraps around to 255 (white).
- **Visual Style:** Similar to additive but often darker or inverted in feel.

### ↔️ Difference (Recommended)

- **How it works:** This method is the smartest. It calculates the "shortest path" between colors to represent the sound. It tries to change the pixel color as little as possible while still storing the data.
- **Visual Style:** The most subtle. It looks like faint film grain or sensor noise.
- **Best for:** Preserving the original image's look.

### 🌊 Noise

- **How it works:** Instead of directly modifying the color, it uses the image itself as a "seed" to generate a random noise pattern. The sound is encoded into the intensity of this noise.
- **Visual Style:** Very textured and chaotic.
- **Best for:** Hiding data in images that are already noisy or textured (like sand or concrete).

### 🧱 Solid

- **How it works:** Uses the **Key Pixel** strategy. Every pixel stores data relative to one fixed reference point.
- **Visual Style:** Creates a very dense, solid block of noise or color shifting. The original image is largely overwritten by the data.
- **Best for:** Maximizing storage capacity.

---

## 3. Audio Quality (Bit Depth)

Just like digital audio files, we can choose the quality of the sound. Higher quality requires more space (pixels) on the image.

| Quality    | Description                                          | Differential Usage (Standard) | Solid Usage (High Density)  |
| :--------- | :--------------------------------------------------- | :---------------------------- | :-------------------------- |
| **8-bit**  | **Lo-Fi / Retro.** Sounds like an old game console.  | **3 samples** per 2 pixels.   | **3 samples** per 1 pixel.  |
| **16-bit** | **CD Quality.** The standard for clear, crisp audio. | **3 samples** per 4 pixels.   | **3 samples** per 2 pixels. |
| **24-bit** | **High Definition.** Studio quality.                 | **1 sample** per 2 pixels.    | **1 sample** per 1 pixel.   |

---

## 4. Channels: Mono vs. Stereo

We can record a single track (Mono) or two separate tracks (Stereo).

- **Mono (1 Channel):** The entire image is used for one stream of audio.
- **Stereo (2 Channels):** The image is split into two distinct regions. One region stores the Left ear audio, the other stores the Right ear audio.

---

## 5. Layouts (Tiling Patterns)

If we are recording in Stereo, or just want to organize the data differently, we can choose how the "tape" is laid out on the canvas.

### Standard (Interleaved)

- **Layout:** The data is written line-by-line, like reading a book.
- **Stereo Split:** The **Top Half** of the image is the Left Channel, and the **Bottom Half** is the Right Channel.
- **Pros:** Simple and reliable.

### Columns

- **Layout:** The image is split vertically.
- **Stereo Split:** The **Left Side** is the Left Channel, the **Right Side** is the Right Channel.
- **Pixel Pairing (Differential):** Instead of pairing neighbors, it pairs a pixel on the far left with a pixel on the far right. This can create interesting symmetry effects.

### Rows

- **Layout:** Similar to Standard, but the pairing is different.
- **Pixel Pairing (Differential):** It pairs a pixel at the very top with a pixel at the very bottom.
- **Stereo Split:** Top half vs. Bottom half.

### Quarters

- **Layout:** The image is divided into four quadrants.
- **Pixel Pairing (Differential):** It pairs pixels diagonally across the center (e.g., Top-Left pairs with Bottom-Right).
- **Stereo Split:** Complex distribution across the quadrants.
- **Visual Effect:** Creates a kaleidoscopic or "X" pattern in the noise.

---

## 6. Borders

Finally, we can add a **Border**.

- **What it is:** A visual margin around the edge of the image and for some tiling patterns, the inner gap.
- **Function:** No data is written here except metadata in the outer most 1 pixel border. The rest of the border pixels remain 100% original.
- **Why use it?** We need at least a one pixel border to store metadata about the encoding approach used (encoding, borderWidth) and the audio that is stored inside (sampleRate, bitDepth, channels, bpm, step). Metadata is not required, but it can be automatically decoded if provided. Visually, borders can frame the "noise" in a compelling way.

---

## 7. Encryption via Key-Based Permutation

StegaCassette supports **optional encryption** through a key parameter. When a key is provided, the audio samples are scrambled using a deterministic permutation before being encoded into the image. Without the correct key, the decoded audio will be unrecognizable noise.

### How It Works

- **Permutation-Based Encryption:** The audio buffer is shuffled using the Fisher-Yates algorithm with a seeded random number generator.
- **Single-Round:** Only one permutation pass is performed (O(n) complexity), keeping the operation fast.
- **Deterministic:** The same key always produces the same permutation, ensuring reliable decoding.

### Key Types

#### String Keys

- **Usage:** Pass a string directly as the `key` parameter.
- **Security:** A long random string (100+ characters) provides excellent security. For example, a 128-character random string has ~10^200+ possible combinations.
- **Best for:** Memorable passphrases or programmatically generated keys.

```typescript
const encrypted = StegaCassette.encode({
  source,
  audioBuffers,
  sampleRate: 48000,
  bitDepth: 24,
  encoding: "difference",
  key: "my-secret-passphrase-with-lots-of-entropy-12345",
});
```

#### Image Keys

- **Usage:** Pass an `HTMLImageElement` or `HTMLCanvasElement` that contains a Stega64-encoded string.
- **Requirement:** The image must have been encoded with **Stega64** (not StegaCassette) and contain **STRING** type data with metadata.
- **Security:** The longer the hidden string in the image, the stronger the encryption.
- **Best for:** Storing complex, high-entropy keys that don't need to be memorized.

```typescript
// First, create a key image by encoding a long random string
const keyImage = Stega64.encode({
  source: someImage,
  messages: ["a-very-long-random-string-with-256-characters-of-entropy..."],
  encoding: "base64",
  encodeMetadata: true,
});

// Then use that image as the encryption key
const encrypted = StegaCassette.encode({
  source,
  audioBuffers,
  sampleRate: 48000,
  bitDepth: 24,
  encoding: "difference",
  key: keyImage,
});
```

### Decoding with Keys

To decode encrypted audio, you must provide the **exact same key** used during encoding:

```typescript
const decrypted = StegaCassette.decode({
  source: encryptedImage,
  bitDepth: 24,
  channels: 2,
  encoding: "difference",
  key: "my-secret-passphrase-with-lots-of-entropy-12345",
});

// Or with an image key
const decrypted = StegaCassette.decode({
  source: encryptedImage,
  bitDepth: 24,
  channels: 2,
  encoding: "difference",
  key: keyImage,
});
```

**Without the correct key**, the decoded audio will be scrambled and sound like random noise. The permutation is irreversible without knowing the seed.

### Why Single-Round is Secure

Unlike password hashing (which needs to be slow), encryption permutations benefit from long keys rather than multiple rounds. A 100-character random string already provides more security than 16 rounds of a 32-bit seed. The single-round approach:

- ✅ **Fast:** O(n) time complexity - minimal performance impact
- ✅ **Secure:** Long keys provide exponential security (10^150+ combinations)
- ✅ **Efficient:** No need for multiple passes through large audio buffers
