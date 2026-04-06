import { describe, expect, it } from "vitest";
import { requireMapDefinition } from "../content/maps/catalog";
import { axialToPixel, hexDistance, isWithinMapBounds, pixelToAxial } from "./hex";

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

describe("map footprints", () => {
  it("supports explicit playable hex footprints for square-style maps", () => {
    const map = requireMapDefinition("frontier_crossroads");

    expect(isWithinMapBounds({ q: -1, r: -3 }, map)).toBe(true);
    expect(isWithinMapBounds({ q: 5, r: -3 }, map)).toBe(true);
    expect(isWithinMapBounds({ q: 6, r: 4 }, map)).toBe(false);
    expect(isWithinMapBounds({ q: -6, r: -4 }, map)).toBe(false);
  });

  it("keeps four-player trade beacons and primary nodes at symmetric base distances", () => {
    const map = requireMapDefinition("frontier_crossroads");
    const players = Object.entries(map.spawnPoints);
    const beaconIds = [
      "crossroads_credits_player_1",
      "crossroads_credits_player_2",
      "crossroads_credits_player_3",
      "crossroads_credits_player_4",
    ];

    for (const [index, [playerId, spawn]] of players.entries()) {
      const beacon = map.resourceNodes.find((node) => node.id === beaconIds[index]);
      expect(beacon).toBeDefined();
      expect(hexDistance(spawn, beacon!.coord)).toBe(4);

      const primaries = map.resourceNodes.filter((node) => node.id.endsWith(playerId));
      expect(primaries).toHaveLength(4);
      const primaryResources = primaries.filter((node) => node.resourceType !== "credits");
      expect(primaryResources).toHaveLength(3);
      for (const node of primaryResources) {
        expect(hexDistance(spawn, node.coord)).toBe(2);
      }
    }
  });
});
