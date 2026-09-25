import type { InputCommand, MatchState } from "@rematch/shared";
import { Client, Room } from "colyseus.js";

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

const NORMAL_CLOSE_CODE = 1000;

export class NetConnection {
  private readonly client: Client;
  private room: Room | null = null;
  private latestState: MatchState | null = null;

  onStatusChange: ((status: ConnectionStatus) => void) | null = null;

  constructor(private readonly url: string) {
    this.client = new Client(url);
  }

  async connect(): Promise<void> {
    this.room = await this.client.joinOrCreate("match");
    this.wireRoom(this.room);
    this.onStatusChange?.("connected");
  }

  private wireRoom(room: Room): void {
    room.onMessage("state", (state: MatchState) => {
      this.latestState = state;
    });
    room.onLeave((code) => {
      if (code === NORMAL_CLOSE_CODE) return;
      void this.attemptReconnect(room);
    });
  }

  private async attemptReconnect(previousRoom: Room): Promise<void> {
    const token = previousRoom.reconnectionToken;
    if (!token) {
      this.onStatusChange?.("disconnected");
      return;
    }
    this.onStatusChange?.("reconnecting");
    try {
      const room = await this.client.reconnect(token);
      this.room = room;
      this.wireRoom(room);
      this.onStatusChange?.("connected");
    } catch {
      this.onStatusChange?.("disconnected");
    }
  }

  get sessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  getState(): MatchState | null {
    return this.latestState;
  }

  sendInput(input: InputCommand): void {
    this.room?.send("input", input);
  }
}
