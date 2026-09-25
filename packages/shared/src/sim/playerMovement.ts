import {
  DEFEND_MAX_SPEED,
  PLAYER_ACCELERATION,
  PLAYER_FRICTION,
  PLAYER_MAX_SPEED,
  PLAYER_SPRINT_MAX_SPEED,
  PLAYER_TURN_ACCEL_FACTOR_MIN,
  SLIDING_TACKLE,
  STANDING_TACKLE,
  STAMINA_DRAIN_PER_SECOND,
  STAMINA_MAX,
  STAMINA_REGEN_PER_SECOND,
  STRAFE_MAX_CHARGES,
  STRAFE_RECHARGE_MS,
  STRAFE_DASH_DURATION_MS,
  STRAFE_DASH_SPEED,
  STRAFE_STAMINA_COST,
} from "./constants";
import type { InputCommand, PlayerState, Vector2 } from "./types";
import { add, clampLength, dot, length, normalize, scale } from "./vec";

const dtSeconds = (dtMs: number) => dtMs / 1000;

export function applyPlayerMovement(
  player: PlayerState,
  input: InputCommand | undefined,
  dtMs: number,
  ballPosition?: Vector2,
): PlayerState {
  const dt = dtSeconds(dtMs);

  // A tackle lunge is committed: no steering, the lunge speed just bleeds off
  // with friction until the tackle state ends.
  if (player.possessionState === "tackling") {
    const speed = length(player.velocity);
    const velocity = speed > 1e-3 ? scale(player.velocity, Math.max(0, speed - (player.tackleSliding ? SLIDING_TACKLE : STANDING_TACKLE).decel * dt) / speed) : player.velocity;
    return {
      ...player,
      isDefending: false,
      isStrafing: false,
      strafeMs: 0,
      prevStrafeHeld: input?.strafeHeld ?? false,
      velocity,
      position: add(player.position, scale(velocity, dt)),
      lastInputSeq: input?.seq ?? player.lastInputSeq,
    };
  }

  // Charging a pass locks out steering: no acceleration/deceleration from
  // input, so the player just carries their current velocity forward
  // unchanged. Facing is driven by the aim stick instead (see applyBallControl).
  const isChargingOrStartingToCharge =
    player.possessionState === "chargingPass" ||
    (player.possessionState === "dribbling" && (input?.passHeld ?? false));

  if (isChargingOrStartingToCharge) {
    const position = add(player.position, scale(player.velocity, dt));
    return {
      ...player,
      isDefending: false,
      isStrafing: false,
      strafeMs: 0,
      prevStrafeHeld: input?.strafeHeld ?? false,
      position,
      lastInputSeq: input?.seq ?? player.lastInputSeq,
    };
  }

  const moveVector = input ? clampLength(input.moveVector, 1) : { x: 0, y: 0 };
  const isMoving = length(moveVector) > 1e-3;
  const wantsSprint = input?.sprint ?? false;
  // Defensive stance only applies when not otherwise engaged with the ball.
  const isDefending = (input?.defendHeld ?? false) && player.possessionState === "none";

  // Strafe = tap the button while in stance: a short committed dash in the held
  // direction, limited by charges and costing a chunk of stamina.
  const strafeHeld = input?.strafeHeld ?? false;
  let strafeCharges = player.strafeCharges;
  let strafeRechargeMs = player.strafeRechargeMs;
  if (strafeCharges < STRAFE_MAX_CHARGES) {
    strafeRechargeMs -= dtMs;
    if (strafeRechargeMs <= 0) {
      strafeCharges += 1;
      strafeRechargeMs = strafeCharges < STRAFE_MAX_CHARGES ? STRAFE_RECHARGE_MS : 0;
    }
  }
  let strafeMs = player.strafeMs;
  let strafeDir = player.strafeDir;
  let stamina = player.stamina;
  if (
    isDefending &&
    strafeHeld &&
    !player.prevStrafeHeld &&
    isMoving &&
    strafeMs <= 0 &&
    strafeCharges >= 1 &&
    stamina >= STRAFE_STAMINA_COST
  ) {
    strafeMs = STRAFE_DASH_DURATION_MS;
    strafeDir = normalize(moveVector);
    // Spending from a full pool starts the recharge clock; otherwise it's already running.
    if (strafeCharges >= STRAFE_MAX_CHARGES) strafeRechargeMs = STRAFE_RECHARGE_MS;
    strafeCharges -= 1;
    stamina -= STRAFE_STAMINA_COST;
  }
  const isStrafing = strafeMs > 0;
  const remainingStrafeMs = Math.max(0, strafeMs - dtMs);

  const isSprinting = !isDefending && !isStrafing && wantsSprint && isMoving && stamina > 0;
  const maxSpeed = isDefending
    ? DEFEND_MAX_SPEED
    : isSprinting
      ? PLAYER_SPRINT_MAX_SPEED
      : PLAYER_MAX_SPEED;

  let velocity = player.velocity;

  if (isStrafing) {
    // Committed dash; on its last tick drop back to walking pace so the
    // distance is the same every time instead of skidding on.
    velocity = scale(strafeDir, remainingStrafeMs > 0 ? STRAFE_DASH_SPEED : DEFEND_MAX_SPEED);
  } else if (isMoving) {
    // Inertia: accelerating roughly the way you're already moving is fast,
    // but fighting your own momentum to reverse/sharply turn is slower -
    // you can't flip direction instantly, you have to fight through it.
    const speed = length(velocity);
    const velocityDir = speed > 1 ? scale(velocity, 1 / speed) : moveVector;
    const alignment = dot(velocityDir, moveVector);
    const turnFactor = PLAYER_TURN_ACCEL_FACTOR_MIN + (1 - PLAYER_TURN_ACCEL_FACTOR_MIN) * ((alignment + 1) / 2);
    velocity = add(velocity, scale(moveVector, PLAYER_ACCELERATION * turnFactor * dt));
    if (isDefending && length(velocity) > maxSpeed) {
      // Entering the stance bleeds speed off from where it was last tick
      // instead of snapping (acceleration must not add to it).
      velocity = scale(normalize(velocity), Math.max(maxSpeed, speed - PLAYER_FRICTION * dt));
    } else {
      velocity = clampLength(velocity, maxSpeed);
    }
  } else {
    const speed = length(velocity);
    const decel = PLAYER_FRICTION * dt;
    velocity = speed <= decel ? { x: 0, y: 0 } : scale(velocity, (speed - decel) / speed);
  }

  stamina = isSprinting
    ? Math.max(0, stamina - STAMINA_DRAIN_PER_SECOND * dt)
    : Math.min(STAMINA_MAX, stamina + STAMINA_REGEN_PER_SECOND * dt);

  const position = add(player.position, scale(velocity, dt));
  // In stance the player always faces the ball; otherwise facing follows the
  // movement direction.
  let facing = player.facing;
  if (isDefending && ballPosition) {
    const toBall = { x: ballPosition.x - player.position.x, y: ballPosition.y - player.position.y };
    if (length(toBall) > 1e-3) facing = Math.atan2(toBall.y, toBall.x);
  } else if (isMoving && !isStrafing && !isDefending) {
    facing = Math.atan2(moveVector.y, moveVector.x);
  }

  return {
    ...player,
    position,
    velocity,
    facing,
    isSprinting,
    isDefending,
    isStrafing,
    strafeMs: remainingStrafeMs,
    strafeDir,
    strafeCharges,
    strafeRechargeMs,
    prevStrafeHeld: strafeHeld,
    stamina,
    lastInputSeq: input?.seq ?? player.lastInputSeq,
  };
}

export function normalizeFacing(v: { x: number; y: number }): number {
  return Math.atan2(normalize(v).y, normalize(v).x);
}
