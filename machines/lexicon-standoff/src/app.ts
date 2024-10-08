import {
  constraints as lexiconConstraints,
  topics as lexiconTopics,
} from "../../../packages/ampl-lexicon/src";
import {
  RandomEngine,
  type TimecodeSeedResponse,
} from "../../../packages/ampl-procedural-generation/src";

type LexiconPlayerOptionKey =
  | "bear"
  | "bee"
  | "chicken"
  | "cow"
  | "dog"
  | "fox"
  | "hamster"
  | "horse"
  | "koala"
  | "ladybug"
  | "mouse"
  | "octopus"
  | "panda"
  | "pig"
  | "rabbit"
  | "unicorn";

const lexiconPlayerOptions: { [K in LexiconPlayerOptionKey]: string } = {
  bear: "🐻",
  bee: "🐝",
  chicken: "🐔",
  cow: "🐮",
  dog: "🐶",
  fox: "🦊",
  hamster: "🐹",
  horse: "🐴",
  koala: "🐨",
  ladybug: "🐞",
  mouse: "🐭",
  octopus: "🐙",
  panda: "🐼",
  pig: "🐷",
  rabbit: "🐰",
  unicorn: "🦄",
};
const lexiconPlayerOptionKeys: LexiconPlayerOptionKey[] = Object.keys(
  lexiconPlayerOptions
) as LexiconPlayerOptionKey[];

const searchParams = new URLSearchParams(window.location.search);
// Optionally start via url
const savedSeed = searchParams.get("seed");
const savedPlayerCount = searchParams.get("player-count");
const savedPlayerIndex = searchParams.get("player-index");

class Lexicon {
  $buttonSync = document.getElementById("sync") as HTMLButtonElement;
  $divPlayer = document.getElementById("player") as HTMLDivElement;
  $elementSyncText = document.getElementById("sync-text") as HTMLSpanElement;
  $elementMain = document.querySelector("main") as HTMLElement;
  $formLobby = document.getElementById("lobby") as HTMLFormElement;
  $inputPlayerCount = document.getElementById(
    "player-count"
  ) as HTMLInputElement;
  $inputSeed = document.getElementById("seed") as HTMLInputElement;
  constraints: string[] = [];
  engine: RandomEngine;
  sync = true;
  timecodeGenerator: () => TimecodeSeedResponse;
  topics: string[][] = [];

  constructor({
    constraints,
    topics,
  }: {
    constraints: string[];
    topics: string[][];
  }) {
    this.update({ constraints, topics });
    this.animationLoop();
    this.initializeUI();
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
    this.timecodeGenerator = RandomEngine.timecodeGenerator({
      seconds: 30,
      seed: "lexicon",
      size: 5,
    });
  }

  private animationLoop() {
    requestAnimationFrame(this.animationLoop.bind(this));
    this.$inputSeed.readOnly = this.sync;
    if (this.sync) {
      const result = this.timecodeGenerator();
      // Should we just use the timestamp?
      // this.$inputSeed.value = result.code;
      this.$inputSeed.value = (result.position / 10000).toString();
      this.$elementSyncText.innerHTML = (result.expiry / 1000).toFixed(1);
    } else {
      this.$elementSyncText.innerHTML = "&nbsp;";
    }
  }

  private handlePlayerCountChange() {
    const playerCount = parseInt(this.$inputPlayerCount.value);
    this.$divPlayer.innerHTML = ``;
    for (let i = 0; i < playerCount; i++) {
      const key = lexiconPlayerOptionKeys[i];
      const emoji = lexiconPlayerOptions[key];
      this.$divPlayer.innerHTML += `<label for="player-${key}">
        <input id="player-${key}" name="player-index" ${
        i === 0 ? "checked" : ""
      } type="radio" value="${i}" />
        <span>${emoji}</span>
      </label>`;
    }
  }

  private initializeUI() {
    this.$buttonSync.addEventListener("click", () => {
      this.sync = !this.sync;
      if (this.sync) {
        this.$buttonSync.classList.remove("alternate");
      } else {
        this.$buttonSync.classList.add("alternate");
      }
    });
    this.$inputPlayerCount.addEventListener(
      "input",
      this.handlePlayerCountChange.bind(this)
    );
    this.handlePlayerCountChange();

    this.$formLobby.addEventListener("submit", (e) => {
      e.preventDefault();
      this.sync = false;
      const formData = new FormData(this.$formLobby);
      const playerIndex = parseInt(formData.get("player-index") as string);
      const playerCount = parseInt(formData.get("player-count") as string);
      const seed = formData.get("seed") as string;
      this.performRound({ playerIndex, playerCount, seed });
    });
  }

  private performRound({
    playerIndex,
    playerCount,
    seed,
  }: {
    playerIndex: number;
    playerCount: number;
    seed: string;
  }) {
    searchParams.set("seed", seed);
    searchParams.set("player-count", playerCount.toString());
    searchParams.set("player-index", playerIndex.toString());

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
    const imposterCount = Math.floor(playerCount / 3);
    const topicCount = 3 * 2; // two randoms per topic
    const constraintCount = 1;
    this.engine = new RandomEngine({
      size: imposterCount + topicCount + constraintCount,
      memory: 1,
      seed,
    });
    this.engine.generate();
    const randoms = this.engine.values();
    const topics: string[] = [];
    const tempTopics = [...lexiconTopics];
    let randomIndex = 0;
    for (let i = 0; i < 3; i++) {
      const category = tempTopics.splice(
        Math.floor(randoms[randomIndex] * tempTopics.length),
        1
      )[0];
      randomIndex++;
      const topic =
        category[Math.floor(randoms[randomIndex] * category.length)];
      randomIndex++;
      topics.push(topic);
    }
    const constraint = lexiconConstraints[randomIndex];
    randomIndex++;
    const playerIndices: number[] = [];
    for (let i = 0; i < playerCount; i++) {
      playerIndices.push(i);
    }
    const imposterIndices: number[] = [];
    for (let i = 0; i < imposterCount; i++) {
      imposterIndices.push(
        playerIndices[Math.floor(randoms[randomIndex] * playerIndices.length)]
      )[0];
      randomIndex++;
    }

    this.renderRoundUI({
      topics,
      constraint,
      imposterIndices,
      playerIndex,
      playerCount,
    });
    this.$formLobby.classList.add("hide");
  }

  private renderRoundUI({
    topics,
    constraint,
    imposterIndices,
    playerIndex,
    playerCount,
  }: {
    topics: string[];
    constraint: string;
    imposterIndices: number[];
    playerIndex: number;
    playerCount: number;
  }) {
    const playerIsImposter = imposterIndices.includes(playerIndex);
    const firstRoundTopicsArray = Lexicon.shuffle(
      playerIsImposter ? [...topics] : [topics[0], topics[1]]
    );
    this.$elementMain.innerHTML = `
    <h1>You are an ${playerIsImposter ? "Imposter" : "Agent"}!</h1>
    <h2>Topics</h2>
    <p>${firstRoundTopicsArray.join(" • ")}</p>
    <h2>Constraint</h2>
    <p>${constraint}</p>
`;
    console.log(topics, constraint, imposterIndices, playerIndex, playerCount);
  }

  static shuffle(array: string[]) {
    for (let i = 0; i < 5; i++) {
      array.sort(() => Math.random() - Math.random());
    }
    return array;
  }
}

const game = new Lexicon({
  constraints: lexiconConstraints,
  topics: lexiconTopics,
});
