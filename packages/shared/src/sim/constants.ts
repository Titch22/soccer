export const TICK_RATE_HZ = 30;
export const TICK_DURATION_MS = 1000 / TICK_RATE_HZ;

export const PITCH_WIDTH = 1000;
export const PITCH_HEIGHT = 600;
export const GOAL_WIDTH = 140;
export const GOAL_DEPTH = 20;
export const GOAL_TOP = (PITCH_HEIGHT - GOAL_WIDTH) / 2;
export const GOAL_BOTTOM = (PITCH_HEIGHT + GOAL_WIDTH) / 2;

export const PLAYER_RADIUS = 14;
export const BALL_RADIUS = 8;

export const PLAYER_MAX_SPEED = 220;
export const PLAYER_SPRINT_MAX_SPEED = 320;
export const PLAYER_ACCELERATION = 1400;
export const PLAYER_FRICTION = 900;

export const BALL_FRICTION = 140;
export const BALL_RESTITUTION = 0.6;
export const PLAYER_BALL_RESTITUTION = 0.4;

export const DRIBBLE_RADIUS = PLAYER_RADIUS + BALL_RADIUS + 10;
export const DRIBBLE_OFFSET = PLAYER_RADIUS + BALL_RADIUS * 0.4;
export const DRIBBLE_OFFSET_SPRINT = PLAYER_RADIUS + BALL_RADIUS * 1.6;
// Max px/s the ball's position is allowed to catch up toward its dribble
// target each tick (see moveToward in ballControl.ts) - capped so pickup
// closes over a few ticks instead of teleporting.
export const DRIBBLE_CORRECTION_SPEED = 500;
export const DRIBBLE_CORRECTION_SPEED_SPRINT = 350;

export const PASS_ASSIST_CONE_RADIANS = Math.PI / 6;
export const PASS_ASSIST_MAX_DISTANCE = 400;
export const PASS_BASE_SPEED = 380;

export const SHOOT_MIN_SPEED = 300;
export const SHOOT_MAX_SPEED = 620;
export const SHOOT_MAX_CHARGE_MS = 900;

// How long a player who just shot/passed is blocked from immediately
// re-claiming dribble possession of the same ball.
export const RELEASE_LOCK_DURATION_MS = 300;

export const TACKLE_RANGE = PLAYER_RADIUS * 2 + 6;
export const TACKLE_LUNGE_SPEED = 420;
export const TACKLE_DURATION_MS = 250;
export const TACKLE_STUN_DURATION_MS = 400;

export const MATCH_DURATION_MS = 5 * 60 * 1000;

// Default lobby size gate (server can override via env); used by the client
// purely to render a "waiting for players" label that matches the server's default.
export const DEFAULT_MIN_PLAYERS_TO_START = 2;
export const MAX_PLAYERS_PER_MATCH = 10;
