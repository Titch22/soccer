export class KeyboardMouseSource {
  private keys = new Set<string>();
  private mouseX = 0;
  private mouseY = 0;
  private mouseDown = false;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("mousemove", this.onMouseMove);
    target.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
  }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.target.removeEventListener("mousemove", this.onMouseMove);
    this.target.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent) => {
    const rect = this.target.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;
  };

  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDown = true;
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDown = false;
  };

  hasActivity(): boolean {
    return this.keys.size > 0 || this.mouseDown;
  }

  read(playerScreenX: number, playerScreenY: number) {
    let x = 0;
    let y = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) y -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) y += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
    const len = Math.hypot(x, y) || 1;

    const aimDx = this.mouseX - playerScreenX;
    const aimDy = this.mouseY - playerScreenY;
    const aimLen = Math.hypot(aimDx, aimDy) || 1;

    const sprint = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const shootHeld = this.mouseDown;
    const passHeld = this.keys.has("Space");
    const tacklePressed = this.keys.has("ControlLeft") || this.keys.has("KeyC");
    const tapHeld = this.keys.has("KeyQ");
    const defendHeld = this.keys.has("KeyF");
    const strafeHeld = this.keys.has("KeyE");

    return {
      moveVector: { x: x / len, y: y / len },
      aimVector: { x: aimDx / aimLen, y: aimDy / aimLen },
      sprint,
      shootHeld,
      passHeld,
      tacklePressed,
      tapHeld,
      defendHeld,
      strafeHeld,
    };
  }
}
