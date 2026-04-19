export type LearnSection = {
  id: string;
  title: string;
  body: string[];
  imageSrc?: string;
  imageAlt?: string;
};

const battlefieldImage = new URL("../../docs/introduction/01-battlefield-overview.png", import.meta.url).href;
const resourcesImage = new URL("../../docs/introduction/02-resources.png", import.meta.url).href;
const phasesImage = new URL("../../docs/introduction/03-turn-phases.png", import.meta.url).href;
const deployImage = new URL("../../docs/introduction/04-deploy-unit.png", import.meta.url).href;
const attackImage = new URL("../../docs/introduction/07-attack-mode.png", import.meta.url).href;
const harvestImage = new URL("../../docs/introduction/08-harvesting-overview.png", import.meta.url).href;
const stackImage = new URL("../../docs/introduction/11-stack-priority.png", import.meta.url).href;
const winImage = new URL("../../docs/introduction/12-base-assault.png", import.meta.url).href;

export const LEARN_SECTIONS: LearnSection[] = [
  {
    id: "battlefield",
    title: "Read the Battlefield",
    body: [
      "A match starts with your base, the enemy base, resource nodes, your hand, and your resource pool already visible.",
      "Your goal is simple: reduce the enemy base to 0 HP before they do the same to you.",
    ],
    imageSrc: battlefieldImage,
    imageAlt: "Battlefield overview screenshot",
  },
  {
    id: "resources",
    title: "Manage Two Resource Types",
    body: [
      "Credits are your universal currency. Alloy, Flux, or Biomass are faction resources gathered from the map.",
      "Cards cost a mix of both, so building economy matters as much as winning fights.",
    ],
    imageSrc: resourcesImage,
    imageAlt: "Resources screenshot",
  },
  {
    id: "turn-phases",
    title: "Play Through the Turn Phases",
    body: [
      "Each turn moves through Start, Economy, Main, Tactical, End, and Discard.",
      "Draws and deposits happen automatically. Main is for deployments, Tactical is for movement, attacks, and harvesting.",
    ],
    imageSrc: phasesImage,
    imageAlt: "Turn phases screenshot",
  },
  {
    id: "deploy",
    title: "Deploy Units in Main Phase",
    body: [
      "Unit cards deploy to open hexes adjacent to your base during Main phase.",
      "New units enter with summoning sickness, so plan one turn ahead instead of expecting immediate impact.",
    ],
    imageSrc: deployImage,
    imageAlt: "Deploy unit screenshot",
  },
  {
    id: "combat",
    title: "Move and Attack in Tactical",
    body: [
      "Select a unit, move to a highlighted hex, then attack with A when you have a target in range.",
      "Armor reduces incoming combat damage, and siege bonuses make dedicated attackers much stronger against bases.",
    ],
    imageSrc: attackImage,
    imageAlt: "Attack mode screenshot",
  },
  {
    id: "harvesting",
    title: "Harvest to Grow Your Economy",
    body: [
      "Capture a node, harvest cargo with a resource unit, then bring that unit back near your base to deposit during Economy.",
      "If a loaded harvester dies before it deposits, the cargo is lost.",
    ],
    imageSrc: harvestImage,
    imageAlt: "Harvesting screenshot",
  },
  {
    id: "stack",
    title: "Use Tactics and the Stack",
    body: [
      "Tactic cards can be played whenever you have priority, even on the opponent's turn.",
      "The stack resolves last-in, first-out. If both players pass, the top item resolves first.",
    ],
    imageSrc: stackImage,
    imageAlt: "Stack and priority screenshot",
  },
  {
    id: "win",
    title: "Close Out the Match",
    body: [
      "Build pressure with units, protect your economy, then push damage through to the enemy base.",
      "Siege-capable units are often what converts board control into an actual win.",
    ],
    imageSrc: winImage,
    imageAlt: "Winning the game screenshot",
  },
];

export const LEARN_QUICK_TIPS = [
  "Main phase is for deploying units. Tactical is for moving, attacking, and harvesting.",
  "Harvesters must return near your base before their cargo turns into usable resources.",
  "Tactic cards use the stack, so the opponent can answer them before they resolve.",
  "Siege bonuses matter most when you are attacking bases.",
];
