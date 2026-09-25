import {
  DRIBBLE_CORRECTION_SPEED,
  DRIBBLE_CORRECTION_SPEED_SPRINT,
  DRIBBLE_OFFSET,
  DRIBBLE_OFFSET_SPRINT,
  DRIBBLE_RADIUS,
  PASS_ASSIST_CONE_RADIANS,
  PASS_ASSIST_MAX_DISTANCE,
  PASS_BASE_SPEED,
  PASS_CHARGE_MAX_MS,
  PICKUP_CLOSING_SPEED_WEIGHT,
  RELEASE_LOCK_DURATION_MS,
  SHOOT_MAX_CHARGE_MS,
  SHOOT_MAX_SPEED,
  SHOOT_MIN_SPEED,
  SHOOT_RUNNING_AIM_MIN_SPEED,
  SHOOT_SWAY_FREE_WINDOW_MS,
  SHOOT_SWAY_MAX_RADIANS,
  SHOOT_SWAY_PERIOD_MS,
  TACKLE_DURATION_MS,
  TACKLE_LUNGE_SPEED,
  TACKLE_RANGE,
  TACKLE_STUN_DURATION_MS,
  TAP_CHARGE_MAX_MS,
  TAP_RELEASE_LOCK_DURATION_MS,
  TAP_SPEED,
} from "./constants";
import type { BallState, InputCommand, PlayerState } from "./types";
import { add, distance, dot, length, moveToward, normalize, scale, sub } from "./vec";

interface BallControlContext {
  players: Record<string, PlayerState>;
  ball: BallState;
  inputsByPlayer: Map<string, InputCommand>;
  dtMs: number;
}

/**
 * Resolves who gets a loose ball when multiple players are close enough to
 * claim it. Not pure nearest-distance: a player actively closing in on the
 * ball - or one the ball is moving toward - gets a priority bonus over
 * someone merely standing a bit closer, so a genuine 50/50 contest is
 * decided by who's actually converging on it, not just who happened to be
 * nearest at that instant.
 */
function findDribbler(ctx: BallControlContext): PlayerState | null {
  const { players, ball } = ctx;
  let best: PlayerState | null = null;
  let bestScore = -Infinity;
  for (const player of Object.values(players)) {
    if (player.possessionState === "stunned") continue;
    if (player.id === ball.releaseLockPlayerId) continue;
    const toBall = sub(ball.position, player.position);
    const dist = length(toBall);
    if (dist >= DRIBBLE_RADIUS) continue;
    const towardBall = dist > 1e-3 ? scale(toBall, 1 / dist) : { x: 0, y: 0 };
    // Positive when the player and ball are approaching each other faster.
    const closingSpeed = dot(sub(player.velocity, ball.velocity), towardBall);
    const score = closingSpeed * PICKUP_CLOSING_SPEED_WEIGHT - dist;
    if (score > bestScore) {
      bestScore = score;
      best = player;
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
        defender.passChargeMs = 0;
        defender.shootChargeMs = 0;
        defender.tapChargeMs = 0;
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

      const input = inputsByPlayer.get(dribbler.id);

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

      if (dribbler.possessionState === "chargingPass") {
        dribbler.passChargeMs += dtMs;
        const timedOut = dribbler.passChargeMs >= PASS_CHARGE_MAX_MS;
        const released = !input?.passHeld;
        if (timedOut || released) {
          firePass(dribbler, ball, players, input?.aimVector ?? facingDir);
        }
      } else if (dribbler.possessionState === "chargingShot") {
        dribbler.shootChargeMs += dtMs;
        const timedOut = dribbler.shootChargeMs >= SHOOT_MAX_CHARGE_MS;
        const released = !input?.shootHeld;
        if (timedOut || released) {
          fireShot(dribbler, ball, input);
        }
      } else if (dribbler.possessionState === "chargingTap") {
        dribbler.tapChargeMs += dtMs;
        const timedOut = dribbler.tapChargeMs >= TAP_CHARGE_MAX_MS;
        const released = !input?.tapHeld;
        if (timedOut || released) {
          tapBall(dribbler, ball);
        }
      } else if (input?.passHeld) {
        dribbler.possessionState = "chargingPass";
        dribbler.passChargeMs = 0;
      } else if (input?.shootHeld) {
        dribbler.possessionState = "chargingShot";
        dribbler.shootChargeMs = 0;
      } else if (input?.tapHeld) {
        dribbler.possessionState = "chargingTap";
        dribbler.tapChargeMs = 0;
      }
    }
  }
}

/**
 * Fires the charged pass using the aim held at release/timeout - not the
 * player's facing, which intentionally never changes during the charge so
 * opponents get no visual tell of the intended direction.
 */
function firePass(
  dribbler: PlayerState,
  ball: BallState,
  players: Record<string, PlayerState>,
  aimVector: { x: number; y: number },
): void {
  releaseFromDribble(dribbler, ball);
  const aim = length(aimVector) > 1e-3 ? normalize(aimVector) : { x: Math.cos(dribbler.facing), y: Math.sin(dribbler.facing) };
  const target = findTeammateForAssist(players, dribbler, aim);
  const aimDir = target ? normalize(sub(target.position, dribbler.position)) : aim;
  ball.velocity = scale(aimDir, PASS_BASE_SPEED);
  ball.releaseLockPlayerId = dribbler.id;
  ball.releaseLockMs = RELEASE_LOCK_DURATION_MS;
  dribbler.passChargeMs = 0;
}

/**
 * Deterministic aim wobble applied to shots: a quick tap (below the free
 * window) stays perfectly accurate, but holding for more power makes the
 * fired direction oscillate away from the raw aim - the player must release
 * at the right instant to land a clean, powerful shot. Pure function (no
 * randomness) so client and server compute an identical wobble from the same
 * inputs, keeping the visual indicator truthful to what will actually fire.
 */
export function computeSwungAimDirection(
  rawAim: { x: number; y: number },
  chargeMs: number,
): { x: number; y: number } {
  const baseAngle = Math.atan2(rawAim.y, rawAim.x);
  if (chargeMs <= SHOOT_SWAY_FREE_WINDOW_MS) {
    return { x: Math.cos(baseAngle), y: Math.sin(baseAngle) };
  }
  const chargeRatio = Math.max(0, Math.min(1, chargeMs / SHOOT_MAX_CHARGE_MS));
  const swayProgressMs = chargeMs - SHOOT_SWAY_FREE_WINDOW_MS;
  const swayAngle =
    SHOOT_SWAY_MAX_RADIANS * chargeRatio * Math.sin((swayProgressMs / SHOOT_SWAY_PERIOD_MS) * Math.PI * 2);
  const angle = baseAngle + swayAngle;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/**
 * Picks the direction a shot aims from before sway is applied. A live
 * stick/mouse reading always wins; otherwise, once the player is actually
 * moving with some pace, shooting defaults to their current running
 * direction rather than a stale remembered aim - falling back further to
 * facing only when both the stick and the player are idle.
 */
export function resolveShootBaseAim(
  velocity: { x: number; y: number },
  facing: number,
  aimVector: { x: number; y: number } | undefined,
  aimActive: boolean | undefined,
): { x: number; y: number } {
  if (aimActive && aimVector && length(aimVector) > 1e-3) {
    return normalize(aimVector);
  }
  if (length(velocity) > SHOOT_RUNNING_AIM_MIN_SPEED) {
    return normalize(velocity);
  }
  if (aimVector && length(aimVector) > 1e-3) {
    return normalize(aimVector);
  }
  return { x: Math.cos(facing), y: Math.sin(facing) };
}

function fireShot(dribbler: PlayerState, ball: BallState, input: InputCommand | undefined): void {
  releaseFromDribble(dribbler, ball);
  const chargeMs = dribbler.shootChargeMs;
  const chargeRatio = Math.max(0, Math.min(1, chargeMs / SHOOT_MAX_CHARGE_MS));
  const speed = SHOOT_MIN_SPEED + (SHOOT_MAX_SPEED - SHOOT_MIN_SPEED) * chargeRatio;
  const baseAim = resolveShootBaseAim(dribbler.velocity, dribbler.facing, input?.aimVector, input?.aimActive);
  const aimDir = computeSwungAimDirection(baseAim, chargeMs);
  ball.velocity = scale(aimDir, speed);
  ball.releaseLockPlayerId = dribbler.id;
  ball.releaseLockMs = RELEASE_LOCK_DURATION_MS;
  dribbler.shootChargeMs = 0;
}

/**
 * Fires the tap along the player's locked facing - frozen the instant the
 * charge started (see playerMovement.ts) and never updated during the hold,
 * exactly like a mini pass. Short release lock so it actually separates from
 * the player first, but far shorter than pass/shoot's - the whole point is
 * that the same player can chase the ball down and reclaim it a beat later,
 * not instantly re-glue it to their own feet.
 */
function tapBall(dribbler: PlayerState, ball: BallState): void {
  releaseFromDribble(dribbler, ball);
  const tapDir = { x: Math.cos(dribbler.facing), y: Math.sin(dribbler.facing) };
  ball.velocity = scale(tapDir, TAP_SPEED);
  ball.releaseLockPlayerId = dribbler.id;
  ball.releaseLockMs = TAP_RELEASE_LOCK_DURATION_MS;
  dribbler.tapChargeMs = 0;
}

function releaseFromDribble(player: PlayerState, ball: BallState): void {
  if (
    player.possessionState === "dribbling" ||
    player.possessionState === "chargingPass" ||
    player.possessionState === "chargingShot" ||
    player.possessionState === "chargingTap"
  ) {
    player.possessionState = "none";
  }
  ball.possessedByPlayerId = null;
}
