export interface Vector2 {
  x: number;
  y: number;
}

export type PossessionState = "none" | "dribbling" | "tackling" | "stunned";

export interface PlayerState {
  id: string;
  teamId: "A" | "B";
  position: Vector2;
  velocity: Vector2;
  facing: number;
  isSprinting: boolean;
  possessionState: PossessionState;
  possessionTimer: number;
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
  sprint: boolean;
  passPressed: boolean;
  shootPressed: boolean;
  shootChargeMs: number;
  tacklePressed: boolean;
}
