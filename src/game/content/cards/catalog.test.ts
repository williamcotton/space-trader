import { describe, expect, it } from "vitest";
import { CARD_DEFINITIONS } from "./catalog";

describe("card catalog balance guardrails", () => {
  it("keeps duplicate neutral counter effects on the same cost", () => {
    expect(CARD_DEFINITIONS.null_intercept.cost).toEqual({ credits: 2 });
    expect(CARD_DEFINITIONS.jammer_cloud.cost).toEqual({ credits: 2 });
    expect(CARD_DEFINITIONS.holdfast_protocol.cost).toEqual({ credits: 2 });
  });

  it("keeps duplicate neutral base-damage effects on the same cost", () => {
    expect(CARD_DEFINITIONS.emergency_thrust.cost).toEqual({ credits: 2 });
    expect(CARD_DEFINITIONS.scrap_burst.cost).toEqual({ credits: 2 });
  });

  it("keeps Support Drone on the same skirmisher baseline as Frontline Scout", () => {
    const supportDrone = CARD_DEFINITIONS.support_drone_card;
    const frontlineScout = CARD_DEFINITIONS.frontline_scout_card;
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
});
