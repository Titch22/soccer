import { applyBallControl } from "./ballControl";
import {
  BALL_FRICTION,
  BALL_RESTITUTION,
  PLAYER_BALL_RESTITUTION,
} from "./constants";
import {
  clampPlayerToPitch,
  resolveBallBoundaryCollision,
  resolvePlayerBallCollision,
  resolvePlayerPlayerCollisions,
} from "./collisions";
import { applyPlayerMovement } from "./playerMovement";
import { advanceClock, checkGoal, resetForKickoff } from "./rules";
import type { MatchState, InputCommand, PlayerState } from "./types";
import { length, scale } from "./vec";

function cloneState(state: MatchState): MatchState {
  const players: Record<string, PlayerState> = {};
  for (const [id, player] of Object.entries(state.players)) {
    players[id] = {
      ...player,
      position: { ...player.position },
      velocity: { ...player.velocity },
    };
  }
  return {
    tick: state.tick,
    players,
    ball: {
      ...state.ball,
      position: { ...state.ball.position },
      velocity: { ...state.ball.velocity },
    },
    score: { ...state.score },
    clock: { ...state.clock },
  };
}

export function simulateTick(
  state: MatchState,
  inputsByPlayer: Map<string, InputCommand>,
  dtMs: number,
): MatchState {
  const next: MatchState = cloneState(state);
  next.tick += 1;

  for (const player of Object.values(next.players)) {
    const input = inputsByPlayer.get(player.id);
    Object.assign(player, applyPlayerMovement(player, input, dtMs));
  }

  const playerList = Object.values(next.players);
  resolvePlayerPlayerCollisions(playerList);
  for (const player of playerList) clampPlayerToPitch(player);

  applyBallControl({ players: next.players, ball: next.ball, inputsByPlayer, dtMs });

  if (!next.ball.possessedByPlayerId) {
    const dt = dtMs / 1000;
    const speed = length(next.ball.velocity);
    if (speed > 0) {
      const decel = BALL_FRICTION * dt;
      next.ball.velocity =
        speed <= decel ? { x: 0, y: 0 } : scale(next.ball.velocity, (speed - decel) / speed);
    }
    next.ball.position = {
      x: next.ball.position.x + next.ball.velocity.x * dt,
      y: next.ball.position.y + next.ball.velocity.y * dt,
    };

    for (const player of playerList) {
      resolvePlayerBallCollision(player, next.ball, PLAYER_BALL_RESTITUTION);
    }
    resolveBallBoundaryCollision(next.ball, BALL_RESTITUTION);
  }

  if (next.clock.phase === "playing") {
    const scoringTeam = checkGoal(next);
    if (scoringTeam) {
      next.score[scoringTeam] += 1;
      next.clock.phase = "goalScored";
      resetForKickoff(next);
      next.clock.phase = "playing";
    }
  }

  advanceClock(next, dtMs);

  return next;
}
