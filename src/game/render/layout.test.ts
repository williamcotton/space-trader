import { describe, expect, it } from "vitest";
import { requireMapDefinition } from "../content/maps/catalog";
import { getHexMetrics } from "./layout";

describe("getHexMetrics", () => {
  it("preserves CSS-space board sizing across display scales", () => {
    const map = requireMapDefinition("frontier_belt");
    const standard = getHexMetrics({ width: 1000, height: 760, scale: 1 }, map);
    const retina = getHexMetrics({ width: 2000, height: 1520, scale: 2 }, map);

    expect(retina.size / 2).toBeCloseTo(standard.size, 6);
    expect(retina.origin.x / 2).toBeCloseTo(standard.origin.x, 6);
    expect(retina.origin.y / 2).toBeCloseTo(standard.origin.y, 6);
  });
});
