import {
  constraints as lexiconConstraints,
  topics as lexiconTopics,
} from "@ampl/lexicon";
import { RandomEngine } from "@ampl/procedural-generation";

const $main = document.querySelector("main") as HTMLElement;
const $lost = document.getElementById("lost") as HTMLButtonElement;
const $won = document.getElementById("won") as HTMLButtonElement;
const $groupA = document.getElementById("group-a") as HTMLButtonElement;
const $groupB = document.getElementById("group-b") as HTMLButtonElement;
const $generation = document.getElementById("generation") as HTMLInputElement;
const $constants = document.getElementById("constants") as HTMLFormElement;
const $level = document.getElementById("level") as HTMLInputElement;
const $levelDisplay = document.getElementById(
  "level-display"
) as HTMLButtonElement;
const $seed = document.getElementById("seed") as HTMLInputElement;

const stages = generateStages([
  { guesses: 1, start: 3, end: 5 },
  { guesses: 2, start: 4, end: 7 },
  { guesses: 3, start: 5, end: 8 },
]);

const maxItems = 10;
const maxGuesses = 3;
const rangeItems = maxItems * 2;
const size = rangeItems + maxGuesses;
const memory = 10;
const searchParams = new URLSearchParams(window.location.search);
const seed = searchParams.get("s") || "your-seed-here";

interface State {
  level: number;
  seed: string;
  engine?: RandomEngine | null;
  side?: "a" | "b";
}

const state = {
  level: 1,
  seed,
  engine: new RandomEngine({ seed: "", size, memory }),
  side: undefined,
};

generateEngine();

$seed.value = state.seed;
$groupA.addEventListener("click", () => handleGroupChange("a"));
$groupB.addEventListener("click", () => handleGroupChange("b"));
$levelDisplay.addEventListener("click", () =>
  $constants.classList.remove("hide")
);
$constants.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!state.side) {
    return;
  }
  const level = parseInt($level.value);
  const generation = parseInt($generation.value);
  if ($seed.value !== state.seed) {
    handleSeedChange($seed.value);
  }

  if (generation !== state.engine?.generation) {
    state.engine.to(generation);
  }

  updateLevel(level);

  $constants.classList.add("hide");
});

$lost.addEventListener("click", () => generateAndUpdateLevel(state.level - 1));
$won.addEventListener("click", () => generateAndUpdateLevel(state.level + 1));

function generateEngine() {
  state.engine = new RandomEngine({
    size,
    memory,
    seed: state.seed,
  });
}

function handleSeedChange(seed) {
  state.seed = seed;
  searchParams.set("s", seed);
  const { protocol, host, pathname } = window.location;
  const path = [
    protocol,
    "//",
    host,
    pathname,
    "?",
    searchParams.toString(),
  ].join("");
  window.history.replaceState({ path }, "", path);
  generateEngine();
}

function handleGroupChange(aOrB) {
  state.side = aOrB;
  if (aOrB === "a") {
    $groupA.classList.remove("unselected");
    $groupB.classList.add("unselected");
    document.body.classList.add("group-a");
    document.body.classList.remove("group-b");
  } else if (aOrB === "b") {
    $groupA.classList.add("unselected");
    $groupB.classList.remove("unselected");
    document.body.classList.add("group-b");
    document.body.classList.remove("group-a");
  }
}

function generateAndUpdateLevel(level) {
  state.engine.generate();
  $generation.value = state.engine.generation.toString();
  updateLevel(level);
}

function updateLevel(level) {
  if (level !== state.level) {
    state.level = Math.max(level, 1);
  }
  $level.value = state.level.toString();
  $levelDisplay.innerText = `Level ${state.level}`;
  if (state.level % 2 === 0) {
    document.body.classList.remove("odd");
    document.body.classList.add("even");
  } else {
    document.body.classList.add("odd");
    document.body.classList.remove("even");
  }

  const constraints = extractConstraints();
  const terms = extractTerms();

  const { guesses, quantity } =
    stages[Math.min(stages.length, state.level) - 1];

  const constraintsDisplay = [...constraints].slice(0, guesses);
  const termsDisplay = shuffle([...terms].slice(0, quantity));
  const terms2Display = [...terms].slice(0, guesses);

  drawTerms(constraintsDisplay, termsDisplay, terms2Display);
}

function drawTerms(constraints, terms, terms2) {
  const termConstraint = (term, constraint) =>
    `<li><strong>${term}</strong><br><em>${constraint}</em></li>`;

  $main.innerHTML = `
    <div class="view-1">
      <ul>
        ${terms.map((term) => `<li><strong>${term}</strong></li>`).join("")}
      </ul>
    </div>
    <div class="view-2">
      <ul>
        ${terms2
          .map((term, i) => termConstraint(term, constraints[i]))
          .join("")}
      </ul>
    </div>`;
}

function extractConstraints() {
  const values = state.engine.values();
  const possible = lexiconConstraints;
  const straints: string[] = [];
  for (let i = 0; i < maxGuesses; i++) {
    straints.push(possible[Math.floor(values[maxItems + i] * possible.length)]);
  }
  return straints;
}

function extractTerms() {
  const values = state.engine.values();
  const terms: string[] = [];
  const topicsTmp: string[][] = [];
  lexiconTopics.forEach((group) => topicsTmp.push([...group]));
  for (let i = 0; i < rangeItems; i += 2) {
    const group = topicsTmp[Math.floor(values[i] * topicsTmp.length)];
    const index = Math.floor(values[i + 1] * group.length);
    const item = group.splice(index, 1)[0];
    terms.push(item);
  }
  return terms;
}

function generateStages(
  params: { guesses: number; start: number; end: number }[]
) {
  const data: { guesses: number; quantity: number }[] = [];
  params.forEach(({ guesses, start, end }) => {
    for (let a = start; a <= end; a++) {
      for (let i = 0; i < 3; i++) {
        data.push({ guesses, quantity: a });
      }
    }
  });
  return data;
}

function shuffle(array) {
  let currentIndex = array.length;
  let randomIndex;

  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }

  return array;
}
