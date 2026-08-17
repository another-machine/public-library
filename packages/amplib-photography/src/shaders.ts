/**
 * The GLSL for both halves: accumulating an exposure, and developing it.
 *
 * Kernels are expressed as a fraction of the image rather than a count of
 * texels, so developing at half resolution is the same picture at half size
 * rather than a different one — which is what makes a preview render usable as
 * a preview.
 */

/** No attributes: one oversized triangle addressed by gl_VertexID. */
export const VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const HEAD = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
`;

/**
 * One frame into the accumulator's two moments, each carrying its weight in
 * alpha so `resolve` can normalise. S0 is the plain sum; S1 is the sum
 * weighted by the frame's position along the burst. The trail weight is
 * linear in that position, so ANY trail value is a linear mix of the two —
 * which is what lets trail be a develop-time parameter instead of being
 * burned into the accumulation. Weights arrive pre-scaled by 1/n so an 8-bit
 * fallback accumulator stays in range; the scale cancels at resolve. Under
 * MAX blending S1 is fed zeros and stays empty.
 */
export const FRAG_ACCUMULATE = `#version 300 es
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 outS0;
layout(location = 1) out vec4 outS1;
uniform sampler2D uFrame;
uniform float uW;
uniform float uRampW;
uniform float uMirror;
void main() {
  vec2 uv = vec2(uMirror > 0.5 ? 1.0 - vUv.x : vUv.x, vUv.y);
  vec3 rgb = texture(uFrame, uv).rgb;
  outS0 = vec4(rgb * uW, uW);
  outS1 = vec4(rgb * uRampW, uRampW);
}`;

/**
 * Normalise the accumulated moments into the linear image, once, up front, so
 * the divide is not repeated in every downstream shader. Doubles as the
 * downsample for preview renders. The per-frame weight is A + B·ramp, so the
 * weighted sum is A·S0 + B·S1 and the total weight is the same mix of the
 * alphas — trail arrives here as (A, B) and never touches the accumulator.
 */
export const FRAG_RESOLVE = `${HEAD}
uniform sampler2D uS0;
uniform sampler2D uS1;
uniform float uA;
uniform float uB;
void main() {
  vec4 s0 = texture(uS0, vUv);
  vec4 s1 = texture(uS1, vUv);
  vec3 sum = s0.rgb * uA + s1.rgb * uB;
  float w = s0.a * uA + s1.a * uB;
  outColor = vec4(sum / max(w, 1e-5), 1.0);
}`;

/** Separable 5-tap gaussian, shared by the softness and bloom blurs. */
export const FRAG_BLUR = `${HEAD}
uniform sampler2D uSrc;
uniform vec2 uDir;
void main() {
  vec3 s  = texture(uSrc, vUv).rgb * 0.2270270270;
  s += texture(uSrc, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture(uSrc, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture(uSrc, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  s += texture(uSrc, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  outColor = vec4(s, 1.0);
}`;

/**
 * Isolate what will bloom. Headroom re-expands near-clipped values above 1.0
 * first: a neon sign clips flat in an 8-bit camera frame, and without pushing
 * it back up the halation reads as a grey smear instead of a hot source. The
 * float target is what holds the result.
 */
export const FRAG_BRIGHT = `${HEAD}
uniform sampler2D uSrc;
uniform float uHeadroom;
void main() {
  vec3 c = texture(uSrc, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c *= 1.0 + smoothstep(0.80, 1.0, l) * uHeadroom * 6.0;
  float k = max(0.0, l - 0.62) / 0.38;
  outColor = vec4(c * k * k, 1.0);
}`;

/** Everything that reads as film, in one pass over the resolved exposure. */
export const FRAG_COMPOSITE = `${HEAD}
uniform sampler2D uLin;
uniform sampler2D uSoftTex;
uniform sampler2D uBloom;
uniform sampler2D uDefocus;
uniform vec2 uRes;
uniform float uExposure, uRolloff, uHalation, uHalationHue, uBlack;
uniform float uSoftness, uGrain, uDrift, uSeed;
uniform float uSplit, uShadowHue, uHighlightHue, uVignette;
uniform float uAperture, uFocalPlane;

vec3 fetch(vec2 uv) { return texture(uLin, clamp(uv, 0.001, 0.999)).rgb; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 hue(float h) {
  h = fract(h / 360.0);
  vec3 p = abs(fract(h + vec3(1.0, 2.0, 3.0) / 3.0) * 6.0 - 3.0);
  return clamp(p - 1.0, 0.0, 1.0);
}

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p + 19.19);
  return fract((p.x + p.y) * p.x);
}

void main() {
  // drift: sub-degree rotation, cropped in so the corners stay covered
  vec2 uv = vUv - 0.5;
  float a = uDrift * 0.011;
  float cs = cos(a), sn = sin(a);
  uv = mat2(cs, -sn, sn, cs) * uv;
  uv *= 0.976;
  float r = length(uv) * 2.0;
  vec2 base = uv + 0.5;

  // lateral chromatic aberration, radial, quadratic toward the edge
  vec2 d = uv * r * r * uDrift * 0.004;
  vec3 c = vec3(fetch(base + d).r, fetch(base).g, fetch(base - d).b);

  // de-sharpen, undoing the phone's micro-contrast. The blur is a separable
  // pre-pass; this only decides how far toward it to travel.
  c = mix(c, texture(uSoftTex, clamp(base, 0.001, 0.999)).rgb, uSoftness * 0.78);

  // depth of field, faked: defocus grows with distance from a screen-space
  // focal band — the tilt-shift lie, since a single camera offers no depth.
  float band = smoothstep(0.12, 0.85, abs(base.y - uFocalPlane) * 2.0) * uAperture;
  c = mix(c, texture(uDefocus, clamp(base, 0.001, 0.999)).rgb, band * 0.9);

  // halation — light escaping its own edges. The bloom already carries the
  // source colour, so multiplying by the strong warm crushes it to film
  // red-orange, and by the near-neutral keeps the source's own hue with only a
  // slight warm bias.
  vec3 warm = vec3(1.0, 0.42, 0.26), neutral = vec3(1.0, 0.88, 0.80);
  c += texture(uBloom, base).rgb * mix(warm, neutral, uHalationHue) * uHalation * 1.7;

  c *= pow(2.0, uExposure);

  // filmic shoulder: a smooth approach to white rather than a hard clip
  float k = 1.0 + uRolloff * 1.5;
  c = mix(c, (1.0 - exp(-c * k)) / (1.0 - exp(-k)), uRolloff);

  // split tone — shadows one way, highlights the other, mids left alone
  float l = clamp(luma(c), 0.0, 1.0);
  float sw = pow(1.0 - l, 2.0), hw = pow(l, 2.0);
  c += ((hue(uShadowHue) - 0.5) * sw + (hue(uHighlightHue) - 0.5) * hw) * uSplit * 0.24;

  // black point, after the split tone so it can crush that lift back out
  float bp = uBlack * 0.14;
  c = max(c - bp, 0.0) / max(1.0 - bp, 0.001);

  // grain — monochromatic, weighted to the midtones. Keyed to the render
  // resolution so a half-res preview shows the same grain size on screen.
  float g = hash(vUv * uRes / 1.45 + uSeed);
  c += (g - 0.5) * uGrain * 0.17 * (1.0 - pow(abs(l * 2.0 - 1.0), 1.4));

  c *= 1.0 - uVignette * 0.55 * pow(clamp(r * 0.72, 0.0, 1.0), 2.2);
  outColor = vec4(max(c, 0.0), 1.0);
}`;
