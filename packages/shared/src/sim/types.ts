export interface Vector2 {
  x: number;
  y: number;
}

export type PossessionState =
  | "none"
  | "dribbling"
  | "chargingPass"
  | "chargingShot"
  | "tackling"
  | "stunned";

export interface PlayerState {
  id: string;
  teamId: "A" | "B";
  position: Vector2;
  velocity: Vector2;
  facing: number;
  isSprinting: boolean;
  /** Defensive stance active (visible to everyone). */
  isDefending: boolean;
  /** Mid strafe dash (bigger hitbox). */
  isStrafing: boolean;
  /** Remaining time of the current strafe dash (0 = not dashing), its direction, and the charge system (see STRAFE_MAX_CHARGES). */
  strafeMs: number;
  strafeDir: Vector2;
  strafeCharges: number;
  /** Time until the next spent strafe charge comes back (0 when full). */
  strafeRechargeMs: number;
  /** Last tick's strafeHeld, for tap (rising-edge) detection. */
  prevStrafeHeld: boolean;
  /** 0..STAMINA_MAX. Sprinting drains it; it regenerates while not sprinting. */
  stamina: number;
  possessionState: PossessionState;
  possessionTimer: number;
  /** Elapsed hold time while possessionState is "chargingPass"; 0 otherwise. */
  passChargeMs: number;
  /** Elapsed hold time while possessionState is "chargingShot"; 0 otherwise. */
  shootChargeMs: number;
  /** Time until this player may start another tackle lunge. */
  tackleCooldownMs: number;
  /** Tap requested near a loose ball, waiting for the player to reach it (0 = nothing queued). */
  tapQueuedMs: number;
  tapQueuedDir: Vector2;
  /** Last tick's tapHeld, for edge detection when queueing a tap. */
  prevTapHeld: boolean;
  /** True while in a sprint-initiated slide tackle (vs. a standing tackle). */
  tackleSliding: boolean;
  /** True once the current tackle has already hit the ball, so it only connects once. */
  tackleHitDone: boolean;
  lastInputSeq: number;
}

export interface BallState {
  position: Vector2;
  velocity: Vector2;
  possessedByPlayerId: string | null;
  lastTouchedByPlayerId: string | null;
  lastTouchedTeamId: "A" | "B" | null;
  /** Player who cannot immediately re-claim dribble possession (just shot/passed the ball). */
  releaseLockPlayerId: string | null;
  releaseLockMs: number;
}

export type MatchPhase = "kickoff" | "playing" | "goalScored" | "halftime" | "fulltime";

export interface MatchState {
  tick: number;
  players: Record<string, PlayerState>;
  ball: BallState;
  score: { A: number; B: number };
  clock: { remainingMs: number; phase: MatchPhase };
}

export interface InputCommand {
  seq: number;
  tick: number;
  moveVector: Vector2;
  aimVector: Vector2;
  /** False when aimVector is a stale remembered value rather than a live stick/mouse reading this tick. */
  aimActive: boolean;
  sprint: boolean;
  /** True every tick the pass button/key is currently held down (level, not edge-triggered). */
  passHeld: boolean;
  /** True every tick the shoot button/key is currently held down (level, not edge-triggered). */
  shootHeld: boolean;
  tacklePressed: boolean;
  /** True while a tap is requested (right-stick flick / Q key); the tap goes along aimVector when aimActive. */
  tapHeld: boolean;
  /** Defensive stance button (LT/L2) held. */
  defendHeld: boolean;
  /** Strafe button (A/Cross) held; a tap while defending dashes along moveVector. */
  strafeHeld: boolean;
}
