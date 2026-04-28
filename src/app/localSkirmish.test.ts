import { describe, expect, it } from "vitest";
import { createLocalSkirmishFactionAssignments } from "./localSkirmish";
import type { Faction } from "../game/model/enums";

const FACTIONS: Faction[] = ["alloy_clan", "flux_collective", "biomass_swarm"];

describe("createLocalSkirmishFactionAssignments", () => {
  it("keeps the selected faction on player one", () => {
    const factions = createLocalSkirmishFactionAssignments("biomass_swarm", "alpha_default", FACTIONS, () => 0);

    expect(factions.player_1).toBe("biomass_swarm");
  });

  it("varies the 1v1 AI faction across all factions, including mirrors", () => {
    const first = createLocalSkirmishFactionAssignments("alloy_clan", "alpha_default", FACTIONS, () => 0);
    const second = createLocalSkirmishFactionAssignments("alloy_clan", "alpha_default", FACTIONS, () => 0.75);

    expect(first.player_2).toBe("alloy_clan");
    expect(second.player_2).toBe("biomass_swarm");
  });

  it("assigns each configured AI slot for multiplayer skirmish presets", () => {
    const factions = createLocalSkirmishFactionAssignments("flux_collective", "alpha_four_player", FACTIONS, () => 0);

    expect(factions.player_1).toBe("flux_collective");
    expect(factions.player_2).toBe("alloy_clan");
    expect(factions.player_3).toBe("flux_collective");
    expect(factions.player_4).toBe("biomass_swarm");
  });

  it("falls back to the selected faction when no registered factions are available", () => {
    const factions = createLocalSkirmishFactionAssignments("biomass_swarm", "alpha_default", [], () => 0);

    expect(factions.player_1).toBe("biomass_swarm");
    expect(factions.player_2).toBe("biomass_swarm");
  });
});
