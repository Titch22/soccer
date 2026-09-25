export interface Vector2 {
  x: number;
  y: number;
}

export type PossessionState =
  | "none"
  | "dribbling"
  | "chargingPass"
  | "chargingShot"
  | "chargingTap"
  | "tackling"
  | "stunned";

export interface PlayerState {
  id: string;
  teamId: "A" | "B";
  position: Vector2;
  velocity: Vector2;
  facing: number;
  isSprinting: boolean;
  /** 0..STAMINA_MAX. Sprinting drains it; it regenerates while not sprinting. */
  stamina: number;
  possessionState: PossessionState;
  possessionTimer: number;
  /** Elapsed hold time while possessionState is "chargingPass"; 0 otherwise. */
  passChargeMs: number;
  /** Elapsed hold time while possessionState is "chargingShot"; 0 otherwise. */
  shootChargeMs: number;
  /** Elapsed hold time while possessionState is "chargingTap"; 0 otherwise. */
  tapChargeMs: number;
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
  /** True every tick the tap-ball button/key is currently held down (level, not edge-triggered). */
  tapHeld: boolean;
}
