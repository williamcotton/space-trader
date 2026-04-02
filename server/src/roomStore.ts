import type { MatchRoom } from "./matchRoom";

export class RoomStore {
  private rooms = new Map<string, MatchRoom>();

  set(room: MatchRoom): void {
    this.rooms.set(room.matchId, room);
  }

  get(matchId: string): MatchRoom | undefined {
    return this.rooms.get(matchId);
  }

  delete(matchId: string): void {
    this.rooms.delete(matchId);
  }
}

