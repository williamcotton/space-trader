import { describe, expect, it } from "vitest";
import { requireMapDefinition } from "../content/maps/catalog";
import { axialToPixel, getPlayableHexes, hexDistance, isWithinMapBounds, pixelToAxial } from "./hex";

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

  it("supports an explicit triangular playable footprint for three-player maps", () => {
    const map = requireMapDefinition("frontier_triad");

    expect(getPlayableHexes(map)).toHaveLength(91);
    expect(isWithinMapBounds({ q: 0, r: 0 }, map)).toBe(true);
    expect(isWithinMapBounds({ q: 12, r: 0 }, map)).toBe(true);
    expect(isWithinMapBounds({ q: 0, r: 12 }, map)).toBe(true);
    expect(isWithinMapBounds({ q: 6, r: 6 }, map)).toBe(true);
    expect(isWithinMapBounds({ q: 7, r: 6 }, map)).toBe(false);
    expect(isWithinMapBounds({ q: -1, r: 0 }, map)).toBe(false);
    expect(isWithinMapBounds({ q: 0, r: -1 }, map)).toBe(false);
  });

  it("keeps three-player bases and resource nodes at symmetric distances", () => {
    const map = requireMapDefinition("frontier_triad");
    const players = Object.entries(map.spawnPoints);
    const beaconIds = [
      "triad_credits_player_1",
      "triad_credits_player_2",
      "triad_credits_player_3",
    ];
    const centralBeacon = map.resourceNodes.find((node) => node.id === "triad_credits_center");

    expect(players).toHaveLength(3);
    expect(hexDistance(map.spawnPoints.player_1, map.spawnPoints.player_2)).toBe(9);
    expect(hexDistance(map.spawnPoints.player_1, map.spawnPoints.player_3)).toBe(9);
    expect(hexDistance(map.spawnPoints.player_2, map.spawnPoints.player_3)).toBe(9);
    expect(centralBeacon).toBeDefined();

    for (const [index, [playerId, spawn]] of players.entries()) {
      const beacon = map.resourceNodes.find((node) => node.id === beaconIds[index]);
      expect(beacon).toBeDefined();
      expect(hexDistance(spawn, beacon!.coord)).toBe(4);
      expect(hexDistance(spawn, centralBeacon!.coord)).toBe(6);

      const primaries = map.resourceNodes.filter((node) => node.id.endsWith(playerId) && node.resourceType !== "credits");
      expect(primaries).toHaveLength(3);
      for (const node of primaries) {
        expect(hexDistance(spawn, node.coord)).toBe(2);
      }
    }
  });
});
