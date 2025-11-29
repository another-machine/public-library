# StegaCassette Encoding Guide

StegaCassette hides audio data inside images by treating the image like a magnetic tape. Instead of magnetic particles, it uses the pixels of an image to store sound waves.

This document breaks down the different ways we can "record" onto an image, how much quality we can store, and how the data is physically arranged on the "tape."

## 1. The Core Concept: The Pixel Pair

At the heart of every encoding method is the **Pixel Pair**.

To store a piece of sound without destroying the image, we don't just overwrite a pixel. Instead, we take **two pixels** and create a relationship between them:

- **Source Pixel:** Keeps the original color of the image.
- **Encoded Pixel:** Holds the modified color that represents the sound.

By comparing these two pixels during playback, the decoder can calculate the exact sound wave that was stored.

**The Checkerboard Scramble**
If we always put the "Source" on the left and "Encoded" on the right, the image might look weirdly striped. To prevent this, we swap their positions in a checkerboard pattern. This blends the hidden data into the image texture, making it look like natural grain or noise rather than a glitch.

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

---

## 3. Audio Quality (Bit Depth)

Just like digital audio files, we can choose the quality of the sound. Higher quality requires more space (pixels) on the image.

| Quality    | Description                                                                   | Space Usage                                                                                               |
| :--------- | :---------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------- |
| **8-bit**  | **Lo-Fi / Retro.** Sounds like an old game console or a crunchy radio signal. | **Most Efficient.** Stores 3 audio samples in every pair of pixels (using Red, Green, and Blue channels). |
| **16-bit** | **CD Quality.** The standard for clear, crisp audio.                          | **Balanced.** Requires 4 pixels (two pairs) to store 3 audio samples.                                     |
| **24-bit** | **High Definition.** Studio quality with huge dynamic range.                  | **Heavy.** Requires 2 pixels (one pair) to store just 1 audio sample. Fills up the image very quickly.    |

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
- **Pixel Pairing:** Instead of pairing neighbors, it pairs a pixel on the far left with a pixel on the far right. This can create interesting symmetry effects.

### Rows

- **Layout:** Similar to Standard, but the pairing is different.
- **Pixel Pairing:** It pairs a pixel at the very top with a pixel at the very bottom.
- **Stereo Split:** Top half vs. Bottom half.

### Quarters

- **Layout:** The image is divided into four quadrants.
- **Pixel Pairing:** It pairs pixels diagonally across the center (e.g., Top-Left pairs with Bottom-Right).
- **Stereo Split:** Complex distribution across the quadrants.
- **Visual Effect:** Creates a kaleidoscopic or "X" pattern in the noise.

---

## 6. Borders

Finally, we can add a **Border**.

- **What it is:** A visual margin around the edge of the image and for some tiling patterns, the inner gap.
- **Function:** No data is written here except metadata in the outer most 1 pixel border. The rest of the border pixels remain 100% original.
- **Why use it?** We need at least a one pixel border to store metadata about the encoding approach used (encoding, borderWidth) and the audio that is stored inside (sampleRate, bitDepth, channels, bpm, step). Metadata is not required, but it can be automatically decoded if provided. Visually, borders can frame the "noise" in a compelling way.
