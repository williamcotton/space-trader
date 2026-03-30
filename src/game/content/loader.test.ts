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
import { initializeBaseContent, getLoadedContentSetIds, resetLoadedContent } from "./loader";
import { getFactionPresentation, getRegisteredResourceTheme, getRegisteredUnitRoleTheme } from "../registries/presentation";

describe("content loader", () => {
  afterEach(() => {
    initializeBaseContent();
  });

  it("can reset and reload base content deterministically", () => {
    resetLoadedContent();

    expect(getLoadedContentSetIds()).toEqual([]);
    expect(getRegisteredFactionIds()).toEqual([]);
    expect(getRegisteredResourceIds()).toEqual([]);
    expect(getRegisteredCardDefinitions()).toEqual({});
    expect(getRegisteredStackEffectDefinitions()).toEqual({});
    expect(() => getFactionPresentation("alloy_clan")).toThrow();

    initializeBaseContent();

    expect(getLoadedContentSetIds()).toEqual(["base"]);
    expect(getRegisteredCardSet("base")?.name).toBe("Base Set");
    expect(getRegisteredFactionIds()).toEqual(["alloy_clan", "flux_collective", "biomass_swarm"]);
    expect(getRegisteredResourceIds()).toEqual(["credits", "alloy", "flux", "biomass"]);
    expect(getOrderedRegisteredResourceModules().map((resource) => resource.id)).toEqual(["credits", "alloy", "flux", "biomass"]);
    expect(getRegisteredCurrencyResourceId()).toBe("credits");
    expect(getRegisteredMap("frontier_belt")?.name).toBe("Frontier Belt");
    expect(getDefaultRuntimeProfile()?.defaultMapId).toBe("frontier_belt");
    expect(getRegisteredStarterDeck("alloy_clan")).toHaveLength(60);
    expect(getFactionPresentation("alloy_clan").animationAccent).toBe("alloy_clan");
    expect(getRegisteredResourceTheme("credits").label).toBe("Credits");
    expect(getRegisteredUnitRoleTheme("combat").label).toBe("Combat");
  });

  it("rebuilds initial game state after a full content reset", () => {
    resetLoadedContent();

    const state = createInitialGameState({ mapId: "frontier_belt" });

    expect(getLoadedContentSetIds()).toEqual(["base"]);
    expect(state.map.id).toBe("frontier_belt");
    expect(state.players.player_1.faction).toBe("alloy_clan");
    expect(state.players.player_2.faction).toBe("flux_collective");
  });
});
