import {
  constraints as lexiconConstraints,
  topics as lexiconTopics,
} from "../../../packages/ampl-lexicon/src";
import {
  RandomEngine,
  type TimecodeSeedResponse,
} from "../../../packages/ampl-procedural-generation/src";

interface MindmeldStage {
  guesses: number;
  quantity: number;
}

class Mindmeld {
  $buttonGroupA = document.getElementById("group-a") as HTMLButtonElement;
  $buttonGroupB = document.getElementById("group-b") as HTMLButtonElement;
  $buttonSubmit = document.querySelector(
    'button[type="submit"]'
  ) as HTMLButtonElement;
  $buttonLevelDisplay = document.getElementById(
    "level-display"
  ) as HTMLButtonElement;
  $buttonLostAction = document.getElementById("lost") as HTMLButtonElement;
  $buttonWonAction = document.getElementById("won") as HTMLButtonElement;
  $buttonSync = document.getElementById("sync") as HTMLButtonElement;
  $elementSyncText = document.getElementById("sync-text") as HTMLSpanElement;
  $elementMain = document.querySelector("main") as HTMLElement;
  $formConstants = document.getElementById("settings") as HTMLFormElement;
  $inputGeneration = document.getElementById("generation") as HTMLInputElement;
  $inputLevel = document.getElementById("level") as HTMLInputElement;
  $inputSeed = document.getElementById("seed") as HTMLInputElement;
  constraints: string[] = [];
  currentLevel: number;
  currentSeed: string;
  currentSide: "a" | "b";
  engine: RandomEngine;
  maxGuesses = 3;
  maxItems = 10;
  rangeItems = 20; // maxItems * 2;
  stages = Mindmeld.generateStages([
    { guesses: 1, start: 3, end: 5 },
    { guesses: 2, start: 4, end: 7 },
    { guesses: 3, start: 5, end: 8 },
  ]);
  sync = false;
  timecodeGenerator: () => TimecodeSeedResponse;
  topics: string[][] = [];

  constructor({
    constraints,
    topics,
    level,
    seed,
    side,
  }: {
    constraints: string[];
    topics: string[][];
    level: number;
    seed: string;
    side: "a" | "b";
  }) {
    this.currentLevel = level;
    this.currentSeed = seed;
    this.currentSide = side;
    this.update({ constraints, topics });
    this.initializeUI();
    this.handleGroupChange(side);
    this.animationLoop();
  }

  update({
    constraints,
    topics,
  }: {
    constraints: string[];
    topics: string[][];
  }) {
    this.constraints = [...constraints];
    this.topics = [...topics];
    this.generateEngine();
    this.timecodeGenerator = RandomEngine.timecodeGenerator({
      seconds: 30,
      seed: this.currentSeed,
      size: 5,
    });
  }

  private animationLoop() {
    requestAnimationFrame(this.animationLoop.bind(this));
    this.$inputGeneration.disabled = this.sync;
    this.$inputSeed.disabled = this.sync;
    if (this.sync) {
      const result = this.timecodeGenerator();
      this.$inputSeed.value = result.code;
      this.$elementSyncText.innerHTML = (result.expiry / 1000).toFixed(1);
    } else {
      this.$elementSyncText.innerHTML = "&nbsp;";
    }
  }

  private generateEngine() {
    this.engine = new RandomEngine({
      size: this.rangeItems + this.maxGuesses,
      memory: 10,
      seed: this.currentSeed,
    });
    this.engine.generate();
  }

  private handleSeedChange(seed) {
    this.currentSeed = seed;
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

    this.generateEngine();
  }

  private handleGroupChange(aOrB) {
    this.currentSide = aOrB;
    if (aOrB === "a") {
      this.$buttonGroupA.classList.remove("unselected");
      this.$buttonGroupB.classList.add("unselected");
      document.body.classList.add("group-a");
      document.body.classList.remove("group-b");
    } else if (aOrB === "b") {
      this.$buttonGroupA.classList.add("unselected");
      this.$buttonGroupB.classList.remove("unselected");
      document.body.classList.add("group-b");
      document.body.classList.remove("group-a");
    }
  }

  private generateAndUpdateLevel(level: number) {
    this.engine.generate();
    this.$inputGeneration.value = this.engine.generation.toString();
    this.updateLevel(level);
  }

  private updateLevel(level) {
    if (level !== this.currentLevel) {
      this.currentLevel = Math.max(level, 1);
    }
    this.$inputLevel.value = this.currentLevel.toString();
    this.$buttonLevelDisplay.innerText = `Level ${this.currentLevel}`;
    if (this.currentLevel % 2 === 0) {
      document.body.classList.remove("odd");
      document.body.classList.add("even");
    } else {
      document.body.classList.add("odd");
      document.body.classList.remove("even");
    }

    const constraints = this.extractConstraints();
    const terms = this.extractTerms();

    const { guesses, quantity } =
      this.stages[Math.min(this.stages.length, this.currentLevel) - 1];

    const constraintsDisplay = [...constraints].slice(0, guesses);
    const termsDisplay = shuffle([...terms].slice(0, quantity));
    const terms2Display = [...terms].slice(0, guesses);

    this.renderTerms(constraintsDisplay, termsDisplay, terms2Display);
  }

  private renderTerms(constraints, terms, terms2) {
    const termConstraint = (term, constraint) =>
      `<li><strong>${term}</strong><br><em>${constraint}</em></li>`;

    this.$elementMain.innerHTML = `
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

  private initializeUI() {
    this.$inputSeed.value = this.currentSeed;
    this.$buttonSync.addEventListener("click", () => {
      this.sync = !this.sync;
      if (this.sync) {
        this.$buttonSync.classList.remove("alternate");
      } else {
        this.$buttonSync.classList.add("alternate");
      }
    });
    this.$buttonGroupA.addEventListener("click", () =>
      this.handleGroupChange("a")
    );
    this.$buttonGroupB.addEventListener("click", () =>
      this.handleGroupChange("b")
    );
    this.$buttonLevelDisplay.addEventListener("click", () =>
      this.$formConstants.classList.remove("hide")
    );
    this.$formConstants.addEventListener("submit", (e) => {
      e.preventDefault();
      this.sync = false;
      const level = parseInt(this.$inputLevel.value);
      const generation = parseInt(this.$inputGeneration.value);
      if (this.$inputSeed.value !== this.currentSeed) {
        this.handleSeedChange(this.$inputSeed.value);
      }

      if (generation !== this.engine.generation) {
        this.engine.to(generation);
      }

      this.updateLevel(level);

      this.$formConstants.classList.add("hide");
    });

    this.$buttonLostAction.addEventListener("click", () =>
      this.generateAndUpdateLevel(this.currentLevel - 1)
    );
    this.$buttonWonAction.addEventListener("click", () =>
      this.generateAndUpdateLevel(this.currentLevel + 1)
    );
  }

  private extractConstraints() {
    const values = this.engine.values();
    const possible = this.constraints;
    const results: string[] = [];
    for (let i = 0; i < this.maxGuesses; i++) {
      results.push(
        possible[Math.floor(values[this.maxItems + i] * possible.length)]
      );
    }
    return results;
  }

  private extractTerms() {
    const values = this.engine.values();
    const terms: string[] = [];
    const topicsTmp: string[][] = [];
    this.topics.forEach((group) => topicsTmp.push([...group]));
    for (let i = 0; i < this.rangeItems; i += 2) {
      const group = topicsTmp[Math.floor(values[i] * topicsTmp.length)];
      const index = Math.floor(values[i + 1] * group.length);
      const item = group.splice(index, 1)[0];
      terms.push(item);
    }
    return terms;
  }

  private static generateStages(
    params: { guesses: number; start: number; end: number }[]
  ) {
    const data: MindmeldStage[] = [];
    params.forEach(({ guesses, start, end }) => {
      for (let a = start; a <= end; a++) {
        for (let i = 0; i < 3; i++) {
          data.push({ guesses, quantity: a });
        }
      }
    });
    return data;
  }
}

const searchParams = new URLSearchParams(window.location.search);
const seed = searchParams.get("s") || "your-seed-here";

const game = new Mindmeld({
  constraints: lexiconConstraints,
  topics: lexiconTopics,
  level: 1,
  side: "a",
  seed,
});

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
