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
} from "@soccer/shared";

const MIN_PLAYERS_TO_START = Number(process.env.MIN_PLAYERS_TO_START ?? DEFAULT_MIN_PLAYERS_TO_START);
const RECONNECTION_GRACE_SECONDS = 20;

// How often we check whether a tick is due. Deliberately much shorter than
// TICK_DURATION_MS: actual tick cadence comes from the accumulator below, not
// from this delay being precise - Node's timers (especially on Windows) round
// a fixed-interval delay up to the OS's timer granularity, which silently cut
// our real simulation rate to ~21Hz instead of the intended 30Hz when we used
// Room.setSimulationInterval's plain setInterval. Checking frequently and
// draining however many ticks are actually due keeps the sim's wall-clock
// rate accurate regardless of timer jitter.
const LOOP_CHECK_INTERVAL_MS = 4;
const MAX_TICKS_PER_CHECK = 5;

export class MatchRoom extends Room {
  maxClients = MAX_PLAYERS_PER_MATCH;

  private matchState: MatchState = createInitialMatchState([]);
  private pendingInputs = new Map<string, InputCommand>();
  private accumulatorMs = 0;
  private lastLoopAt = Date.now();
  private loopHandle: ReturnType<typeof setTimeout> | null = null;

  onCreate() {
    console.log(`[MatchRoom] created (min players to start: ${MIN_PLAYERS_TO_START})`);

    this.onMessage("input", (client, input: InputCommand) => {
      this.pendingInputs.set(client.sessionId, input);
    });

    this.lastLoopAt = Date.now();
    this.scheduleLoop();
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
    if (this.loopHandle) clearTimeout(this.loopHandle);
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

  private scheduleLoop(): void {
    this.loopHandle = setTimeout(() => {
      const now = Date.now();
      this.accumulatorMs += now - this.lastLoopAt;
      this.lastLoopAt = now;

      let ticksRun = 0;
      let stateChanged = false;
      while (this.accumulatorMs >= TICK_DURATION_MS && ticksRun < MAX_TICKS_PER_CHECK) {
        this.matchState = simulateTick(this.matchState, this.pendingInputs, TICK_DURATION_MS);
        this.accumulatorMs -= TICK_DURATION_MS;
        ticksRun += 1;
        stateChanged = true;
      }
      // If we hit the safety cap while still behind, drop the rest rather
      // than spiraling into an ever-growing catch-up burst.
      if (ticksRun === MAX_TICKS_PER_CHECK) {
        this.accumulatorMs = 0;
      }

      if (stateChanged) {
        this.broadcast("state", this.matchState);
      }

      this.scheduleLoop();
    }, LOOP_CHECK_INTERVAL_MS);
  }
}
