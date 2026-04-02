import type { IncomingMessage, ServerResponse } from "node:http";
import type { MultiplayerServerEvent } from "../../src/network/protocol";

export async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {} as T;
  }
  return JSON.parse(raw) as T;
}

export function applyCors(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  applyCors(response);
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

export function writeSseHeaders(response: ServerResponse): void {
  applyCors(response);
  response.statusCode = 200;
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");
  response.write("\n");
}

export function writeSseEvent(response: ServerResponse, payload: MultiplayerServerEvent): void {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

