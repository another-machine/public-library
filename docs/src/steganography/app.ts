import example1 from "./exampleStega64.ts";
import example2 from "./exampleStegaCassette.ts";
import example3 from "./exampleStegaAnimator.ts";
import example4 from "./exampleStegaMetadata.ts";
import example5 from "./exampleStegaBinary.ts";
import exampleVisualization from "./exampleVisualization.ts";

exampleVisualization();
example1({ onResult: example3 });
example2();
example4();
example5();
