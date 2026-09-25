import {
  DRIBBLE_CORRECTION_SPEED,
  DRIBBLE_CORRECTION_SPEED_SPRINT,
  DRIBBLE_OFFSET,
  DRIBBLE_OFFSET_SPRINT,
  DRIBBLE_RADIUS,
  PASS_ASSIST_CONE_RADIANS,
  PASS_ASSIST_MAX_DISTANCE,
  PASS_BASE_SPEED,
  RELEASE_LOCK_DURATION_MS,
  SHOOT_MAX_CHARGE_MS,
  SHOOT_MAX_SPEED,
  SHOOT_MIN_SPEED,
  TACKLE_DURATION_MS,
  TACKLE_LUNGE_SPEED,
  TACKLE_RANGE,
  TACKLE_STUN_DURATION_MS,
} from "./constants";
import type { BallState, InputCommand, PlayerState } from "./types";
import { add, distance, dot, moveToward, normalize, scale, sub } from "./vec";

interface BallControlContext {
  players: Record<string, PlayerState>;
  ball: BallState;
  inputsByPlayer: Map<string, InputCommand>;
  dtMs: number;
}

function findDribbler(ctx: BallControlContext): PlayerState | null {
  const { players, ball } = ctx;
  let best: PlayerState | null = null;
  let bestDist = Infinity;
  for (const player of Object.values(players)) {
    if (player.possessionState === "stunned") continue;
    if (player.id === ball.releaseLockPlayerId) continue;
    const d = distance(player.position, ball.position);
    if (d < DRIBBLE_RADIUS && d < bestDist) {
      best = player;
      bestDist = d;
    }
  }
  return best;
}

function findTeammateForAssist(
  players: Record<string, PlayerState>,
  passer: PlayerState,
  aimVector: { x: number; y: number },
): PlayerState | null {
  const aimDir = normalize(aimVector);
  let best: PlayerState | null = null;
  let bestScore = -Infinity;
  for (const teammate of Object.values(players)) {
    if (teammate.id === passer.id || teammate.teamId !== passer.teamId) continue;
    const toTeammate = sub(teammate.position, passer.position);
    const dist = distance(passer.position, teammate.position);
    if (dist > PASS_ASSIST_MAX_DISTANCE || dist < 1e-3) continue;
    const dir = normalize(toTeammate);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot(aimDir, dir))));
    if (angle > PASS_ASSIST_CONE_RADIANS) continue;
    const score = -angle - dist / PASS_ASSIST_MAX_DISTANCE;
    if (score > bestScore) {
      bestScore = score;
      best = teammate;
    }
  }
  return best;
}

export function applyBallControl(ctx: BallControlContext): void {
  const { players, ball, inputsByPlayer, dtMs } = ctx;
  const dt = dtMs / 1000;

  for (const player of Object.values(players)) {
    if (player.possessionState === "stunned" || player.possessionState === "tackling") {
      player.possessionTimer -= dtMs;
      if (player.possessionTimer <= 0) {
        player.possessionState = "none";
        player.possessionTimer = 0;
      }
    }
  }

  if (ball.releaseLockPlayerId) {
    ball.releaseLockMs -= dtMs;
    if (ball.releaseLockMs <= 0) {
      ball.releaseLockPlayerId = null;
      ball.releaseLockMs = 0;
    }
  }

  for (const player of Object.values(players)) {
    const input = inputsByPlayer.get(player.id);
    if (!input?.tacklePressed || player.possessionState !== "none") continue;
    const dToBall = distance(player.position, ball.position);
    if (dToBall <= TACKLE_RANGE && ball.possessedByPlayerId && ball.possessedByPlayerId !== player.id) {
      const defender = players[ball.possessedByPlayerId];
      if (defender && defender.teamId !== player.teamId) {
        const dir = normalize(sub(ball.position, player.position));
        player.velocity = scale(dir, TACKLE_LUNGE_SPEED);
        player.possessionState = "tackling";
        player.possessionTimer = TACKLE_DURATION_MS;
        defender.possessionState = "stunned";
        defender.possessionTimer = TACKLE_STUN_DURATION_MS;
        ball.possessedByPlayerId = null;
        ball.velocity = add(ball.velocity, scale(dir, 60));
      }
    }
  }

  const currentHolder = ball.possessedByPlayerId ? players[ball.possessedByPlayerId] : null;
  const dribbler = currentHolder && currentHolder.possessionState !== "stunned"
    ? currentHolder
    : findDribbler(ctx);

  const canTakePossession =
    dribbler !== null &&
    (dribbler.possessionState === "none" || dribbler.id === ball.possessedByPlayerId);

  if (canTakePossession) {
    if (dribbler) {
      ball.possessedByPlayerId = dribbler.id;
      ball.lastTouchedByPlayerId = dribbler.id;
      ball.lastTouchedTeamId = dribbler.teamId;
      if (dribbler.possessionState === "none") dribbler.possessionState = "dribbling";

      const offset = dribbler.isSprinting ? DRIBBLE_OFFSET_SPRINT : DRIBBLE_OFFSET;
      const correctionSpeed = dribbler.isSprinting
        ? DRIBBLE_CORRECTION_SPEED_SPRINT
        : DRIBBLE_CORRECTION_SPEED;
      const facingDir = { x: Math.cos(dribbler.facing), y: Math.sin(dribbler.facing) };
      const targetPos = add(dribbler.position, scale(facingDir, offset));
      const previousPos = ball.position;
      const newPos = moveToward(ball.position, targetPos, correctionSpeed * dt);
      ball.position = newPos;
      ball.velocity = dt > 0 ? scale(sub(newPos, previousPos), 1 / dt) : ball.velocity;

      const input = inputsByPlayer.get(dribbler.id);
      if (input?.passPressed) {
        releaseFromDribble(dribbler, ball);
        const target = findTeammateForAssist(players, dribbler, input.aimVector);
        const aimDir = target
          ? normalize(sub(target.position, dribbler.position))
          : normalize(input.aimVector);
        ball.velocity = scale(aimDir, PASS_BASE_SPEED);
        ball.releaseLockPlayerId = dribbler.id;
        ball.releaseLockMs = RELEASE_LOCK_DURATION_MS;
      } else if (input?.shootPressed) {
        releaseFromDribble(dribbler, ball);
        const chargeRatio = Math.max(0, Math.min(1, input.shootChargeMs / SHOOT_MAX_CHARGE_MS));
        const speed = SHOOT_MIN_SPEED + (SHOOT_MAX_SPEED - SHOOT_MIN_SPEED) * chargeRatio;
        const aimDir = normalize(input.aimVector);
        ball.velocity = scale(aimDir, speed);
        ball.releaseLockPlayerId = dribbler.id;
        ball.releaseLockMs = RELEASE_LOCK_DURATION_MS;
      }
    }
  }
}

function releaseFromDribble(player: PlayerState, ball: BallState): void {
  if (player.possessionState === "dribbling") player.possessionState = "none";
  ball.possessedByPlayerId = null;
}
