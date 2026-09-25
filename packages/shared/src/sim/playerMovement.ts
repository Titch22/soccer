import {
  PLAYER_ACCELERATION,
  PLAYER_FRICTION,
  PLAYER_MAX_SPEED,
  PLAYER_SPRINT_MAX_SPEED,
} from "./constants";
import type { InputCommand, PlayerState } from "./types";
import { add, clampLength, length, normalize, scale } from "./vec";

const dtSeconds = (dtMs: number) => dtMs / 1000;

export function applyPlayerMovement(
  player: PlayerState,
  input: InputCommand | undefined,
  dtMs: number,
): PlayerState {
  const dt = dtSeconds(dtMs);
  const moveVector = input ? clampLength(input.moveVector, 1) : { x: 0, y: 0 };
  const isSprinting = input?.sprint ?? false;
  const maxSpeed = isSprinting ? PLAYER_SPRINT_MAX_SPEED : PLAYER_MAX_SPEED;

  let velocity = player.velocity;

  if (length(moveVector) > 1e-3) {
    velocity = add(velocity, scale(moveVector, PLAYER_ACCELERATION * dt));
    velocity = clampLength(velocity, maxSpeed);
  } else {
    const speed = length(velocity);
    const decel = PLAYER_FRICTION * dt;
    velocity = speed <= decel ? { x: 0, y: 0 } : scale(velocity, (speed - decel) / speed);
  }

  const position = add(player.position, scale(velocity, dt));
  const facing = length(moveVector) > 1e-3 ? Math.atan2(moveVector.y, moveVector.x) : player.facing;

  return {
    ...player,
    position,
    velocity,
    facing,
    isSprinting,
    lastInputSeq: input?.seq ?? player.lastInputSeq,
  };
}

export function normalizeFacing(v: { x: number; y: number }): number {
  return Math.atan2(normalize(v).y, normalize(v).x);
}
