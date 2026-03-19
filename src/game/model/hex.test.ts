import { describe, expect, it } from "vitest";
import { axialToPixel, pixelToAxial } from "./hex";

describe("hex pixel conversion", () => {
  it("round-trips axial coords through pixel space", () => {
    const origin = { x: 512, y: 414 };
    const size = 34;
    const coords = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: -3, r: 2 },
      { q: 4, r: -1 },
      { q: -5, r: 0 },
    ];

    for (const coord of coords) {
      const point = axialToPixel(coord, origin, size);
      const resolved = pixelToAxial(point, origin, size);
      expect(resolved).toEqual(coord);
    }
  });
});
