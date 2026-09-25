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

export const PLAYER_MAX_SPEED = 150;
export const PLAYER_SPRINT_MAX_SPEED = 230;
export const PLAYER_ACCELERATION = 1400;
// Defensive stance (hold LT/L2): slow walk; tapping strafe on top of it is a short dash.
export const DEFEND_MAX_SPEED = 90;
// A strafe is a short committed dash: STRAFE_DASH_SPEED * STRAFE_DASH_DURATION_MS
// = about 36px, in the direction held when the strafe button was tapped.
export const STRAFE_DASH_SPEED = 300;
export const STRAFE_DASH_DURATION_MS = 120;
// Strafes work like charges: you can chain STRAFE_MAX_CHARGES back to back (one
// tap each), then each spent charge comes back one at a time after this long.
export const STRAFE_MAX_CHARGES = 2;
export const STRAFE_RECHARGE_MS = 1200;
export const STRAFE_STAMINA_COST = 20;
// Hitbox radius multipliers (plain circles - facing is deliberately ignored):
// standing in defensive stance, and the bigger one during a strafe dash.
export const DEFEND_HITBOX_SCALE = 1.4;
export const STRAFE_HITBOX_SCALE = 1.7;
// Boosting (extra effort) grows the hitbox so the player can push the ball along without possessing it.
export const EXTRA_EFFORT_HITBOX_SCALE = 1.2;
export const PLAYER_FRICTION = 900;
// Inertia: effective acceleration is scaled by this factor when the desired
// direction opposes current velocity (1.0 = full accel when aligned/starting
// from rest, this value = full accel when trying to instantly reverse).
export const PLAYER_TURN_ACCEL_FACTOR_MIN = 0.35;

// Extra effort: a second, slow-filling bar. Double-tap the sprint button to
// spend it on a short but faster boost. It fills more slowly the emptier the
// normal stamina bar is (fill rate is scaled by the stamina ratio).
export const EXTRA_EFFORT_MAX = 100;
export const EXTRA_EFFORT_FILL_PER_SECOND = EXTRA_EFFORT_MAX / 6;
export const EXTRA_EFFORT_DRAIN_PER_SECOND = 150;
export const EXTRA_EFFORT_MIN_TO_ACTIVATE = EXTRA_EFFORT_MAX;
export const EXTRA_EFFORT_MAX_SPEED = 300;
// Boosting while holding the ball drops it: it's launched lightly along the run direction.
export const EXTRA_EFFORT_BALL_KICK_SPEED = 320;
export const SPRINT_DOUBLE_TAP_WINDOW_MS = 300;

export const STAMINA_MAX = 100;
// Full sprint drains a full bar in ~2.5s; standing/jogging refills it in ~5s.
export const STAMINA_DRAIN_PER_SECOND = 40;
export const STAMINA_REGEN_PER_SECOND = 20;

export const BALL_FRICTION = 140;
export const BALL_RESTITUTION = 0.6;
export const PLAYER_BALL_RESTITUTION = 0.4;

export const DRIBBLE_RADIUS = PLAYER_RADIUS + BALL_RADIUS + 10;
// Wider than DRIBBLE_RADIUS on purpose: the "you can act on the ball"
// indicator should give advance warning before the tighter auto-pickup
// radius actually grabs it, not fire at the exact same instant possession
// is taken.
export const BALL_INTERACT_INDICATOR_RADIUS = DRIBBLE_RADIUS + 25;
// When a loose ball has multiple eligible players in range, priority isn't
// pure distance: this converts px/s of "closing speed" (how fast a
// player+ball are approaching each other) into an equivalent px of distance
// advantage, so someone actively closing in beats someone merely standing
// closer but not moving toward it.
export const PICKUP_CLOSING_SPEED_WEIGHT = 0.05;
export const DRIBBLE_OFFSET = PLAYER_RADIUS + BALL_RADIUS * 0.4;
export const DRIBBLE_OFFSET_SPRINT = PLAYER_RADIUS + BALL_RADIUS * 1.6;
// Max px/s the ball's position is allowed to catch up toward its dribble
// target each tick (see moveToward in ballControl.ts) - capped so pickup
// closes over a few ticks instead of teleporting.
export const DRIBBLE_CORRECTION_SPEED = 500;
export const DRIBBLE_CORRECTION_SPEED_SPRINT = 350;

// A loose ball moving faster than this can't be trapped: it bounces off the player instead.
// Just above PASS_BASE_SPEED so passes stay receivable, while shots (>= SHOOT_MIN_SPEED) deflect.
export const BALL_CATCH_MAX_SPEED = 280;

export const PASS_ASSIST_CONE_RADIANS = Math.PI / 6;
export const PASS_ASSIST_MAX_DISTANCE = 400;
export const PASS_BASE_SPEED = 260;
// Holding the pass button locks movement and lets you aim; releasing (or
// hitting this timeout) fires the pass, whichever comes first.
export const PASS_CHARGE_MAX_MS = 1000;

export const SHOOT_MIN_SPEED = 300;
export const SHOOT_MAX_SPEED = 620;
export const SHOOT_MAX_CHARGE_MS = 900;
// Charge time below this stays perfectly accurate (a quick tap-shot); past
// it, aim starts to wobble - see computeSwungAimDirection in ballControl.ts.
export const SHOOT_SWAY_FREE_WINDOW_MS = 150;
export const SHOOT_SWAY_MAX_RADIANS = Math.PI / 5;
export const SHOOT_SWAY_PERIOD_MS = 420;
// When the aim stick/mouse isn't actively providing a direction, shooting
// defaults to the player's current running direction instead of a stale
// remembered aim - but only once they're moving fast enough for that
// direction to be meaningful.
export const SHOOT_RUNNING_AIM_MIN_SPEED = 20;

// How long a player who just shot/passed is blocked from immediately
// re-claiming dribble possession of the same ball.
export const RELEASE_LOCK_DURATION_MS = 300;

// Quick "tap the ball" touch, fired instantly by flicking the right stick (or
// Q on keyboard). Speed is derived so the ball's friction deceleration
// (distance = v^2 / 2a) brings it to rest TAP_TRAVEL_DISTANCE away: a bit past
// BALL_INTERACT_INDICATOR_RADIUS, so continuing to run the same direction
// puts the "you can act on it" indicator back on screen almost immediately.
// A tap requested near a loose ball is remembered this long while the player runs onto it.
export const TAP_QUEUE_MS = 450;
export const TAP_TRAVEL_DISTANCE = BALL_INTERACT_INDICATOR_RADIUS * 1.6;
export const TAP_SPEED = Math.sqrt(2 * BALL_FRICTION * TAP_TRAVEL_DISTANCE);
// Derived, not guessed: the time for the tapped ball to travel past
// DRIBBLE_RADIUS under friction deceleration (d = v0*t - 1/2*a*t^2, solved
// for the first t where d = DRIBBLE_RADIUS), plus a small safety margin for
// tick quantization. Short compared to RELEASE_LOCK_DURATION_MS - just long
// enough that even a player who doesn't chase at all can't reattach before
// the ball has actually separated, so tapping doesn't collapse into "the
// ball stays glued to your feet" - but still much quicker to reclaim than a
// pass or shot.
export const TAP_RELEASE_LOCK_DURATION_MS =
  ((TAP_SPEED - Math.sqrt(TAP_SPEED * TAP_SPEED - 2 * BALL_FRICTION * DRIBBLE_RADIUS)) / BALL_FRICTION) * 1000 +
  50;

export const TACKLE_STUN_DURATION_MS = 400;

export interface TackleProfile {
  /** Initial lunge speed. */
  lungeSpeed: number;
  /** How long the player stays in the committed "tackling" state. */
  durationMs: number;
  /** Speed lost per second while lunging (lower = slides further). */
  decel: number;
  /** How close the ball must be to the tackler to be hit / stolen. */
  range: number;
  /** Time before another tackle can start, measured from the start of the lunge. */
  cooldownMs: number;
  /** Speed the ball is sent flying at when hit. */
  ballHitSpeed: number;
}

const TACKLE_BASE_RANGE = PLAYER_RADIUS * 2 + 6;

/** Short, quick tackle from a standing/walking start: ball hit at pass strength. */
export const STANDING_TACKLE: TackleProfile = {
  lungeSpeed: 260,
  durationMs: 200,
  decel: 900,
  range: TACKLE_BASE_RANGE,
  cooldownMs: 600,
  ballHitSpeed: PASS_BASE_SPEED,
};

/** Slide tackle while sprinting: reaches further and hits harder, but leaves you locked out much longer. */
export const SLIDING_TACKLE: TackleProfile = {
  lungeSpeed: 470,
  durationMs: 400,
  decel: 700,
  range: TACKLE_BASE_RANGE + 10,
  cooldownMs: 1400,
  ballHitSpeed: PASS_BASE_SPEED * 1.4,
};

export const MATCH_DURATION_MS = 5 * 60 * 1000;

// Default lobby size gate (server can override via env); used by the client
// purely to render a "waiting for players" label that matches the server's default.
export const DEFAULT_MIN_PLAYERS_TO_START = 2;
export const MAX_PLAYERS_PER_MATCH = 10;
