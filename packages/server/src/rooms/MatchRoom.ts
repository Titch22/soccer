import { Room, Client } from "colyseus";
import {
  createInitialMatchState,
  createPlayer,
  DEFAULT_MIN_PLAYERS_TO_START,
  MAX_PLAYERS_PER_MATCH,
  placeLateJoinSpawn,
  resetForKickoff,
  simulateTick,
  TICK_DURATION_MS,
  type InputCommand,
  type MatchState,
} from "@rematch/shared";

const MIN_PLAYERS_TO_START = Number(process.env.MIN_PLAYERS_TO_START ?? DEFAULT_MIN_PLAYERS_TO_START);
const RECONNECTION_GRACE_SECONDS = 20;

export class MatchRoom extends Room {
  maxClients = MAX_PLAYERS_PER_MATCH;

  private matchState: MatchState = createInitialMatchState([]);
  private pendingInputs = new Map<string, InputCommand>();

  onCreate() {
    console.log(`[MatchRoom] created (min players to start: ${MIN_PLAYERS_TO_START})`);

    this.onMessage("input", (client, input: InputCommand) => {
      this.pendingInputs.set(client.sessionId, input);
    });

    this.setSimulationInterval(() => this.tick(), TICK_DURATION_MS);
  }

  onJoin(client: Client) {
    const teamId = this.pickBalancedTeam();
    const player = createPlayer(client.sessionId, teamId);
    this.matchState.players[client.sessionId] = player;

    const playerCount = Object.keys(this.matchState.players).length;
    if (this.matchState.clock.phase === "kickoff") {
      if (playerCount >= MIN_PLAYERS_TO_START) {
        this.matchState.clock.phase = "playing";
      }
      resetForKickoff(this.matchState);
    } else {
      placeLateJoinSpawn(this.matchState, player);
    }

    console.log(`[MatchRoom] ${client.sessionId} joined team ${teamId} (${playerCount} players)`);
  }

  async onLeave(client: Client, consented: boolean) {
    // Stop driving them with stale input immediately; they'll stand still
    // (friction decelerates them) during any reconnection grace window.
    this.pendingInputs.delete(client.sessionId);

    if (!consented) {
      try {
        await this.allowReconnection(client, RECONNECTION_GRACE_SECONDS);
        console.log(`[MatchRoom] ${client.sessionId} reconnected`);
        return;
      } catch {
        // grace window expired without a reconnect - fall through to removal.
      }
    }

    this.removePlayer(client.sessionId);
  }

  onDispose() {
    console.log("[MatchRoom] disposed");
  }

  private removePlayer(sessionId: string): void {
    if (!this.matchState.players[sessionId]) return;
    delete this.matchState.players[sessionId];
    this.pendingInputs.delete(sessionId);
    if (this.matchState.ball.possessedByPlayerId === sessionId) {
      this.matchState.ball.possessedByPlayerId = null;
    }

    const playerCount = Object.keys(this.matchState.players).length;
    if (playerCount < MIN_PLAYERS_TO_START && this.matchState.clock.phase === "playing") {
      this.matchState.clock.phase = "kickoff";
    }
    resetForKickoff(this.matchState);

    console.log(`[MatchRoom] removed ${sessionId} (${playerCount} players)`);
  }

  private pickBalancedTeam(): "A" | "B" {
    let countA = 0;
    let countB = 0;
    for (const player of Object.values(this.matchState.players)) {
      if (player.teamId === "A") countA += 1;
      else countB += 1;
    }
    return countA <= countB ? "A" : "B";
  }

  private tick() {
    this.matchState = simulateTick(this.matchState, this.pendingInputs, TICK_DURATION_MS);
    this.broadcast("state", this.matchState);
  }
}
