import { dispatchCommand } from "../src/game/actions/reducers";
import { decideMvpBotCommand } from "../src/game/ai/mvpBot";
import { FRONTIER_BELT_MAP } from "../src/game/content/maps/frontierBelt";
import { FACTIONS, type Faction, type ResourceType } from "../src/game/model/enums";
import {
  PLAYER_ONE_STARTING_CREDITS,
  PLAYER_TWO_STARTING_CREDITS,
  STARTING_PRIMARY_RESOURCE,
  createInitialGameState,
  createInitialZonesForPlayer,
  syncPlayerZoneCounts,
  type GameState,
} from "../src/game/model/state";
import { getAutoFlowCommand } from "../src/game/turn/autoFlow";

type SimulationConfig = {
  games: number;
  maxTurns: number;
  seed: number;
  playerOneCredits: number;
  playerOnePrimary: number;
  playerTwoCredits: number;
  playerTwoPrimary: number;
  sweepPlayerOneResources: boolean;
  sweepResourceGrid: boolean;
  playerOneCreditCandidates: number[];
  playerOnePrimaryCandidates: number[];
  playerTwoCreditCandidates: number[];
  playerTwoPrimaryCandidates: number[];
};

type MatchResult = {
  pairing: `${Faction}__vs__${Faction}`;
  winnerFaction: Faction | null;
  winnerPlayerId: "player_1" | "player_2" | null;
  turns: number;
  timeout: boolean;
};

type AggregateRow = {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  totalTurns: number;
};

type SimulationSummary = {
  config: SimulationConfig;
  factionAppearanceRows: Map<Faction, AggregateRow>;
  pairingRows: Map<string, AggregateRow>;
  combinedPairingRows: Map<string, AggregateRow>;
  factionGameWins: Map<Faction, number>;
  playerOneWins: number;
  playerTwoWins: number;
  timeouts: number;
  totalTurns: number;
};

const DEFAULT_CONFIG: SimulationConfig = {
  games: 1000,
  maxTurns: 200,
  seed: 20260322,
  playerOneCredits: PLAYER_ONE_STARTING_CREDITS,
  playerOnePrimary: STARTING_PRIMARY_RESOURCE,
  playerTwoCredits: PLAYER_TWO_STARTING_CREDITS,
  playerTwoPrimary: STARTING_PRIMARY_RESOURCE,
  sweepPlayerOneResources: false,
  sweepResourceGrid: false,
  playerOneCreditCandidates: [4, 3, 2, 1, 0],
  playerOnePrimaryCandidates: [2, 1, 0],
  playerTwoCreditCandidates: [4, 5, 6],
  playerTwoPrimaryCandidates: [2, 3],
};

function parseIntegerList(value: string, flag: string): number[] {
  const values = value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((part) => !Number.isNaN(part));

  if (values.length === 0 || values.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error(`Invalid ${flag} value: ${value}`);
  }

  return [...new Set(values)];
}

function parseConfig(argv: string[]): SimulationConfig {
  const config = { ...DEFAULT_CONFIG };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (!arg.startsWith("--") || !value) {
      continue;
    }

    if (arg === "--games") {
      config.games = Number(value);
      index += 1;
      continue;
    }
    if (arg === "--max-turns") {
      config.maxTurns = Number(value);
      index += 1;
      continue;
    }
    if (arg === "--seed") {
      config.seed = Number(value);
      index += 1;
      continue;
    }
    if (arg === "--p1-credits") {
      config.playerOneCredits = Number(value);
      index += 1;
      continue;
    }
    if (arg === "--p1-primary") {
      config.playerOnePrimary = Number(value);
      index += 1;
      continue;
    }
    if (arg === "--p2-credits") {
      config.playerTwoCredits = Number(value);
      index += 1;
      continue;
    }
    if (arg === "--p2-primary") {
      config.playerTwoPrimary = Number(value);
      index += 1;
      continue;
    }
    if (arg === "--sweep-p1-resources") {
      config.sweepPlayerOneResources = value === "true";
      index += 1;
      continue;
    }
    if (arg === "--sweep-resource-grid") {
      config.sweepResourceGrid = value === "true";
      index += 1;
      continue;
    }
    if (arg === "--p1-credit-candidates") {
      config.playerOneCreditCandidates = parseIntegerList(value, arg);
      index += 1;
      continue;
    }
    if (arg === "--p1-primary-candidates") {
      config.playerOnePrimaryCandidates = parseIntegerList(value, arg);
      index += 1;
      continue;
    }
    if (arg === "--p2-credit-candidates") {
      config.playerTwoCreditCandidates = parseIntegerList(value, arg);
      index += 1;
      continue;
    }
    if (arg === "--p2-primary-candidates") {
      config.playerTwoPrimaryCandidates = parseIntegerList(value, arg);
      index += 1;
    }
  }

  if (!Number.isInteger(config.games) || config.games <= 0) {
    throw new Error(`Invalid --games value: ${config.games}`);
  }
  if (!Number.isInteger(config.maxTurns) || config.maxTurns <= 0) {
    throw new Error(`Invalid --max-turns value: ${config.maxTurns}`);
  }
  if (!Number.isFinite(config.seed)) {
    throw new Error(`Invalid --seed value: ${config.seed}`);
  }
  if (!Number.isInteger(config.playerOneCredits) || config.playerOneCredits < 0) {
    throw new Error(`Invalid --p1-credits value: ${config.playerOneCredits}`);
  }
  if (!Number.isInteger(config.playerOnePrimary) || config.playerOnePrimary < 0) {
    throw new Error(`Invalid --p1-primary value: ${config.playerOnePrimary}`);
  }
  if (!Number.isInteger(config.playerTwoCredits) || config.playerTwoCredits < 0) {
    throw new Error(`Invalid --p2-credits value: ${config.playerTwoCredits}`);
  }
  if (!Number.isInteger(config.playerTwoPrimary) || config.playerTwoPrimary < 0) {
    throw new Error(`Invalid --p2-primary value: ${config.playerTwoPrimary}`);
  }
  for (const [flag, values] of [
    ["--p1-credit-candidates", config.playerOneCreditCandidates],
    ["--p1-primary-candidates", config.playerOnePrimaryCandidates],
    ["--p2-credit-candidates", config.playerTwoCreditCandidates],
    ["--p2-primary-candidates", config.playerTwoPrimaryCandidates],
  ] as const) {
    if (values.length === 0 || values.some((value) => !Number.isInteger(value) || value < 0)) {
      throw new Error(`Invalid ${flag} value`);
    }
  }

  return config;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function createStartingResources(
  playerId: "player_1" | "player_2",
  faction: Faction,
  overrides?: {
    credits?: number;
    primary?: number;
  }
): Record<ResourceType, number> {
  const primary = overrides?.primary ?? STARTING_PRIMARY_RESOURCE;
  return {
    credits: overrides?.credits ?? (playerId === "player_1" ? PLAYER_ONE_STARTING_CREDITS : PLAYER_TWO_STARTING_CREDITS),
    alloy: faction === "alloy_clan" ? primary : 0,
    flux: faction === "flux_collective" ? primary : 0,
    biomass: faction === "biomass_swarm" ? primary : 0,
  };
}

function assignFaction(
  state: GameState,
  playerId: "player_1" | "player_2",
  faction: Faction,
  randomSource: () => number,
  resourceOverrides?: {
    credits?: number;
    primary?: number;
  }
): void {
  state.players[playerId].faction = faction;
  state.players[playerId].resources = createStartingResources(playerId, faction, resourceOverrides);
  state.zones[playerId] = createInitialZonesForPlayer(playerId, faction, undefined, randomSource);
}

function createFactionMatch(playerOneFaction: Faction, playerTwoFaction: Faction, config: SimulationConfig, seed: number): GameState {
  const randomSource = createSeededRandom(seed);
  const state = createInitialGameState({
    map: FRONTIER_BELT_MAP,
    matchId: `sim_${seed}`,
    randomSource,
  });

  assignFaction(state, "player_1", playerOneFaction, randomSource, {
    credits: config.playerOneCredits,
    primary: config.playerOnePrimary,
  });
  assignFaction(state, "player_2", playerTwoFaction, randomSource, {
    credits: config.playerTwoCredits,
    primary: config.playerTwoPrimary,
  });
  syncPlayerZoneCounts(state);
  state.log = [
    {
      turn: 1,
      text: `Simulation initialized: ${playerOneFaction} vs ${playerTwoFaction}. P1 ${config.playerOneCredits}/${config.playerOnePrimary} P2 ${config.playerTwoCredits}/${config.playerTwoPrimary}.`,
    },
  ];
  state.lastRejectedReason = null;
  return state;
}

function simulateMatch(playerOneFaction: Faction, playerTwoFaction: Faction, config: SimulationConfig, seed: number): MatchResult {
  const state = createFactionMatch(playerOneFaction, playerTwoFaction, config, seed);
  const stepLimit = config.maxTurns * 200;
  let steps = 0;

  while (!state.winner && state.turn <= config.maxTurns && steps < stepLimit) {
    const autoFlow = getAutoFlowCommand(state);
    if (autoFlow) {
      const result = dispatchCommand(state, autoFlow);
      if (!result.ok) {
        throw new Error(`AutoFlow rejected in ${playerOneFaction} vs ${playerTwoFaction}: ${result.reason}`);
      }
      steps += 1;
      continue;
    }

    const actor = state.priorityPlayerId;
    if (!actor) {
      break;
    }

    const command = decideMvpBotCommand(state, actor);
    if (!command) {
      break;
    }

    const result = dispatchCommand(state, command);
    if (!result.ok) {
      throw new Error(`Bot command rejected in ${playerOneFaction} vs ${playerTwoFaction}: ${result.reason}`);
    }
    steps += 1;
  }

  const timeout = !state.winner;
  const winnerPlayerId = state.winner;
  const winnerFaction = winnerPlayerId ? state.players[winnerPlayerId].faction : null;

  return {
    pairing: `${playerOneFaction}__vs__${playerTwoFaction}`,
    winnerFaction,
    winnerPlayerId,
    turns: state.turn,
    timeout,
  };
}

function increment(row: AggregateRow | undefined): AggregateRow {
  return row ?? { games: 0, wins: 0, losses: 0, draws: 0, totalTurns: 0 };
}

function getUnorderedPairingKey(a: Faction, b: Faction): `${Faction}__${Faction}` {
  return [a, b].sort().join("__") as `${Faction}__${Faction}`;
}

function getCanonicalPair(a: Faction, b: Faction): [Faction, Faction] {
  return [a, b].sort() as [Faction, Faction];
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function getOrderedPairings() {
  return FACTIONS.flatMap((playerOneFaction) => FACTIONS.map((playerTwoFaction) => [playerOneFaction, playerTwoFaction] as const));
}

function collectSimulationSummary(config: SimulationConfig): SimulationSummary {
  const orderedPairings = getOrderedPairings();

  const factionAppearanceRows = new Map<Faction, AggregateRow>();
  const pairingRows = new Map<string, AggregateRow>();
  const combinedPairingRows = new Map<string, AggregateRow>();
  const factionGameWins = new Map<Faction, number>(FACTIONS.map((faction) => [faction, 0]));
  let playerOneWins = 0;
  let playerTwoWins = 0;
  let timeouts = 0;
  let totalTurns = 0;

  for (let gameIndex = 0; gameIndex < config.games; gameIndex += 1) {
    const [playerOneFaction, playerTwoFaction] = orderedPairings[gameIndex % orderedPairings.length]!;
    const seed = config.seed + gameIndex * 7919;
    const result = simulateMatch(playerOneFaction, playerTwoFaction, config, seed);
    totalTurns += result.turns;

    const pairingRow = increment(pairingRows.get(result.pairing));
    pairingRow.games += 1;
    pairingRow.totalTurns += result.turns;
    if (result.timeout || !result.winnerFaction || !result.winnerPlayerId) {
      pairingRow.draws += 1;
      timeouts += 1;
    } else if (result.winnerPlayerId === "player_1") {
      pairingRow.wins += 1;
      playerOneWins += 1;
      factionGameWins.set(result.winnerFaction, (factionGameWins.get(result.winnerFaction) ?? 0) + 1);
    } else {
      pairingRow.losses += 1;
      playerTwoWins += 1;
      factionGameWins.set(result.winnerFaction, (factionGameWins.get(result.winnerFaction) ?? 0) + 1);
    }
    pairingRows.set(result.pairing, pairingRow);

    const [combinedLeft, combinedRight] = getCanonicalPair(playerOneFaction, playerTwoFaction);
    const combinedKey = getUnorderedPairingKey(playerOneFaction, playerTwoFaction);
    const combinedRow = increment(combinedPairingRows.get(combinedKey));
    combinedRow.games += 1;
    combinedRow.totalTurns += result.turns;
    if (result.timeout || !result.winnerFaction || !result.winnerPlayerId) {
      combinedRow.draws += 1;
    } else if (combinedLeft === combinedRight) {
      if (result.winnerPlayerId === "player_1") {
        combinedRow.wins += 1;
      } else {
        combinedRow.losses += 1;
      }
    } else if (result.winnerFaction === combinedLeft) {
      combinedRow.wins += 1;
    } else if (result.winnerFaction === combinedRight) {
      combinedRow.losses += 1;
    }
    combinedPairingRows.set(combinedKey, combinedRow);

    for (const faction of [playerOneFaction, playerTwoFaction] as const) {
      const row = increment(factionAppearanceRows.get(faction));
      row.games += 1;
      row.totalTurns += result.turns;
      if (result.timeout || !result.winnerFaction) {
        row.draws += 1;
      } else if (result.winnerFaction === faction) {
        row.wins += 1;
      } else {
        row.losses += 1;
      }
      factionAppearanceRows.set(faction, row);
    }
  }

  return {
    config,
    factionAppearanceRows,
    pairingRows,
    combinedPairingRows,
    factionGameWins,
    playerOneWins,
    playerTwoWins,
    timeouts,
    totalTurns,
  };
}

function printSimulationSummary(summary: SimulationSummary): void {
  const { config, factionAppearanceRows, pairingRows, combinedPairingRows, factionGameWins, playerOneWins, playerTwoWins, timeouts, totalTurns } = summary;
  const orderedPairings = getOrderedPairings();
  const mirrorSeatStats = getMirrorSeatStats(summary);
  const mirrorDecisiveGames = mirrorSeatStats.games - mirrorSeatStats.draws;
  const mirrorPlayerOneRate = mirrorDecisiveGames === 0 ? 0.5 : mirrorSeatStats.playerOneWins / mirrorDecisiveGames;
  const mirrorPlayerTwoRate = mirrorDecisiveGames === 0 ? 0.5 : mirrorSeatStats.playerTwoWins / mirrorDecisiveGames;
  console.log(`Frontier Belt bot simulation`);
  console.log(
    `games=${config.games} maxTurns=${config.maxTurns} seed=${config.seed} p1Credits=${config.playerOneCredits} p1Primary=${config.playerOnePrimary} p2Credits=${config.playerTwoCredits} p2Primary=${config.playerTwoPrimary}`
  );
  console.log("");
  console.log(`Seat results`);
  console.log(`player_1 wins: ${playerOneWins}`);
  console.log(`player_2 wins: ${playerTwoWins}`);
  console.log(`timeouts: ${timeouts}`);
  console.log(`avg turns: ${(totalTurns / config.games).toFixed(2)}`);
  console.log("");
  console.log(`Same-faction seat results`);
  console.log(`player_1 wins: ${mirrorSeatStats.playerOneWins}`);
  console.log(`player_2 wins: ${mirrorSeatStats.playerTwoWins}`);
  console.log(`timeouts: ${mirrorSeatStats.draws}`);
  console.log(`mirror seat delta: ${formatPercent(getMirrorSeatDelta(summary))}`);
  console.log(`player_1 decisive rate: ${formatPercent(mirrorPlayerOneRate)}`);
  console.log(`player_2 decisive rate: ${formatPercent(mirrorPlayerTwoRate)}`);
  console.log("");
  console.log(`Faction game wins`);

  const decisiveGames = config.games - timeouts;
  const sortedFactions = [...FACTIONS].sort((a, b) => {
    const winsA = factionGameWins.get(a) ?? 0;
    const winsB = factionGameWins.get(b) ?? 0;
    return winsB - winsA || a.localeCompare(b);
  });

  for (const faction of sortedFactions) {
    const wins = factionGameWins.get(faction) ?? 0;
    const appearanceRow = factionAppearanceRows.get(faction)!;
    console.log(
      `${faction.padEnd(16)} wins=${String(wins).padStart(4)} shareOfGames=${formatPercent(wins / config.games)} decisiveShare=${formatPercent(
        decisiveGames === 0 ? 0 : wins / decisiveGames
      )} appearanceWinrate=${formatPercent(appearanceRow.wins / appearanceRow.games)}`
    );
  }

  console.log("");
  console.log(`Combined matchup results`);
  for (const [left, right] of [
    ["alloy_clan", "alloy_clan"],
    ["alloy_clan", "flux_collective"],
    ["alloy_clan", "biomass_swarm"],
    ["flux_collective", "flux_collective"],
    ["biomass_swarm", "flux_collective"],
    ["biomass_swarm", "biomass_swarm"],
  ] as const) {
    const row = combinedPairingRows.get(getUnorderedPairingKey(left, right));
    if (!row) {
      continue;
    }
    console.log(
      `${left} vs ${right}`.padEnd(38) +
        ` leftWins=${String(row.wins).padStart(3)} rightWins=${String(row.losses).padStart(3)} draws=${String(row.draws).padStart(3)} avgTurns=${(
          row.totalTurns / row.games
        ).toFixed(2)}`
    );
  }

  console.log("");
  console.log(`Ordered pairing results`);
  for (const [playerOneFaction, playerTwoFaction] of orderedPairings) {
    const key = `${playerOneFaction}__vs__${playerTwoFaction}`;
    const row = pairingRows.get(key);
    if (!row) {
      continue;
    }
    console.log(
      `${playerOneFaction} vs ${playerTwoFaction}`.padEnd(38) +
        ` p1Wins=${String(row.wins).padStart(3)} p2Wins=${String(row.losses).padStart(3)} draws=${String(row.draws).padStart(3)} avgTurns=${(
          row.totalTurns / row.games
        ).toFixed(2)}`
      );
  }
}

function getSeatDelta(summary: SimulationSummary): number {
  const decisiveGames = summary.config.games - summary.timeouts;
  if (decisiveGames === 0) {
    return 0;
  }
  return Math.abs(summary.playerOneWins / decisiveGames - 0.5);
}

function getMirrorSeatStats(summary: SimulationSummary): {
  playerOneWins: number;
  playerTwoWins: number;
  draws: number;
  games: number;
} {
  let playerOneWins = 0;
  let playerTwoWins = 0;
  let draws = 0;
  let games = 0;

  for (const faction of FACTIONS) {
    const row = summary.pairingRows.get(`${faction}__vs__${faction}`);
    if (!row) {
      continue;
    }
    playerOneWins += row.wins;
    playerTwoWins += row.losses;
    draws += row.draws;
    games += row.games;
  }

  return { playerOneWins, playerTwoWins, draws, games };
}

function getMirrorSeatDelta(summary: SimulationSummary): number {
  const mirror = getMirrorSeatStats(summary);
  const decisiveGames = mirror.games - mirror.draws;
  if (decisiveGames === 0) {
    return 0;
  }
  return Math.abs(mirror.playerOneWins / decisiveGames - 0.5);
}

function getFactionSpread(summary: SimulationSummary): number {
  const rates = FACTIONS.map((faction) => {
    const row = summary.factionAppearanceRows.get(faction);
    if (!row || row.games === 0) {
      return 0;
    }
    return row.wins / row.games;
  });
  return Math.max(...rates) - Math.min(...rates);
}

function rankSummaries(results: SimulationSummary[]): SimulationSummary[] {
  return [...results].sort((a, b) => {
    const mirrorSeatDeltaA = getMirrorSeatDelta(a);
    const mirrorSeatDeltaB = getMirrorSeatDelta(b);
    if (mirrorSeatDeltaA !== mirrorSeatDeltaB) {
      return mirrorSeatDeltaA - mirrorSeatDeltaB;
    }

    const seatDeltaA = getSeatDelta(a);
    const seatDeltaB = getSeatDelta(b);
    if (seatDeltaA !== seatDeltaB) {
      return seatDeltaA - seatDeltaB;
    }

    const factionSpreadA = getFactionSpread(a);
    const factionSpreadB = getFactionSpread(b);
    if (factionSpreadA !== factionSpreadB) {
      return factionSpreadA - factionSpreadB;
    }

    return a.timeouts - b.timeouts;
  });
}

function printSweepSummary(title: string, results: SimulationSummary[]): void {
  console.log(title);
  console.log(`configs=${results.length}`);
  console.log("");

  const ranked = rankSummaries(results);

  for (const result of ranked) {
    const decisiveGames = result.config.games - result.timeouts;
    const p1Rate = decisiveGames === 0 ? 0.5 : result.playerOneWins / decisiveGames;
    const p2Rate = decisiveGames === 0 ? 0.5 : result.playerTwoWins / decisiveGames;
    const mirrorSeatStats = getMirrorSeatStats(result);
    const mirrorDecisiveGames = mirrorSeatStats.games - mirrorSeatStats.draws;
    const mirrorP1Rate = mirrorDecisiveGames === 0 ? 0.5 : mirrorSeatStats.playerOneWins / mirrorDecisiveGames;
    const mirrorP2Rate = mirrorDecisiveGames === 0 ? 0.5 : mirrorSeatStats.playerTwoWins / mirrorDecisiveGames;
    const factionShares = FACTIONS.map((faction) => `${faction}:${result.factionGameWins.get(faction) ?? 0}`).join(" ");
    const mirrorSeatDelta = getMirrorSeatDelta(result);
    const seatDelta = getSeatDelta(result);
    const factionSpread = getFactionSpread(result);
    console.log(
      `p1=${result.config.playerOneCredits}/${result.config.playerOnePrimary} p2=${result.config.playerTwoCredits}/${result.config.playerTwoPrimary}`.padEnd(22) +
        ` mirror=${formatPercent(mirrorP1Rate)}/${formatPercent(mirrorP2Rate)} mirrorDelta=${formatPercent(mirrorSeatDelta)} overall=${formatPercent(
          p1Rate
        )}/${formatPercent(p2Rate)} seatDelta=${formatPercent(seatDelta)} timeouts=${String(result.timeouts).padStart(3)} avgTurns=${(
          result.totalTurns / result.config.games
        ).toFixed(2)} factionSpread=${formatPercent(factionSpread)} ${factionShares}`
    );
  }
}

function runSweep(baseConfig: SimulationConfig): void {
  const results: SimulationSummary[] = [];

  for (const playerOneCredits of baseConfig.playerOneCreditCandidates) {
    for (const playerOnePrimary of baseConfig.playerOnePrimaryCandidates) {
      results.push(
        collectSimulationSummary({
          ...baseConfig,
          playerOneCredits,
          playerOnePrimary,
          sweepPlayerOneResources: false,
          sweepResourceGrid: false,
        })
      );
    }
  }

  printSweepSummary(`Player 1 resource sweep`, results);
  console.log("");
  console.log(`Best by seat balance`);
  const best = rankSummaries(results)[0];
  if (best) {
    printSimulationSummary(best);
  }
}

function runResourceGridSweep(baseConfig: SimulationConfig): void {
  const results: SimulationSummary[] = [];
  const totalConfigs =
    baseConfig.playerOneCreditCandidates.length *
    baseConfig.playerOnePrimaryCandidates.length *
    baseConfig.playerTwoCreditCandidates.length *
    baseConfig.playerTwoPrimaryCandidates.length;
  let configIndex = 0;

  for (const playerOneCredits of baseConfig.playerOneCreditCandidates) {
    for (const playerOnePrimary of baseConfig.playerOnePrimaryCandidates) {
      for (const playerTwoCredits of baseConfig.playerTwoCreditCandidates) {
        for (const playerTwoPrimary of baseConfig.playerTwoPrimaryCandidates) {
          configIndex += 1;
          console.log(
            `Running config ${configIndex}/${totalConfigs}: p1=${playerOneCredits}/${playerOnePrimary} p2=${playerTwoCredits}/${playerTwoPrimary}`
          );
          results.push(
            collectSimulationSummary({
              ...baseConfig,
              playerOneCredits,
              playerOnePrimary,
              playerTwoCredits,
              playerTwoPrimary,
              sweepPlayerOneResources: false,
              sweepResourceGrid: false,
            })
          );
        }
      }
    }
  }

  console.log("");
  printSweepSummary(`Resource grid sweep`, results);
  console.log("");
  console.log(`Best by seat balance`);
  const best = rankSummaries(results)[0];
  if (best) {
    printSimulationSummary(best);
  }
}

const config = parseConfig(process.argv.slice(2));
if (config.sweepResourceGrid) {
  runResourceGridSweep(config);
} else if (config.sweepPlayerOneResources) {
  runSweep(config);
} else {
  printSimulationSummary(collectSimulationSummary(config));
}
