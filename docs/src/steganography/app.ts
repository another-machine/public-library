import example1 from "./exampleStega64.ts";
import example3 from "./exampleStegaAnimator.ts";
import example6 from "./exampleStegassette.ts";
import exampleVisualization from "./exampleVisualization.ts";

exampleVisualization();
example1({ onResult: example3 });
example6();
