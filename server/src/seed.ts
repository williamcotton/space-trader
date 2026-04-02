import { randomBytes } from "node:crypto";

export function createSessionToken(): string {
  return randomBytes(16).toString("hex");
}

export function createMatchSeed(): number {
  return randomBytes(4).readUInt32LE(0);
}

