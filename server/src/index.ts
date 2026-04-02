import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Matchmaker } from "./matchmaker";
import { applyCors, readJsonBody, writeJson, writeSseHeaders } from "./protocol";
import { RoomStore } from "./roomStore";
import { createSessionToken } from "./seed";
import { SessionStore } from "./sessionStore";
import { initializeServerContent } from "./createMatchState";
import {
  MULTIPLAYER_PROTOCOL_VERSION,
  type JoinQueueRequest,
  type LeaveQueueRequest,
  type OpenSessionRequest,
  type QuitMatchRequest,
  type SubmitCommandRequest,
} from "../../src/network/protocol";

const PORT = Number(process.env.PORT ?? 4310);

const sessionStore = new SessionStore();
const roomStore = new RoomStore();
const matchmaker = new Matchmaker({
  sessionStore,
  roomStore,
});

initializeServerContent();

function resolveToken(request: IncomingMessage): string | null {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  return url.searchParams.get("token");
}

function handleOptions(response: ServerResponse): void {
  applyCors(response);
  response.statusCode = 204;
  response.end();
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

  if (request.method === "OPTIONS") {
    handleOptions(response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    writeJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/events") {
    const token = resolveToken(request);
    if (!token) {
      writeJson(response, 400, { reason: "Missing token." });
      return;
    }

    writeSseHeaders(response);
    const session = sessionStore.attachStream(token, response);
    sessionStore.send(token, {
      type: "session_ready",
      token,
    });
    sessionStore.emitQueueStatus(token, matchmaker.getQueuedPlayers());
    if (session.matchId) {
      roomStore.get(session.matchId)?.sendResync(token);
    }
    request.on("close", () => {
      sessionStore.detachStream(token, response);
      if (session.matchId) {
        roomStore.get(session.matchId)?.notifyDisconnect(token);
      }
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/session/open") {
    const body = await readJsonBody<OpenSessionRequest>(request);
    const token = body.token?.trim() || createSessionToken();
    sessionStore.getOrCreate(token);
    writeJson(response, 200, {
      token,
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/queue/join") {
    const body = await readJsonBody<JoinQueueRequest>(request);
    const token = body.token?.trim();
    if (!token) {
      writeJson(response, 400, { reason: "Missing token." });
      return;
    }
    const result = matchmaker.joinQueue(token, body.faction);
    if (!result.ok) {
      writeJson(response, 409, { reason: result.reason });
      return;
    }
    writeJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/queue/leave") {
    const body = await readJsonBody<LeaveQueueRequest>(request);
    if (!body.token) {
      writeJson(response, 400, { reason: "Missing token." });
      return;
    }
    matchmaker.leaveQueue(body.token);
    writeJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/command") {
    const body = await readJsonBody<SubmitCommandRequest>(request);
    const session = body.token ? sessionStore.get(body.token) : null;
    if (!session) {
      writeJson(response, 404, { reason: "Unknown session." });
      return;
    }
    if (!session.matchId || session.matchId !== body.matchId) {
      writeJson(response, 409, { reason: "Session is not bound to that match." });
      return;
    }
    const room = roomStore.get(session.matchId);
    if (!room) {
      writeJson(response, 404, { reason: "Match room not found." });
      return;
    }
    const result = room.handleCommand(body.token, body.command);
    if (!result.ok) {
      writeJson(response, 409, { reason: result.reason });
      return;
    }
    writeJson(response, 200, {
      ok: true,
      accepted: true,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/match/quit") {
    const body = await readJsonBody<QuitMatchRequest>(request);
    const session = body.token ? sessionStore.get(body.token) : null;
    if (!session) {
      writeJson(response, 404, { reason: "Unknown session." });
      return;
    }
    if (!session.matchId || session.matchId !== body.matchId) {
      writeJson(response, 409, { reason: "Session is not bound to that match." });
      return;
    }
    const room = roomStore.get(session.matchId);
    if (!room) {
      writeJson(response, 404, { reason: "Match room not found." });
      return;
    }
    const result = room.abandon(body.token);
    if (!result.ok) {
      writeJson(response, 409, { reason: result.reason });
      return;
    }
    writeJson(response, 200, { ok: true });
    return;
  }

  writeJson(response, 404, { reason: "Not found." });
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error) => {
    const message = error instanceof Error ? error.message : "Internal server error.";
    writeJson(response, 500, { reason: message });
  });
});

setInterval(() => {
  sessionStore.broadcastKeepalive();
}, 15000).unref();

server.listen(PORT, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`Space Trader multiplayer server listening on http://127.0.0.1:${PORT}`);
});
