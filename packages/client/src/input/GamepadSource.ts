const DEADZONE = 0.15;

function applyDeadzone(v: number): number {
  return Math.abs(v) < DEADZONE ? 0 : v;
}

/** Reads a single physical gamepad, pinned to one slot (0 = first connected, 1 = second, ...). */
export class GamepadSource {
  constructor(private readonly slot: number) {}

  private getPad(): Gamepad | null {
    const pads = navigator.getGamepads();
    const connected = Array.from(pads).filter((p): p is Gamepad => p !== null);
    return connected[this.slot] ?? null;
  }

  isConnected(): boolean {
    return this.getPad() !== null;
  }

  hasActivity(): boolean {
    const pad = this.getPad();
    if (!pad) return false;
    return (
      pad.buttons.some((b) => b.pressed) ||
      applyDeadzone(pad.axes[0] ?? 0) !== 0 ||
      applyDeadzone(pad.axes[1] ?? 0) !== 0
    );
  }

  read() {
    const pad = this.getPad();
    if (!pad) return null;

    const moveX = applyDeadzone(pad.axes[0] ?? 0);
    const moveY = applyDeadzone(pad.axes[1] ?? 0);
    const aimX = applyDeadzone(pad.axes[2] ?? 0);
    const aimY = applyDeadzone(pad.axes[3] ?? 0);
    const moveLen = Math.hypot(moveX, moveY) || 1;
    const aimLen = Math.hypot(aimX, aimY);

    // Standard gamepad mapping: 0 = A/Cross (strafe), 1 = B/Circle, 2 = X/Square, 4 = LB/L1, 6 = LT/L2 (defend), 7 = RT/R2.
    const sprint = pad.buttons[4]?.pressed ?? false;
    const shootHeld = pad.buttons[7]?.pressed ?? false;
    const passHeld = pad.buttons[2]?.pressed ?? false;
    const tacklePressed = pad.buttons[1]?.pressed ?? false;
    const strafeHeld = pad.buttons[0]?.pressed ?? false;
    const defendHeld = pad.buttons[6]?.pressed ?? false;

    return {
      moveVector: { x: moveX / moveLen, y: moveY / moveLen },
      /** Right-stick deflection (0..~1.4 on a square-gated stick), used for flick detection. */
      aimMagnitude: aimLen,
      aimVector: aimLen > DEADZONE ? { x: aimX / aimLen, y: aimY / aimLen } : null,
      sprint,
      shootHeld,
      passHeld,
      tacklePressed,
      strafeHeld,
      defendHeld,
    };
  }
}
