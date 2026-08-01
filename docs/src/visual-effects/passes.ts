/**
 * PROTOTYPE — three passes that between them exercise every part of the
 * interface in chain.ts.
 *
 *   field   generator, feedback, compile-time defines   (AVVA's shape)
 *   bloom   filter, private ping-pong buffer, multi-step draw  (chladni's shape)
 *   crt     filter, single draw                          (the NTSC demo's shape)
 *
 * The point of the set is that `field` and `crt` are the same kind of object.
 * In the NTSC demo the CRT shader was the whole program; here it is one entry
 * in an array, and it does not care whether the image reaching it came from a
 * generator, a video element, or another filter.
 */

import type { PassDef } from "./chain";

/**
 * Neutral params. Deliberately says nothing about audio: AVVA would adapt an
 * AudioFrame into this at its call site, and the NTSC demo would fill only the
 * crt.* half. Names are the ones the shaders actually want, which is the fix for
 * AVVA's `#define uScale uBlobSize` alias block — that block exists only because
 * the store keys and the shader vocabulary disagree, and nothing here inherits
 * that disagreement.
 */
export interface Params {
  /** Slot count. Drives N_HUES, so changing it recompiles. */
  hues: number;
  /** Per-slot linear RGB, length hues*3. */
  slotRGB: Float32Array;
  /** Per-slot presence 0..1, length hues. */
  slotW: Float32Array;

  energy: number;
  motion: number;
  x: number;
  y: number;
  impulse: number;

  warp: number;
  softness: number;
  trail: number;

  bloom: number;
  bloomThreshold: number;

  curvature: number;
  scanLines: number;
  chromatic: number;
  grain: number;
  blur: number;
  degrade: number;
  ghosting: number;
  brightness: number;
}

// ── field ────────────────────────────────────────────────────────────────────

/**
 * A generator: no `inputs.source`, so nothing upstream reaches it. This is a
 * condensed version of AVVA's shared field scaffold — palette weave over fbm,
 * background glow at (x, y), previous frame advected along a slow turning flow.
 *
 * N_HUES is a define rather than a uniform for the same reason it is in AVVA:
 * the weave loop bound has to be a compile-time constant, and specialising the
 * program per slot count is cheaper than branching every fragment.
 */
export const field: PassDef<Params> = {
  name: "field",
  inputs: { feedback: true },
  defines: (p) => ({ N_HUES: Math.max(1, Math.round(p.hues)) }),
  frag: () => `
uniform float uSlotW[N_HUES];
uniform vec3  uSlotRGB[N_HUES];
uniform float uEnergy;
uniform float uMotion;
uniform float uX;
uniform float uY;
uniform float uImpulse;
uniform float uWarp;
uniform float uSoft;
uniform float uTrail;

void main() {
  float aspect = uRes.x / uRes.y;
  vec2  uv     = vUV;
  vec2  uvA    = vec2(uv.x * aspect, uv.y);
  float t      = uTime;

  // Bounded, incommensurate warp — the two frequencies never line up, so the
  // field wanders without drifting anywhere.
  float warpAmp = 0.5 + uWarp * 4.0;
  vec2  flow = vec2(cos(t * 0.10) + 0.5 * sin(t * 0.043),
                    sin(t * 0.08) + 0.5 * cos(t * 0.037)) * warpAmp;
  vec2  sampleBase = uvA * (1.0 + uEnergy * 0.5) + flow;

  // Palette weave: every active slot carves its own fbm band.
  float totalW = 0.0, ambW = 0.0;
  vec3  total  = vec3(0.0), amb = vec3(0.0);
  for (int i = 0; i < N_HUES; i++) {
    float presence = uSlotW[i];
    if (presence < 0.005) continue;
    float fi   = float(i);
    float band = fbm(sampleBase + vec2(fi * 3.1, fi * 1.7)) * 0.5 + 0.5;
    float w    = smoothstep(0.5 - uSoft, 0.5 + uSoft, band);
    vec3  c    = uSlotRGB[i];
    total  += c * w * presence;
    totalW += w * presence;
    amb    += c * presence;
    ambW   += presence;
  }
  vec3  chordAvg = ambW > 0.001 ? amb / ambW : vec3(0.0);
  float coverage = clamp(totalW, 0.0, 1.0);
  vec3  color    = totalW > 0.001 ? total / totalW : chordAvg;
  // Gaps floor to a dim tint rather than black, so the chord still reads there.
  color = mix(chordAvg * 0.12, color, coverage);
  // The weave normalises by total weight, so without a gain term the field sits
  // at full slot brightness everywhere and clips as soon as anything is added.
  color *= 0.3 + uEnergy * 0.7;

  vec2  glowCtr = vec2(0.5 * aspect + (uX - 0.5) * 0.75 * aspect, 1.0 - uY);
  float bgDist  = dot(uvA - glowCtr, uvA - glowCtr);
  color += chordAvg * exp(-bgDist * 2.5) * uEnergy * 0.35;

  // Real feedback: uPrev is this pass's own last OUTPUT, from a ping-pong pair.
  // The NTSC demo's ghosting sampled the previous INPUT via a 2D-canvas
  // round-trip, which is why its trails could never accumulate.
  vec2 flowScroll = vec2(0.14 * sin(t * 0.40), 0.14 * cos(t * 0.35));
  vec2 drift = vec2(snoise(uvA * 4.0 + flowScroll),
                    snoise(uvA * 4.0 + flowScroll + 100.0)) * (0.0015 + uMotion * 0.005);
  vec3 prev = texture(uPrev, clamp(uv + vec2(drift.x / aspect, drift.y), 0.0, 1.0)).rgb;
  // A leaky integrator, not max(): max() only ever increases a channel, so a
  // long trail saturates the whole frame to white within a second or two.
  color = mix(color, prev, clamp(uTrail, 0.0, 0.98) * 0.8);

  color += vec3(uImpulse * 0.25);
  // Grain keys off uRes — this pass's own buffer — not the canvas, so running
  // the field at scale 0.5 keeps the grain the same size relative to the signal.
  color += vec3(snoise(uv * uRes / 2.5 + vec2(t * 8.0))) * (0.02 + uMotion * 0.04);

  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`,
  uniforms: (p) => ({
    uSlotW: p.slotW,
    uSlotRGB: p.slotRGB,
    uEnergy: p.energy,
    uMotion: p.motion,
    uX: p.x,
    uY: p.y,
    uImpulse: p.impulse,
    uWarp: p.warp,
    // Degenerate smoothstep if the edges meet, so keep a floor.
    uSoft: Math.max(0.01, p.softness),
    uTrail: p.trail,
  }),
};

// ── bloom ────────────────────────────────────────────────────────────────────

/**
 * A filter with private state and four draws. This is the small stand-in for
 * chladni: it proves `buffers` + `draw` + a ping-pong that swaps *within* a
 * single pass, without porting a 262k-particle simulation to find out whether
 * the shape works.
 *
 * Bright-pass and blur run at quarter resolution — the reason `uRes` is
 * per-target rather than per-chain.
 */
export const bloom: PassDef<Params> = {
  name: "bloom",
  inputs: { source: true },
  buffers: [
    {
      name: "uBloom",
      scale: 0.25,
      format: "rgba16f",
      // Half-float is not universal; rgba8 clips the highlights but still looks
      // like bloom, which beats dropping the pass.
      fallback: ["rgba8"],
      pingPong: true,
    },
  ],
  frag: () => ({
    bright: `
uniform float uThreshold;
void main() {
  vec3 c = texture(uSrc, vUV).rgb;
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  outColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.25, luma), 1.0);
}`,
    blur: `
uniform vec2 uDir;
void main() {
  vec2 texel = uDir / uRes;
  vec3 sum = texture(uBloom, vUV).rgb * 0.2270270270;
  sum += texture(uBloom, vUV + texel * 1.3846153846).rgb * 0.3162162162;
  sum += texture(uBloom, vUV - texel * 1.3846153846).rgb * 0.3162162162;
  sum += texture(uBloom, vUV + texel * 3.2307692308).rgb * 0.0702702703;
  sum += texture(uBloom, vUV - texel * 3.2307692308).rgb * 0.0702702703;
  outColor = vec4(sum, 1.0);
}`,
    composite: `
uniform float uAmount;
void main() {
  vec3 base = texture(uSrc, vUV).rgb;
  vec3 glow = texture(uBloom, vUV).rgb;
  outColor = vec4(clamp(base + glow * uAmount, 0.0, 1.0), 1.0);
}`,
  }),
  uniforms: (p) => ({
    uThreshold: p.bloomThreshold,
    uAmount: p.bloom,
  }),
  draw: (rt) => {
    const buf = rt.buffer("uBloom");
    // Each step writes to `back` and swaps, so the next step's `uBloom` binding
    // — resolved at run() time — sees what the previous one produced.
    rt.run("bright", { target: buf.back });
    buf.swap();
    rt.run("blur", { target: buf.back, uniforms: { uDir: [1, 0] } });
    buf.swap();
    rt.run("blur", { target: buf.back, uniforms: { uDir: [0, 1] } });
    buf.swap();
    rt.run("composite");
  },
};

// ── crt ──────────────────────────────────────────────────────────────────────

/**
 * The NTSC demo's fragment shader, ported to GLSL ES 3.00 and to this interface.
 * The shader body is essentially unchanged — that was always the good part. What
 * changed is around it:
 *
 *   - scanline density comes from uScanLines (a line count) instead of
 *     uResolution.y, so it no longer tracks display DPI or window size;
 *   - ghosting reads uPrev, this pass's own previous OUTPUT, so trails
 *     accumulate — the original's 2D-canvas copy of the previous INPUT is gone,
 *     and with it a per-frame CPU readback at source resolution;
 *   - the source is whatever the chain hands it. A video element, the field
 *     generator above, or the bloom pass's output all arrive the same way.
 */
export const crt: PassDef<Params> = {
  name: "crt",
  inputs: { source: true, feedback: true },
  frag: () => `
uniform float uBrightness;
uniform float uScanLines;
uniform float uChromatic;
uniform float uGrain;
uniform float uBlur;
uniform float uDegrade;
uniform float uGhosting;
uniform float uCurvature;

void main() {
  vec2  centered = vUV - 0.5;
  float curve    = max(0.0, uCurvature);
  float fillZoom = 1.0 + curve * 0.95;
  float r2       = dot(centered, centered);
  float bend     = 1.0 - (r2 * r2) * (1.8 * curve);
  vec2  uv       = centered / (fillZoom * bend) + 0.5;
  vec2  uvSafe   = clamp(uv, vec2(0.001), vec2(0.999));

  float edgeFade = 1.0 - smoothstep(0.35, 0.75, length(centered));
  vec2  offset   = vec2(uChromatic, -uChromatic * 0.6) * edgeFade;
  vec4  r = texture(uSrc, clamp(uvSafe + offset, vec2(0.001), vec2(0.999)));
  vec4  g = texture(uSrc, uvSafe);
  vec4  b = texture(uSrc, clamp(uvSafe - offset, vec2(0.001), vec2(0.999)));
  vec3  color = vec3(r.r, g.g, b.b);

  vec2 blurOffset = vec2(1.0 / uRes.x, 1.0 / uRes.y)
                  * (0.0007 + 0.0045 * uBlur) * (1.0 + curve * 0.5);
  vec3 blurred = (
    texture(uSrc, clamp(uvSafe + vec2(-blurOffset.x, 0.0), vec2(0.001), vec2(0.999))).rgb +
    texture(uSrc, clamp(uvSafe + vec2( blurOffset.x, 0.0), vec2(0.001), vec2(0.999))).rgb +
    texture(uSrc, clamp(uvSafe + vec2(0.0, -blurOffset.y), vec2(0.001), vec2(0.999))).rgb +
    texture(uSrc, clamp(uvSafe + vec2(0.0,  blurOffset.y), vec2(0.001), vec2(0.999))).rgb
  ) * 0.25;
  color = mix(color, blurred, 0.08 + uBlur * 0.5);

  vec2 ghostOffset = vec2(0.0016 * curve, -0.0008 * curve);
  vec3 prevColor = texture(uPrev, clamp(uvSafe + ghostOffset, vec2(0.001), vec2(0.999))).rgb;
  color = mix(color, prevColor, uGhosting * 0.55);

  vec2  screenUv = vUV * 2.0 - 1.0;
  float vignette = smoothstep(1.25, 0.25, length(screenUv));
  color *= mix(0.65, 1.0, vignette);

  // uScanLines is a line COUNT. The original multiplied vUV.y by uResolution.y,
  // which made the stripe frequency a function of device pixels — so the effect
  // changed on a retina display and again on every window resize.
  float scan = sin(vUV.y * uScanLines * 3.14159265) * 0.5 + 0.5;
  color *= mix(0.92, 1.02, scan);

  float n = fract(sin(dot(vec2(floor(uvSafe.x * 320.0),
                              floor(uvSafe.y * 180.0) + uTime * 17.0),
                          vec2(127.1, 311.7))) * 43758.5453123);
  color += (n - 0.5) * uGrain;

  float luma  = dot(color, vec3(0.299, 0.587, 0.114));
  vec3  chroma = color - vec3(luma);
  vec3  tvColor = vec3(luma);
  tvColor += chroma * mix(0.0, 0.32, uDegrade);
  tvColor.r = mix(tvColor.r, luma + 0.08 * (color.r - luma), 0.45 * uDegrade);
  tvColor.g = mix(tvColor.g, luma + 0.04 * (color.g - luma), 0.45 * uDegrade);
  tvColor.b = mix(tvColor.b, luma - 0.06 * (color.b - luma), 0.45 * uDegrade);
  float levels = mix(96.0, 10.0, uDegrade);
  tvColor = floor(tvColor * levels) / levels;
  color = mix(color, tvColor, uDegrade);

  color *= uBrightness;
  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`,
  uniforms: (p) => ({
    uBrightness: p.brightness,
    uScanLines: p.scanLines,
    uChromatic: p.chromatic,
    uGrain: p.grain,
    uBlur: p.blur,
    uDegrade: p.degrade,
    uGhosting: p.ghosting,
    uCurvature: p.curvature,
  }),
};
