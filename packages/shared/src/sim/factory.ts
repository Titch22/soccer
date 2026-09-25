import { EXTRA_EFFORT_MAX, MATCH_DURATION_MS, PITCH_HEIGHT, PITCH_WIDTH, STAMINA_MAX, STRAFE_MAX_CHARGES } from "./constants";
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
    extraEffortActive: false,
    extraEffort: EXTRA_EFFORT_MAX,
    prevSprintHeld: false,
    sprintTapTimerMs: 0,
    isDefending: false,
    isStrafing: false,
    strafeMs: 0,
    strafeDir: { x: 1, y: 0 },
    strafeCharges: STRAFE_MAX_CHARGES,
    strafeRechargeMs: 0,
    prevStrafeHeld: false,
    stamina: STAMINA_MAX,
    possessionState: "none",
    possessionTimer: 0,
    passChargeMs: 0,
    shootChargeMs: 0,
    tackleCooldownMs: 0,
    tapQueuedMs: 0,
    tapQueuedDir: { x: 1, y: 0 },
    prevTapHeld: false,
    tackleSliding: false,
    tackleHitDone: false,
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
    aimActive: false,
    sprint: false,
    passHeld: false,
    shootHeld: false,
    tacklePressed: false,
    tapHeld: false,
    defendHeld: false,
    strafeHeld: false,
  };
}
