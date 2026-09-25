import { MATCH_DURATION_MS, PITCH_HEIGHT, PITCH_WIDTH } from "./constants";
import { resetForKickoff } from "./rules";
import type { MatchState, PlayerState } from "./types";

export function createPlayer(id: string, teamId: "A" | "B"): PlayerState {
  return {
    id,
    teamId,
    position: { x: PITCH_WIDTH / 2, y: PITCH_HEIGHT / 2 },
    velocity: { x: 0, y: 0 },
    facing: teamId === "A" ? 0 : Math.PI,
    isSprinting: false,
    possessionState: "none",
    possessionTimer: 0,
    lastInputSeq: 0,
  };
}

export function createInitialMatchState(playerIds: { id: string; teamId: "A" | "B" }[]): MatchState {
  const players: Record<string, PlayerState> = {};
  for (const { id, teamId } of playerIds) {
    players[id] = createPlayer(id, teamId);
  }

  const state: MatchState = {
    tick: 0,
    players,
    ball: {
      position: { x: PITCH_WIDTH / 2, y: PITCH_HEIGHT / 2 },
      velocity: { x: 0, y: 0 },
      possessedByPlayerId: null,
      lastTouchedByPlayerId: null,
      lastTouchedTeamId: null,
      releaseLockPlayerId: null,
      releaseLockMs: 0,
    },
    score: { A: 0, B: 0 },
    clock: { remainingMs: MATCH_DURATION_MS, phase: "kickoff" },
  };

  resetForKickoff(state);
  return state;
}

export function createEmptyInputCommand(seq: number, tick: number) {
  return {
    seq,
    tick,
    moveVector: { x: 0, y: 0 },
    aimVector: { x: 1, y: 0 },
    sprint: false,
    passPressed: false,
    shootPressed: false,
    shootChargeMs: 0,
    tacklePressed: false,
  };
}
