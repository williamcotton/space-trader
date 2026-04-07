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

    expect(matchmaker.joinQueue(playerOneToken, "alloy_clan", "pvp_1v1")).toEqual({ ok: true });
    expect(matchmaker.joinQueue(playerTwoToken, "biomass_swarm", "pvp_1v1")).toEqual({ ok: true });

    const playerOneEvents = parseServerEvents(playerOneStream);
    const playerTwoEvents = parseServerEvents(playerTwoStream);

    const playerOneMatchStart = playerOneEvents.find(
      (event): event is { type: "match_start"; payload: { format: string; playerOrder: string[]; factions: { player_1: string; player_2: string } } } =>
        typeof event === "object" && event !== null && "type" in event && event.type === "match_start"
    );
    const playerTwoMatchStart = playerTwoEvents.find(
      (event): event is { type: "match_start"; payload: { format: string; playerOrder: string[]; factions: { player_1: string; player_2: string } } } =>
        typeof event === "object" && event !== null && "type" in event && event.type === "match_start"
    );

    expect(playerOneMatchStart?.payload.format).toBe("pvp_1v1");
    expect(playerOneMatchStart?.payload.playerOrder).toEqual(["player_1", "player_2"]);
    expect(playerOneMatchStart?.payload.factions).toEqual({
      player_1: "alloy_clan",
      player_2: "biomass_swarm",
    });
    expect(playerTwoMatchStart?.payload.factions).toEqual({
      player_1: "alloy_clan",
      player_2: "biomass_swarm",
    });
  });

  it("keeps 1v1 and 4-player queues separate", () => {
    initializeServerContent();

    const sessionStore = new SessionStore();
    const roomStore = new RoomStore();
    const matchmaker = new Matchmaker({
      sessionStore,
      roomStore,
    });

    const tokens = ["p1", "p2", "p3", "p4", "p5", "p6"];
    const streams = Object.fromEntries(tokens.map((token) => [token, createCapturedStream()]));
    for (const token of tokens) {
      sessionStore.attachStream(token, streams[token] as never);
    }

    expect(matchmaker.joinQueue("p1", "alloy_clan", "ffa_4p")).toEqual({ ok: true });
    expect(matchmaker.joinQueue("p2", "flux_collective", "ffa_4p")).toEqual({ ok: true });
    expect(matchmaker.joinQueue("p3", "biomass_swarm", "pvp_1v1")).toEqual({ ok: true });
    expect(matchmaker.joinQueue("p4", "alloy_clan", "pvp_1v1")).toEqual({ ok: true });

    expect(parseServerEvents(streams.p1).some((event) => typeof event === "object" && event !== null && "type" in event && event.type === "match_start")).toBe(false);
    const p3Start = parseServerEvents(streams.p3).find(
      (event): event is { type: "match_start"; payload: { format: string; playerOrder: string[] } } =>
        typeof event === "object" && event !== null && "type" in event && event.type === "match_start"
    );
    expect(p3Start?.payload.format).toBe("pvp_1v1");
    expect(p3Start?.payload.playerOrder).toEqual(["player_1", "player_2"]);

    expect(matchmaker.joinQueue("p5", "flux_collective", "ffa_4p")).toEqual({ ok: true });
    expect(matchmaker.joinQueue("p6", "biomass_swarm", "ffa_4p")).toEqual({ ok: true });

    const p1Start = parseServerEvents(streams.p1).find(
      (event): event is { type: "match_start"; payload: { format: string; playerOrder: string[]; factions: Record<string, string> } } =>
        typeof event === "object" && event !== null && "type" in event && event.type === "match_start"
    );
    expect(p1Start?.payload.format).toBe("ffa_4p");
    expect(p1Start?.payload.playerOrder).toEqual(["player_1", "player_2", "player_3", "player_4"]);
    expect(p1Start?.payload.factions).toEqual({
      player_1: "alloy_clan",
      player_2: "flux_collective",
      player_3: "flux_collective",
      player_4: "biomass_swarm",
    });
  });
});
