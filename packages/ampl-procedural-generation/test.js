import { RandomEngine } from "./dist/index.js";

const engine = new RandomEngine({
  size: 100,
  memory: 20,
  seed: "HELLO",
});

const generations = 20000;
const result = [];
let start = performance.now();
engine.to(100000);
for (let i = 0; i < generations; i++) {
  engine.generate();
  result.push(engine.values().join("-"));
}
const compare = result.join("-");
result.splice(0, result.length);
engine.to(100000);
for (let i = 0; i < generations; i++) {
  engine.generate();
  result.push(engine.values().join("-"));
}
const time = performance.now() - start;
if (compare !== result.join("-")) {
  console.error("Not deterministic");
} else if (engine.history.length !== 20) {
  console.error("History corrupted");
} else {
  console.log("Success!");
}
