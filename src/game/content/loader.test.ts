import { afterEach, describe, expect, it } from "vitest";
import { createInitialGameState } from "../model/state";
import {
  getRegisteredCardSet,
  getDefaultRuntimeProfile,
  getOrderedRegisteredResourceModules,
  getRegisteredFactionIds,
  getRegisteredCurrencyResourceId,
  getRegisteredMap,
  getRegisteredStarterDeck,
  getRegisteredCardDefinitions,
  getRegisteredStackEffectDefinitions,
  getRegisteredResourceIds,
} from "./registry";
import { initializeDefaultContent, getLoadedContentSetIds, loadConfiguredContentSets, resetLoadedContent } from "./loader";
import { getFactionPresentation, getRegisteredResourceTheme, getRegisteredUnitRoleTheme } from "../registries/presentation";
import { TEST_EXPANSION_SET } from "../../test/testExpansion";

describe("content loader", () => {
  afterEach(() => {
    initializeDefaultContent();
  });

  it("can reset and reload default content deterministically", () => {
    resetLoadedContent();

    expect(getLoadedContentSetIds()).toEqual([]);
    expect(getRegisteredFactionIds()).toEqual([]);
    expect(getRegisteredResourceIds()).toEqual([]);
    expect(getRegisteredCardDefinitions()).toEqual({});
    expect(getRegisteredStackEffectDefinitions()).toEqual({});
    expect(() => getFactionPresentation("alloy_clan")).toThrow();

    initializeDefaultContent();

    expect(getLoadedContentSetIds()).toEqual(["foundation", "alpha"]);
    expect(getRegisteredCardSet("alpha")?.name).toBe("Alpha");
    expect(getRegisteredFactionIds()).toEqual(["alloy_clan", "flux_collective", "biomass_swarm"]);
    expect(getRegisteredResourceIds()).toEqual(["credits", "alloy", "flux", "biomass"]);
    expect(getOrderedRegisteredResourceModules().map((resource) => resource.id)).toEqual(["credits", "alloy", "flux", "biomass"]);
    expect(getRegisteredCurrencyResourceId()).toBe("credits");
    expect(getRegisteredMap("frontier_belt")?.name).toBe("Frontier Belt");
    expect(getRegisteredMap("frontier_crossroads")?.name).toBe("Frontier Crossroads");
    expect(getDefaultRuntimeProfile()?.defaultMapId).toBe("frontier_belt");
    expect(getRegisteredStarterDeck("alloy_clan")).toHaveLength(60);
    expect(getFactionPresentation("alloy_clan").animationAccent).toBe("alloy_clan");
    expect(getRegisteredResourceTheme("credits").label).toBe("Credits");
    expect(getRegisteredUnitRoleTheme("combat").label).toBe("Combat");
  });

  it("rebuilds initial game state after a full content reset", () => {
    resetLoadedContent();

    const state = createInitialGameState({ mapId: "frontier_belt" });

    expect(getLoadedContentSetIds()).toEqual(["foundation", "alpha"]);
    expect(state.map.id).toBe("frontier_belt");
    expect(state.players.player_1.faction).toBe("alloy_clan");
    expect(state.players.player_2.faction).toBe("flux_collective");
  });

  it("loads base plus an expansion set through the configured content selection API", () => {
    loadConfiguredContentSets({
      extraSets: [TEST_EXPANSION_SET],
      reset: true,
    });

    expect(getLoadedContentSetIds()).toEqual(["foundation", "alpha", "test_expansion"]);
    expect(getRegisteredCardSet("test_expansion")?.name).toBe("Test Expansion");
    expect(getRegisteredFactionIds()).toContain("crystal_clan");
    expect(getRegisteredResourceIds()).toContain("crystal");
    expect(getRegisteredMap("test_expansion_frontier")?.name).toBe("Test Expansion Frontier");
    expect(getFactionPresentation("crystal_clan").animationAccent).toBe("crystal_clan");
  });
});
