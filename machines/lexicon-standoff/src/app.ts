import {
  prompts as lexiconPrompts,
  topics as lexiconTopics,
} from "../../../packages/amplib-lexicon/src";
import {
  RandomEngine,
  type TimecodeSeedResponse,
} from "../../../packages/amplib-procedural-generation/src";

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

const lexiconPlayerFromIndex = (index: number) =>
  lexiconPlayerOptions[lexiconPlayerOptionKeys[index]];

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
  prompts: string[] = [];
  engine: RandomEngine;
  sync = !savedSeed;
  timecodeGenerator: () => TimecodeSeedResponse;
  topics: string[][] = [];

  constructor({ prompts, topics }: { prompts: string[]; topics: string[][] }) {
    this.update({ prompts, topics });
    this.animationLoop();
    this.initializeUI();
  }

  update({ prompts, topics }: { prompts: string[]; topics: string[][] }) {
    this.prompts = [...prompts];
    this.topics = [...topics];
    this.timecodeGenerator = RandomEngine.timecodeGenerator({
      length: 5,
      seconds: 30,
      seed: "lexicon",
    });
  }

  private animationLoop() {
    requestAnimationFrame(this.animationLoop.bind(this));
    this.$inputSeed.readOnly = this.sync;
    if (this.sync) {
      const result = this.timecodeGenerator();
      // Should we just use the timestamp?
      this.$inputSeed.value = result.code;
      // this.$inputSeed.value = (result.position / 10000).toString();
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
    if (savedSeed) {
      this.$inputSeed.value = savedSeed;
    }
    if (savedPlayerCount) {
      this.$inputPlayerCount.value = savedPlayerCount;
    }
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

    if (savedPlayerIndex) {
      this.$formLobby
        .querySelector(`[name="player-index"][value="${savedPlayerIndex}"]`)
        ?.setAttribute("checked", "true");
    }

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
    const promptCount = 1;
    this.engine = new RandomEngine({
      size: imposterCount + topicCount + promptCount,
      seed,
    });
    const randoms = this.engine.random(0);
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
    const prompt =
      lexiconPrompts[Math.floor(randoms[randomIndex] * lexiconPrompts.length)];
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
      prompt,
      imposterIndices,
      playerIndex,
      playerCount,
    });
    this.$formLobby.classList.add("hide");
  }

  private renderRoundUI({
    topics,
    prompt,
    imposterIndices,
    playerIndex,
    playerCount,
  }: {
    topics: string[];
    prompt: string;
    imposterIndices: number[];
    playerIndex: number;
    playerCount: number;
  }) {
    const playerIsImposter = imposterIndices.includes(playerIndex);
    const $elementMain = this.$elementMain;
    const reset = () => {
      document.body.className = "";
      this.$elementMain.innerHTML = "";
      this.$formLobby.classList.remove("hide");
      this.sync = true;
    };
    const realTopics = [topics[0], topics[1]];
    const emoji = lexiconPlayerFromIndex(playerIndex);

    renderStep1();

    function renderStep1() {
      const localTopics = Lexicon.shuffle(
        playerIsImposter ? [...topics] : realTopics
      );
      document.body.className = "odd";
      $elementMain.innerHTML = `
        <section>
          ${localTopics.map((t) => `<h1>${t}</h1>`).join("\n")}
          <p>You are an <strong>${
            playerIsImposter ? "Imposter" : "Agent"
          }</strong></p>
        </section>
  
        <footer>
          <input type="text" placeholder="Prompt: ${prompt}...">
          <button>${emoji} Submit ${emoji}</button>
        </footer>
      `;
      const $button =
        $elementMain.querySelector<HTMLButtonElement>("footer > button")!;
      const $input =
        $elementMain.querySelector<HTMLInputElement>("footer > input")!;
      $button.addEventListener("click", () => {
        if ($input.value) {
          renderStep2($input.value);
        }
      });
    }

    function renderStep2(submission) {
      document.body.className = "";
      $elementMain.innerHTML = `
        <section>
          <h1>"${submission}"</h1>
          <p>${prompt}</p>
          <h2>${realTopics.join(" • ")}</h2>
        </section>
        
        <footer>
          <button>${emoji} Reveal ${emoji}</button>
        </footer>
      `;

      const $button =
        $elementMain.querySelector<HTMLButtonElement>("footer > button")!;
      $button.addEventListener("click", () => {
        renderStep3();
      });
    }

    function renderStep3() {
      document.body.className = "odd";
      $elementMain.innerHTML = `
        <section>
          <h2 class="emoji">${imposterIndices
            .map((i) => lexiconPlayerFromIndex(i))
            .join(" ")}</h2>
          <h2>${realTopics.join(" • ")}<br><s>${topics[2]}</s></h2>
        </section>
        
        <footer>
          <p>${
            playerIsImposter
              ? `Two points if you received ${Math.floor(
                  playerCount * 0.3334
                )} or fewer votes`
              : `One point if you voted for ${imposterIndices
                  .map((i) => lexiconPlayerFromIndex(i))
                  .join(" ")}`
          }</p>
          <button>${emoji} Next ${emoji}</button>
        </footer>
      `;

      const $button =
        $elementMain.querySelector<HTMLButtonElement>("footer > button")!;
      $button.addEventListener("click", () => reset());
    }

    console.log(topics, prompt, imposterIndices, playerIndex, playerCount);
  }

  static shuffle(array: string[]) {
    for (let i = 0; i < 5; i++) {
      array.sort(() => Math.random() - Math.random());
    }
    return array;
  }
}

const game = new Lexicon({
  prompts: lexiconPrompts,
  topics: lexiconTopics,
});
