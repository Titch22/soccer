import type { InputCommand } from "@rematch/shared";
import { GamepadSource } from "./GamepadSource";
import { KeyboardMouseSource } from "./KeyboardMouseSource";

export interface InputManagerOptions {
  /** Which connected gamepad slot to read (0 = first connected, 1 = second, ...). */
  gamepadSlot: number;
  /** Provide to also accept keyboard/mouse input (mouse-aim needs the render target + player screen position). */
  keyboardMouseTarget?: HTMLElement;
}

export class InputManager {
  private readonly gamepad: GamepadSource;
  private readonly keyboardMouse: KeyboardMouseSource | null;
  private seq = 0;
  private chargeStartedAt: number | null = null;
  private lastAimVector = { x: 1, y: 0 };

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

  sample(tick: number, playerScreenX: number, playerScreenY: number): InputCommand {
    const useGamepad = this.gamepad.hasActivity();
    const gamepadInput = useGamepad ? this.gamepad.read() : null;
    const kbInput = this.keyboardMouse?.read(playerScreenX, playerScreenY) ?? null;

    const moveVector = gamepadInput?.moveVector ?? kbInput?.moveVector ?? { x: 0, y: 0 };
    const aimVector = gamepadInput?.aimVector ?? kbInput?.aimVector ?? null;
    if (aimVector && Math.hypot(aimVector.x, aimVector.y) > 1e-3) this.lastAimVector = aimVector;

    const sprint = gamepadInput?.sprint ?? kbInput?.sprint ?? false;
    const shootHeld = gamepadInput?.shootPressed ?? kbInput?.shootPressed ?? false;
    const passPressed = gamepadInput?.passPressed ?? kbInput?.passPressed ?? false;
    const tacklePressed = gamepadInput?.tacklePressed ?? kbInput?.tacklePressed ?? false;

    const now = performance.now();
    let shootChargeMs = 0;
    let shootPressed = false;
    if (shootHeld) {
      if (this.chargeStartedAt === null) this.chargeStartedAt = now;
    } else if (this.chargeStartedAt !== null) {
      shootChargeMs = now - this.chargeStartedAt;
      shootPressed = true;
      this.chargeStartedAt = null;
    }

    this.seq += 1;
    return {
      seq: this.seq,
      tick,
      moveVector,
      aimVector: this.lastAimVector,
      sprint,
      passPressed,
      shootPressed,
      shootChargeMs,
      tacklePressed,
    };
  }
}
