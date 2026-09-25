import { GOAL_BOTTOM, GOAL_TOP, PITCH_HEIGHT, PITCH_WIDTH, STAMINA_MAX } from "./constants";
import type { MatchState, PlayerState } from "./types";

export function checkGoal(state: MatchState): "A" | "B" | null {
  const { x, y } = state.ball.position;
  if (y < GOAL_TOP || y > GOAL_BOTTOM) return null;
  if (x <= 0) return "B";
  if (x >= PITCH_WIDTH) return "A";
  return null;
}

export function resetForKickoff(state: MatchState): void {
  state.ball.position = { x: PITCH_WIDTH / 2, y: PITCH_HEIGHT / 2 };
  state.ball.velocity = { x: 0, y: 0 };
  state.ball.possessedByPlayerId = null;
  state.ball.releaseLockPlayerId = null;
  state.ball.releaseLockMs = 0;

  const teamAPlayers = Object.values(state.players).filter((p) => p.teamId === "A");
  const teamBPlayers = Object.values(state.players).filter((p) => p.teamId === "B");

  teamAPlayers.forEach((player, i) => {
    player.position = { x: PITCH_WIDTH / 2 - 60 - i * 40, y: PITCH_HEIGHT / 2 + (i - teamAPlayers.length / 2) * 40 };
    player.velocity = { x: 0, y: 0 };
    player.possessionState = "none";
    player.passChargeMs = 0;
    player.shootChargeMs = 0;
    player.tapChargeMs = 0;
    player.stamina = STAMINA_MAX;
  });
  teamBPlayers.forEach((player, i) => {
    player.position = { x: PITCH_WIDTH / 2 + 60 + i * 40, y: PITCH_HEIGHT / 2 + (i - teamBPlayers.length / 2) * 40 };
    player.velocity = { x: 0, y: 0 };
    player.possessionState = "none";
    player.passChargeMs = 0;
    player.shootChargeMs = 0;
    player.tapChargeMs = 0;
    player.stamina = STAMINA_MAX;
  });
}

/**
 * Places a player who joined after kickoff without disturbing anyone already
 * on the pitch. Position spreads out deterministically by how many teammates
 * are already present (no randomness - this must stay safe for shared/client sim reuse).
 */
export function placeLateJoinSpawn(state: MatchState, player: PlayerState): void {
  const teammateCount = Object.values(state.players).filter(
    (p) => p.teamId === player.teamId && p.id !== player.id,
  ).length;
  const sideSign = player.teamId === "A" ? -1 : 1;
  const rowSign = teammateCount % 2 === 0 ? 1 : -1;
  player.position = {
    x: PITCH_WIDTH / 2 + sideSign * (100 + teammateCount * 20),
    y: PITCH_HEIGHT / 2 + rowSign * (30 + teammateCount * 25),
  };
  player.velocity = { x: 0, y: 0 };
  player.possessionState = "none";
  player.passChargeMs = 0;
  player.shootChargeMs = 0;
  player.tapChargeMs = 0;
  player.stamina = STAMINA_MAX;
}

export function advanceClock(state: MatchState, dtMs: number): void {
  if (state.clock.phase !== "playing") return;
  state.clock.remainingMs = Math.max(0, state.clock.remainingMs - dtMs);
  if (state.clock.remainingMs === 0) {
    state.clock.phase = "fulltime";
  }
}
