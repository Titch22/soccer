import {
  DRIBBLE_CORRECTION_SPEED,
  DRIBBLE_CORRECTION_SPEED_SPRINT,
  DRIBBLE_OFFSET,
  DRIBBLE_OFFSET_SPRINT,
  DRIBBLE_RADIUS,
  PASS_ASSIST_CONE_RADIANS,
  PASS_ASSIST_MAX_DISTANCE,
  BALL_CATCH_MAX_SPEED,
  BALL_INTERACT_INDICATOR_RADIUS,
  TAP_QUEUE_MS,
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
  SLIDING_TACKLE,
  STANDING_TACKLE,
  TACKLE_STUN_DURATION_MS,
  TAP_RELEASE_LOCK_DURATION_MS,
  TAP_SPEED,
} from "./constants";
import type { BallState, InputCommand, PlayerState, Vector2 } from "./types";
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
  // Too fast to trap: nobody claims it, the normal body collision deflects it.
  if (length(ball.velocity) > BALL_CATCH_MAX_SPEED) return null;
  let best: PlayerState | null = null;
  let bestScore = -Infinity;
  for (const player of Object.values(players)) {
    // A tackling player never gains possession - they only hit the ball away.
    if (player.possessionState === "stunned" || player.possessionState === "tackling") continue;
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
    player.tackleCooldownMs = Math.max(0, player.tackleCooldownMs - dtMs);
    const input = inputsByPlayer.get(player.id);

    // A tackle can be started any time (not only near the ball). Sprinting
    // makes it a slide tackle; otherwise it's a shorter standing tackle.
    if (input?.tacklePressed && player.possessionState === "none" && player.tackleCooldownMs <= 0) {
      const sliding = player.isSprinting;
      const profile = sliding ? SLIDING_TACKLE : STANDING_TACKLE;
      const hasMoveInput = length(input.moveVector) > 1e-3;
      const dir = hasMoveInput
        ? normalize(input.moveVector)
        : { x: Math.cos(player.facing), y: Math.sin(player.facing) };
      player.facing = Math.atan2(dir.y, dir.x);
      player.velocity = scale(dir, profile.lungeSpeed);
      player.possessionState = "tackling";
      player.possessionTimer = profile.durationMs;
      player.tackleCooldownMs = profile.cooldownMs;
      player.tackleSliding = sliding;
      player.tackleHitDone = false;
    }

    if (player.possessionState !== "tackling" || player.tackleHitDone) continue;
    const profile = player.tackleSliding ? SLIDING_TACKLE : STANDING_TACKLE;
    if (distance(player.position, ball.position) > profile.range) continue;

    const holder = ball.possessedByPlayerId ? players[ball.possessedByPlayerId] : null;
    // Can't tackle a teammate's dribble; a loose ball is always fair game.
    if (holder && (holder.id === player.id || holder.teamId === player.teamId)) continue;

    // Send the ball flying away from the tackler, whether it was held or loose.
    const toBall = sub(ball.position, player.position);
    const dir = length(toBall) > 1e-3 ? normalize(toBall) : { x: Math.cos(player.facing), y: Math.sin(player.facing) };
    if (holder) {
      holder.possessionState = "stunned";
      holder.possessionTimer = TACKLE_STUN_DURATION_MS;
      holder.passChargeMs = 0;
      holder.shootChargeMs = 0;
      ball.possessedByPlayerId = null;
    }
    ball.velocity = scale(dir, profile.ballHitSpeed);
    ball.lastTouchedByPlayerId = player.id;
    ball.lastTouchedTeamId = player.teamId;
    player.tackleHitDone = true;
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
      } else if (input?.passHeld) {
        dribbler.possessionState = "chargingPass";
        dribbler.passChargeMs = 0;
      } else if (input?.shootHeld) {
        dribbler.possessionState = "chargingShot";
        dribbler.shootChargeMs = 0;
      } else if ((input?.tapHeld || dribbler.tapQueuedMs > 0) && dribbler.possessionState === "dribbling") {
        // A tap queued while running onto the ball goes in the direction chosen
        // when it was requested; otherwise use the live aim.
        const queuedDir = dribbler.tapQueuedMs > 0 ? dribbler.tapQueuedDir : null;
        tapBall(dribbler, ball, queuedDir ?? tapDirectionFromInput(dribbler, input));
        dribbler.tapQueuedMs = 0;
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
 * Instant tap toward the aim direction (right-stick flick / mouse), falling
 * back to facing when there's no aim. Short release lock so it actually
 * separates from the player first, but far shorter than pass/shoot's - the
 * point is that the same player can chase the ball down and reclaim it a
 * beat later, not instantly re-glue it to their own feet.
 */
function tapDirectionFromInput(player: PlayerState, input: InputCommand | undefined): Vector2 {
  const aim = input?.aimActive && length(input.aimVector) > 1e-3 ? normalize(input.aimVector) : null;
  return aim ?? { x: Math.cos(player.facing), y: Math.sin(player.facing) };
}

function tapBall(dribbler: PlayerState, ball: BallState, tapDir: Vector2): void {
  releaseFromDribble(dribbler, ball);
  ball.velocity = scale(tapDir, TAP_SPEED);
  ball.releaseLockPlayerId = dribbler.id;
  ball.releaseLockMs = TAP_RELEASE_LOCK_DURATION_MS;
}

function releaseFromDribble(player: PlayerState, ball: BallState): void {
  if (
    player.possessionState === "dribbling" ||
    player.possessionState === "chargingPass" ||
    player.possessionState === "chargingShot"
  ) {
    player.possessionState = "none";
  }
  ball.possessedByPlayerId = null;
}

function isNearLooseBall(player: PlayerState, ball: BallState): boolean {
  return (
    player.possessionState === "none" &&
    ball.possessedByPlayerId === null &&
    player.id !== ball.releaseLockPlayerId &&
    length(ball.velocity) <= BALL_CATCH_MAX_SPEED &&
    distance(player.position, ball.position) < BALL_INTERACT_INDICATOR_RADIUS
  );
}

/**
 * Runs before movement each tick: remembers a tap requested (rising edge)
 * while the ball indicator is up, so the player can run onto the ball first.
 */
export function updateQueuedBallAction(
  player: PlayerState,
  ball: BallState,
  input: InputCommand | undefined,
  dtMs: number,
): void {
  const tapHeld = input?.tapHeld ?? false;
  player.tapQueuedMs = Math.max(0, player.tapQueuedMs - dtMs);
  if (tapHeld && !player.prevTapHeld && isNearLooseBall(player, ball)) {
    player.tapQueuedMs = TAP_QUEUE_MS;
    player.tapQueuedDir = tapDirectionFromInput(player, input);
  }
  player.prevTapHeld = tapHeld;
}

/**
 * While the ball indicator is up (loose, catchable, within reach) and the
 * player asks for a possession action (pass/shoot held, or a queued tap), they
 * automatically run onto the ball; possession plus the action then happen the
 * normal way as soon as they reach it. Returns the input movement should use.
 */
export function resolveBallActionApproach(
  player: PlayerState,
  ball: BallState,
  input: InputCommand | undefined,
): InputCommand | undefined {
  if (!input || !isNearLooseBall(player, ball)) return input;
  if (!input.passHeld && !input.shootHeld && player.tapQueuedMs <= 0) return input;
  return { ...input, moveVector: normalize(sub(ball.position, player.position)) };
}
