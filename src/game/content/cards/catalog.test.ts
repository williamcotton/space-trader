import { describe, expect, it } from "vitest";
import { getCardCatalog } from "./catalog";

describe("card catalog balance guardrails", () => {
  it("keeps the neutral staple counter package distinct", () => {
    const cards = getCardCatalog();
    expect(cards.null_intercept.cost).toEqual({ credits: 3 });
    expect(cards.null_intercept.play.stackEffectId).toBe("counter_top_item");

    expect(cards.failsafe_redirect.cost).toEqual({ credits: 4 });
    expect(cards.failsafe_redirect.play.stackEffectId).toBe("counter_to_hand");

    expect(cards.jammer_cloud.cost).toEqual({ credits: 2 });
    expect(cards.jammer_cloud.play.stackEffectId).toBe("armor_ally_unit_2_eot");
  });

  it("keeps neutral removal and reach cards differentiated with a visible tax", () => {
    const cards = getCardCatalog();
    expect(cards.orbital_ping.play.stackEffectId).toBe("damage_enemy_base_2");
    expect(cards.orbital_ping.play.targetMode).toBe("entity");

    expect(cards.emergency_thrust.cost).toEqual({ credits: 2 });
    expect(cards.emergency_thrust.play.stackEffectId).toBe("damage_enemy_base_2");
    expect(cards.emergency_thrust.play.targetMode).toBe("entity");

    expect(cards.scrap_burst.cost).toEqual({ credits: 3 });
    expect(cards.scrap_burst.play.stackEffectId).toBe("damage_enemy_entity_2");

    expect(cards.holdfast_protocol.cost).toEqual({ credits: 4 });
    expect(cards.holdfast_protocol.play.stackEffectId).toBe("destroy_damaged_enemy_unit");
  });

  it("keeps neutral refuel below faction refuel rate", () => {
    const cards = getCardCatalog();
    expect(cards.emergency_war_chest.cost).toEqual({ credits: 6 });
    expect(cards.emergency_war_chest.play.stackEffectId).toBe("draw_and_gain_resources");

    expect(cards.ion_surge_archive.cost).toEqual({ credits: 3, flux: 2 });
    expect(cards.ion_surge_archive.play.stackEffectId).toBe("draw_and_gain_resources");
    expect(cards.ion_surge_archive.keywords).toContain("surge");
  });

  it("keeps Support Drone on the same skirmisher baseline as Frontline Scout", () => {
    const cards = getCardCatalog();
    const supportDrone = cards.support_drone_card;
    const frontlineScout = cards.frontline_scout_card;
    if (supportDrone.kind !== "unit" || frontlineScout.kind !== "unit") {
      throw new Error("Expected unit cards for skirmisher baseline test.");
    }

    expect(supportDrone.cost).toEqual({ credits: 2, biomass: 1 });
    expect(supportDrone.unit).toMatchObject({
      hp: frontlineScout.unit.hp,
      attackDamage: frontlineScout.unit.attackDamage,
      siegeDamageBonus: frontlineScout.unit.siegeDamageBonus,
      armor: frontlineScout.unit.armor,
      moveRange: frontlineScout.unit.moveRange,
      attackRange: frontlineScout.unit.attackRange,
      attackActionsPerTurn: frontlineScout.unit.attackActionsPerTurn,
    });
  });

  it("defines Feeding Frenzy as the Biomass resource-attack enabler", () => {
    const cards = getCardCatalog();
    expect(cards.feeding_frenzy.cost).toEqual({ credits: 1, biomass: 1 });
    expect(cards.feeding_frenzy.faction).toBe("biomass_swarm");
    expect(cards.feeding_frenzy.play.stackEffectId).toBe("global_unit_buff");
    expect(cards.feeding_frenzy.text).toContain("resource units get +1 ATK and gain Predation");
  });

  it("defines Signal Hijack as the Flux control spell", () => {
    const cards = getCardCatalog();
    expect(cards.signal_hijack.cost).toEqual({ credits: 4, flux: 2 });
    expect(cards.signal_hijack.faction).toBe("flux_collective");
    expect(cards.signal_hijack.play.stackEffectId).toBe("gain_control_of_unit");
    expect(cards.signal_hijack.text).toContain("Gain control of target enemy unit");
  });

  it("defines Bulwark Refit as the Alloy siege conversion tactic", () => {
    const cards = getCardCatalog();
    expect(cards.bulwark_refit.cost).toEqual({ credits: 1, alloy: 2 });
    expect(cards.bulwark_refit.faction).toBe("alloy_clan");
    expect(cards.bulwark_refit.play.stackEffectId).toBe("modify_target_unit");
    expect(cards.bulwark_refit.text).toContain("Emplaced");
    expect(cards.bulwark_refit.text).toContain("Move Range becomes 0");
  });
});
