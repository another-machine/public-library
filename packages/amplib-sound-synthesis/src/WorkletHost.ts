import { FM_TIER_WORKLET } from "./worklets/fmTier";
import { KS_STRING_WORKLET } from "./worklets/ksString";
import { LIMITER_WORKLET } from "./worklets/limiter";

export interface LimiterMetrics {
  lufsShort: number;
  gr: number;
}

export type LimiterMetricsCallback = (metrics: LimiterMetrics) => void;

/**
 * Registers a worklet from its source text rather than from a URL.
 *
 * The package carries its worklets as strings and blobs them here, the same
 * way Clock carries its timing worker. The alternative — importing the worklet
 * file and letting the bundler emit a URL — ties the package to one bundler:
 * `?url` is Vite, `new URL(..., import.meta.url)` needs the Parcel worklet
 * transformer, and the global bundle published to amplib.app/lib has no
 * bundler at all. A blob URL works in all three.
 *
 * SoundTransformation takes the opposite approach and asks the caller for a
 * path or a script tag. That suits a processor a consumer might want to swap;
 * these three are fixed parts of the synth, so the package owns them.
 */
async function addModuleFromSource(
  audioContext: AudioContext,
  source: string
): Promise<void> {
  const url = URL.createObjectURL(
    new Blob([source], { type: "text/javascript" })
  );
  try {
    await audioContext.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Load the lookahead-limiter worklet. Returns false rather than throwing so
 * the caller can keep a DynamicsCompressor fallback in place — AudioGraph is
 * built to run either way.
 */
export async function loadLimiterWorklet(
  audioContext: AudioContext
): Promise<boolean> {
  try {
    await addModuleFromSource(audioContext, LIMITER_WORKLET);
    return true;
  } catch (error) {
    console.warn(
      "[sound-synthesis] limiter worklet failed to load — keeping the safety compressor:",
      error
    );
    return false;
  }
}

/** Load the fm-tier worklet. False means the caller should use NodeTierBackend. */
export async function loadFMTierWorklet(
  audioContext: AudioContext
): Promise<boolean> {
  try {
    await addModuleFromSource(audioContext, FM_TIER_WORKLET);
    return true;
  } catch (error) {
    console.warn(
      "[sound-synthesis] fm-tier worklet failed to load — falling back to the node graph:",
      error
    );
    return false;
  }
}

/** Load the ks-string worklet. */
export async function loadKSStringWorklet(
  audioContext: AudioContext
): Promise<boolean> {
  try {
    await addModuleFromSource(audioContext, KS_STRING_WORKLET);
    return true;
  } catch (error) {
    console.warn("[sound-synthesis] ks-string worklet failed to load:", error);
    return false;
  }
}

/**
 * Create a ks-string node (4-voice Karplus-Strong). Only call this after
 * loadKSStringWorklet resolved true on the same AudioContext.
 */
export function createKSStringNode(
  audioContext: AudioContext
): AudioWorkletNode {
  return new AudioWorkletNode(audioContext, "ks-string", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    channelCount: 2,
    channelCountMode: "explicit",
  });
}

/**
 * Create the lookahead-limiter node. Only call this after loadLimiterWorklet
 * resolved true on the same AudioContext.
 */
export function createLimiterNode({
  audioContext,
  onMetrics,
}: {
  audioContext: AudioContext;
  /** Receives meter data at roughly 10 Hz. */
  onMetrics?: LimiterMetricsCallback;
}): AudioWorkletNode {
  const node = new AudioWorkletNode(audioContext, "lookahead-limiter", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    channelCount: 2,
    channelCountMode: "explicit",
  });

  if (onMetrics) {
    node.port.onmessage = (event: MessageEvent<LimiterMetrics>) => {
      onMetrics(event.data);
    };
  }

  return node;
}
