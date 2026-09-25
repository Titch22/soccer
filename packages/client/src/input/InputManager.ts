import type { InputCommand } from "@rematch/shared";
import { GamepadSource } from "./GamepadSource";
import { KeyboardMouseSource } from "./KeyboardMouseSource";

export interface InputManagerOptions {
  /** Which connected gamepad slot to read (0 = first connected, 1 = second, ...). */
  gamepadSlot: number;
  /** Provide to also accept keyboard/mouse input (mouse-aim needs the render target + player screen position). */
  keyboardMouseTarget?: HTMLElement;
}

// A "flick" is the right stick swinging from near-centre to (nearly) fully
// pushed within a short window. Polled every render frame (not just on the 30Hz
// input tick) and matched against a time window, since a real thumb flick
// usually spans several frames and passes through mid values.
const FLICK_FROM_BELOW = 0.4;
const FLICK_TO_ABOVE = 0.75;
const FLICK_WINDOW_MS = 160;
// Must drop back under this before another flick can register.
const FLICK_REARM_BELOW = 0.5;
// The flick is held for a few ticks so a single dropped input can't lose it;
// the server only acts on it while the player is actually dribbling.
const FLICK_HOLD_TICKS = 4;

export class InputManager {
  private readonly gamepad: GamepadSource;
  private readonly keyboardMouse: KeyboardMouseSource | null;
  private seq = 0;
  private lastAimVector = { x: 1, y: 0 };
  private stickHistory: { t: number; magnitude: number }[] = [];
  private flickArmed = true;
  private flickTicksLeft = 0;
  private flickDirection = { x: 1, y: 0 };

  constructor(options: InputManagerOptions) {
    this.gamepad = new GamepadSource(options.gamepadSlot);
    this.keyboardMouse = options.keyboardMouseTarget
      ? new KeyboardMouseSource(options.keyboardMouseTarget)
      : null;
  }

  dispose() {
    this.keyboardMouse?.dispose();
  }

  isGamepadConnected(): boolean {
    return this.gamepad.isConnected();
  }

  /** Call every render frame: detects right-stick flicks between input ticks. */
  pollFlick(nowMs: number): void {
    const pad = this.gamepad.isConnected() ? this.gamepad.read() : null;
    if (!pad || pad.passHeld) {
      this.stickHistory = [];
      this.flickArmed = true;
      return;
    }
    const magnitude = pad.aimMagnitude;
    this.stickHistory.push({ t: nowMs, magnitude });
    while (this.stickHistory.length > 0 && nowMs - this.stickHistory[0]!.t > FLICK_WINDOW_MS) {
      this.stickHistory.shift();
    }
    if (magnitude < FLICK_REARM_BELOW) this.flickArmed = true;
    if (!this.flickArmed || !pad.aimVector || magnitude < FLICK_TO_ABOVE) return;

    const wasNearCentre = this.stickHistory.some((h) => h.magnitude < FLICK_FROM_BELOW);
    if (wasNearCentre) {
      this.flickArmed = false;
      this.flickTicksLeft = FLICK_HOLD_TICKS;
      this.flickDirection = pad.aimVector;
    }
  }

  sample(tick: number, playerScreenX: number, playerScreenY: number): InputCommand {
    // Once a controller is connected for this client, keyboard/mouse is
    // completely ignored - no per-field fallback, no mixing sources.
    const gamepadConnected = this.gamepad.isConnected();
    const gamepadInput = gamepadConnected ? this.gamepad.read() : null;
    const kbInput = gamepadConnected ? null : (this.keyboardMouse?.read(playerScreenX, playerScreenY) ?? null);

    const passHeld = gamepadInput?.passHeld ?? kbInput?.passHeld ?? false;

    // Charging a pass locks movement server-side; on gamepad, re-purpose the
    // now-idle left stick as the aim control instead of the right stick.
    const rawMoveVector = gamepadInput?.moveVector ?? kbInput?.moveVector ?? { x: 0, y: 0 };
    const deviceAimVector =
      passHeld && gamepadInput
        ? gamepadInput.moveVector
        : (gamepadInput?.aimVector ?? kbInput?.aimVector ?? null);
    const aimActive = deviceAimVector !== null && Math.hypot(deviceAimVector.x, deviceAimVector.y) > 1e-3;
    if (aimActive) {
      this.lastAimVector = deviceAimVector;
    }
    const moveVector = passHeld ? { x: 0, y: 0 } : rawMoveVector;

    const flicking = this.flickTicksLeft > 0;
    if (flicking) this.flickTicksLeft -= 1;

    const sprint = gamepadInput?.sprint ?? kbInput?.sprint ?? false;
    const shootHeld = gamepadInput?.shootHeld ?? kbInput?.shootHeld ?? false;
    const tacklePressed = gamepadInput?.tacklePressed ?? kbInput?.tacklePressed ?? false;
    const tapHeld = flicking || (kbInput?.tapHeld ?? false);

    this.seq += 1;
    return {
      seq: this.seq,
      tick,
      moveVector,
      aimVector: flicking ? this.flickDirection : this.lastAimVector,
      aimActive: aimActive || flicking,
      sprint,
      passHeld,
      shootHeld,
      tacklePressed,
      tapHeld,
    };
  }
}
