import { RandomEngine } from "./dist/index.js";

const engine = new RandomEngine({
  size: 100,
  seed: "test",
});

testStep();
testStepDirection();
testTimecodeGenerator();

function testStep() {
  const generations = 20000;
  const result = [];
  const startTime = performance.now();
  engine.to(100000);
  for (let i = 0; i < generations; i++) {
    engine.step();
    result.push(engine.values.join("-"));
  }
  const compare = result.join("-");
  result.splice(0, result.length);
  engine.to(100000);
  for (let i = 0; i < generations; i++) {
    engine.step();
    result.push(engine.values.join("-"));
  }
  const time = performance.now() - startTime;
  if (compare !== result.join("-")) {
    console.error({
      test: "step",
      success: false,
      message: "determinism",
      time,
    });
  } else {
    console.log({ test: "step", success: true, time });
  }
}

function testStepDirection() {
  const startTime = performance.now();
  engine.to(100);

  engine.step(0);
  const zeroA = engine.values.join("-");
  engine.step(0);
  const zeroB = engine.values.join("-");
  engine.step(2);
  const forward2 = engine.values.join("-");
  engine.step(-2);
  const backward2 = engine.values.join("-");

  const time = performance.now() - startTime;
  if (zeroA === zeroB && zeroB === backward2 && forward2 !== backward2) {
    console.log({ test: "step-direction", success: true, time });
  } else {
    console.error({
      test: "step-direction",
      success: false,
      message: "determinism",
      time,
    });
  }
}

function testTimecodeGenerator() {
  const generator = RandomEngine.timecodeGenerator({
    seed: "test",
    size: 4,
    seconds: 30,
  });
  const results = [generator(), generator(), generator()];
  console.log({ test: "timecodeGenerator", results });
}
