import {
  GOAL_BOTTOM,
  GOAL_TOP,
  PITCH_HEIGHT,
  PITCH_WIDTH,
  DEFEND_HITBOX_SCALE,
  PLAYER_RADIUS,
  STRAFE_HITBOX_SCALE,
} from "./constants";
import type { BallState, PlayerState, Vector2 } from "./types";
import { add, distance, length, normalize, scale, sub } from "./vec";

/** Current hitbox radius: a plain circle (orientation-independent) that grows in defensive stance and more so while strafing. */
export function getPlayerRadius(player: PlayerState): number {
  if (player.isStrafing) return PLAYER_RADIUS * STRAFE_HITBOX_SCALE;
  if (player.isDefending) return PLAYER_RADIUS * DEFEND_HITBOX_SCALE;
  return PLAYER_RADIUS;
}

export function resolvePlayerPlayerCollisions(players: PlayerState[]): void {
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i]!;
      const b = players[j]!;
      const delta = sub(b.position, a.position);
      const dist = length(delta);
      const minDist = getPlayerRadius(a) + getPlayerRadius(b);
      if (dist > 0 && dist < minDist) {
        const overlap = minDist - dist;
        const push = scale(normalize(delta), overlap / 2);
        a.position = sub(a.position, push);
        b.position = add(b.position, push);
      }
    }
  }
}

export function clampPlayerToPitch(player: PlayerState): void {
  const radius = getPlayerRadius(player);
  player.position.x = Math.max(radius, Math.min(PITCH_WIDTH - radius, player.position.x));
  player.position.y = Math.max(radius, Math.min(PITCH_HEIGHT - radius, player.position.y));
}

export function resolveBallBoundaryCollision(ball: BallState, restitution: number): void {
  const r = 8;
  // Skip the side-wall bounce while the ball is within the goal mouth so a
  // shot can actually cross the line instead of bouncing off an invisible wall.
  const withinGoalMouth = ball.position.y >= GOAL_TOP && ball.position.y <= GOAL_BOTTOM;
  if (!withinGoalMouth) {
    if (ball.position.x < r) {
      ball.position.x = r;
      ball.velocity.x = Math.abs(ball.velocity.x) * restitution;
    } else if (ball.position.x > PITCH_WIDTH - r) {
      ball.position.x = PITCH_WIDTH - r;
      ball.velocity.x = -Math.abs(ball.velocity.x) * restitution;
    }
  }
  if (ball.position.y < r) {
    ball.position.y = r;
    ball.velocity.y = Math.abs(ball.velocity.y) * restitution;
  } else if (ball.position.y > PITCH_HEIGHT - r) {
    ball.position.y = PITCH_HEIGHT - r;
    ball.velocity.y = -Math.abs(ball.velocity.y) * restitution;
  }
}

export function resolvePlayerBallCollision(
  player: PlayerState,
  ball: BallState,
  restitution: number,
): void {
  const delta: Vector2 = sub(ball.position, player.position);
  const dist = length(delta);
  const minDist = getPlayerRadius(player) + 8;
  if (dist > 0 && dist < minDist) {
    const overlap = minDist - dist;
    const dir = normalize(delta);
    ball.position = add(ball.position, scale(dir, overlap));
    const relativeSpeed = dir.x * (ball.velocity.x - player.velocity.x) +
      dir.y * (ball.velocity.y - player.velocity.y);
    if (relativeSpeed < 0) {
      const impulse = scale(dir, -relativeSpeed * (1 + restitution));
      ball.velocity = add(ball.velocity, impulse);
    }
  }
}

export function distanceBetween(a: Vector2, b: Vector2): number {
  return distance(a, b);
}
