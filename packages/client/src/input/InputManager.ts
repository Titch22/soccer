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

    const sprint = gamepadInput?.sprint ?? kbInput?.sprint ?? false;
    const shootHeld = gamepadInput?.shootHeld ?? kbInput?.shootHeld ?? false;
    const tacklePressed = gamepadInput?.tacklePressed ?? kbInput?.tacklePressed ?? false;
    const tapHeld = gamepadInput?.tapHeld ?? kbInput?.tapHeld ?? false;

    this.seq += 1;
    return {
      seq: this.seq,
      tick,
      moveVector,
      aimVector: this.lastAimVector,
      aimActive,
      sprint,
      passHeld,
      shootHeld,
      tacklePressed,
      tapHeld,
    };
  }
}
