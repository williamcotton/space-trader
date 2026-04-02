import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./seed", () => ({
  createMatchSeed: () => 123456789,
}));
import { Matchmaker } from "./matchmaker";
import { RoomStore } from "./roomStore";
import { SessionStore } from "./sessionStore";
import { initializeServerContent } from "./createMatchState";

type CapturedStream = {
  chunks: string[];
  write: (chunk: string) => boolean;
};

function createCapturedStream(): CapturedStream {
  return {
    chunks: [],
    write(chunk: string) {
      this.chunks.push(chunk);
      return true;
    },
  };
}

function parseServerEvents(stream: CapturedStream): unknown[] {
  return stream.chunks
    .join("")
    .split("\n\n")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      if (!entry.startsWith("data: ")) {
        throw new Error(`Unexpected SSE chunk: ${entry}`);
      }
      return JSON.parse(entry.slice("data: ".length)) as unknown;
    });
}

describe("Matchmaker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves queued factions in match_start payloads", () => {
    initializeServerContent();

    const sessionStore = new SessionStore();
    const roomStore = new RoomStore();
    const matchmaker = new Matchmaker({
      sessionStore,
      roomStore,
    });

    const playerOneToken = "player_one_token";
    const playerTwoToken = "player_two_token";
    const playerOneStream = createCapturedStream();
    const playerTwoStream = createCapturedStream();

    sessionStore.attachStream(playerOneToken, playerOneStream as never);
    sessionStore.attachStream(playerTwoToken, playerTwoStream as never);

    expect(matchmaker.joinQueue(playerOneToken, "alloy_clan")).toEqual({ ok: true });
    expect(matchmaker.joinQueue(playerTwoToken, "biomass_swarm")).toEqual({ ok: true });

    const playerOneEvents = parseServerEvents(playerOneStream);
    const playerTwoEvents = parseServerEvents(playerTwoStream);

    const playerOneMatchStart = playerOneEvents.find(
      (event): event is { type: "match_start"; payload: { factions: { player_1: string; player_2: string } } } =>
        typeof event === "object" && event !== null && "type" in event && event.type === "match_start"
    );
    const playerTwoMatchStart = playerTwoEvents.find(
      (event): event is { type: "match_start"; payload: { factions: { player_1: string; player_2: string } } } =>
        typeof event === "object" && event !== null && "type" in event && event.type === "match_start"
    );

    expect(playerOneMatchStart?.payload.factions).toEqual({
      player_1: "alloy_clan",
      player_2: "biomass_swarm",
    });
    expect(playerTwoMatchStart?.payload.factions).toEqual({
      player_1: "alloy_clan",
      player_2: "biomass_swarm",
    });
  });
});
