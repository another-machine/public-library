import {
  RandomEngine,
  Timecode,
} from "../../../packages/amplib-procedural-generation/src";

export function exampleRandomEngine() {
  run(
    [
      "perlinX",
      "perlinY",
      "perlinZ",
      "length",
      "seed",
      "size",
      "random",
      "seconds",
      "move",
    ],
    ({
      perlinX,
      perlinY,
      perlinZ,
      length,
      seed,
      size,
      random,
      seconds,
      move,
    }) => {
      const values: (number | string)[][] = [];
      const engine = new RandomEngine({ seed, size });
      values[0] = [engine.position];
      values[1] = [engine.position];
      values[1].push(
        JSON.stringify(engine.random(random), null, 2),
        engine.position
      );
      values[2] = [
        engine.position,
        JSON.stringify(engine.move(move), null, 2),
        engine.position,
      ];

      values[3] = [
        JSON.stringify(engine.perlin(perlinX, perlinY, perlinZ), null, 2),
      ];

      const timecode = new Timecode({
        length,
        seconds,
        seed,
      });
      values[4] = [JSON.stringify(timecode.generate(), null, 2)];

      values.forEach((group, i) => {
        (group || []).forEach((value, j) => {
          document
            .querySelectorAll<HTMLElement>(`[data-output="${i}-${j}"]`)
            .forEach((a) => (a.innerText = value.toString()));
        });
      });
    }
  );

  function run(ids, onChange) {
    const values = {};
    const elements = {};

    ids.forEach((id) => {
      elements[id] = document.getElementById(id);
    });

    loop();

    function valueFromElement(element) {
      if (element.type === "number") {
        return element.value ? parseFloat(element.value) : null;
      } else {
        return element.value || null;
      }
    }

    function loop() {
      requestAnimationFrame(loop);

      ids.forEach((id) => {
        const value = valueFromElement(elements[id]);
        if (value !== values[id]) {
          values[id] = value;
          document
            .querySelectorAll<HTMLElement>(`[data-value="${id}"]`)
            .forEach((a) => (a.innerText = value));
        }
      });

      onChange(values);
    }
  }
}
