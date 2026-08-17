import exampleStegassetteText from "./exampleStegassetteText.ts";
import exampleStegassetteAudio from "./exampleStegassette.ts";
import exampleStegaAnimator from "./exampleStegaAnimator.ts";
import exampleAudioInPixels from "./exampleAudioInPixels.ts";
import exampleStegaprint from "./exampleStegaprint.ts";

// The animator has no source of its own — it animates whatever the text
// example last encoded, so it is wired to that example's result.
exampleStegassetteText({ onResult: exampleStegaAnimator });
exampleStegassetteAudio();
exampleAudioInPixels();
exampleStegaprint();
