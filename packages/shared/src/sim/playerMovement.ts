import {
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
} from "./constants";
import type { InputCommand, PlayerState } from "./types";
import { add, clampLength, dot, length, normalize, scale } from "./vec";

const dtSeconds = (dtMs: number) => dtMs / 1000;

export function applyPlayerMovement(
  player: PlayerState,
  input: InputCommand | undefined,
  dtMs: number,
): PlayerState {
  const dt = dtSeconds(dtMs);

  // A tackle lunge is committed: no steering, the lunge speed just bleeds off
  // with friction until the tackle state ends.
  if (player.possessionState === "tackling") {
    const speed = length(player.velocity);
    const velocity = speed > 1e-3 ? scale(player.velocity, Math.max(0, speed - (player.tackleSliding ? SLIDING_TACKLE : STANDING_TACKLE).decel * dt) / speed) : player.velocity;
    return {
      ...player,
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
      position,
      lastInputSeq: input?.seq ?? player.lastInputSeq,
    };
  }

  const moveVector = input ? clampLength(input.moveVector, 1) : { x: 0, y: 0 };
  const isMoving = length(moveVector) > 1e-3;
  const wantsSprint = input?.sprint ?? false;
  const isSprinting = wantsSprint && isMoving && player.stamina > 0;
  const maxSpeed = isSprinting ? PLAYER_SPRINT_MAX_SPEED : PLAYER_MAX_SPEED;

  let velocity = player.velocity;

  if (isMoving) {
    // Inertia: accelerating roughly the way you're already moving is fast,
    // but fighting your own momentum to reverse/sharply turn is slower -
    // you can't flip direction instantly, you have to fight through it.
    const speed = length(velocity);
    const velocityDir = speed > 1 ? scale(velocity, 1 / speed) : moveVector;
    const alignment = dot(velocityDir, moveVector);
    const turnFactor = PLAYER_TURN_ACCEL_FACTOR_MIN + (1 - PLAYER_TURN_ACCEL_FACTOR_MIN) * ((alignment + 1) / 2);
    velocity = add(velocity, scale(moveVector, PLAYER_ACCELERATION * turnFactor * dt));
    velocity = clampLength(velocity, maxSpeed);
  } else {
    const speed = length(velocity);
    const decel = PLAYER_FRICTION * dt;
    velocity = speed <= decel ? { x: 0, y: 0 } : scale(velocity, (speed - decel) / speed);
  }

  const stamina = isSprinting
    ? Math.max(0, player.stamina - STAMINA_DRAIN_PER_SECOND * dt)
    : Math.min(STAMINA_MAX, player.stamina + STAMINA_REGEN_PER_SECOND * dt);

  const position = add(player.position, scale(velocity, dt));
  const facing = isMoving ? Math.atan2(moveVector.y, moveVector.x) : player.facing;

  return {
    ...player,
    position,
    velocity,
    facing,
    isSprinting,
    stamina,
    lastInputSeq: input?.seq ?? player.lastInputSeq,
  };
}

export function normalizeFacing(v: { x: number; y: number }): number {
  return Math.atan2(normalize(v).y, normalize(v).x);
}
