import { distance, normalize, sub, type BallState, type InputCommand, type PlayerState } from "@rematch/shared";

const TACKLE_RANGE = 45;
const SPRINT_RANGE = 150;

/** Minimal "chase the ball" behaviour, used as a stand-in when no second gamepad is connected. */
export function computeAiInput(seq: number, tick: number, self: PlayerState, ball: BallState): InputCommand {
  const toBall = sub(ball.position, self.position);
  const dist = distance(self.position, ball.position);
  const moveVector = dist > 1 ? normalize(toBall) : { x: 0, y: 0 };

  return {
    seq,
    tick,
    moveVector,
    aimVector: dist > 1 ? moveVector : { x: -1, y: 0 },
    aimActive: dist > 1,
    sprint: dist > SPRINT_RANGE,
    passHeld: false,
    shootHeld: false,
    tacklePressed: dist < TACKLE_RANGE && ball.possessedByPlayerId !== self.id,
    tapHeld: false,
    defendHeld: false,
    strafeHeld: false,
  };
}
