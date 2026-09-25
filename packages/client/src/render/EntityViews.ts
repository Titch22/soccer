import { BALL_RADIUS, PLAYER_RADIUS } from "@rematch/shared";
import { Container, Graphics } from "pixi.js";

const PASS_AIM_LINE_MIN_LENGTH = 34;
const PASS_AIM_LINE_MAX_LENGTH = 100;
const PASS_AIM_LINE_WIDTH = 6;
const PASS_AIM_LINE_COLOR = 0xffc800;
const PASS_AIM_LINE_OUTLINE_COLOR = 0x000000;

const SHOOT_POWER_LINE_MIN_LENGTH = 34;
const SHOOT_POWER_LINE_MAX_LENGTH = 130;
const SHOOT_POWER_LINE_WIDTH = 9;
const SHOOT_POWER_LINE_CORE_COLOR = 0xff5500;
const SHOOT_POWER_LINE_OUTLINE_COLOR = 0x7a0000;
const SHOOT_POWER_TIP_MIN_RADIUS = 6;
const SHOOT_POWER_TIP_MAX_RADIUS = 15;

const BALL_INDICATOR_RADIUS = BALL_RADIUS + 11;
const BALL_INDICATOR_COLOR = 0xffffff;

const STAMINA_BAR_WIDTH = 34;
const STAMINA_BAR_HEIGHT = 5;
const STAMINA_BAR_Y_OFFSET = PLAYER_RADIUS + 12;

function staminaColor(ratio: number): number {
  // Green when full, fading through amber to red as it depletes.
  if (ratio > 0.5) return 0x4ade80;
  if (ratio > 0.2) return 0xfacc15;
  return 0xef4444;
}

/** Draws a directional charge indicator: an outlined line with a filled dot at the tip. */
function drawChargeLine(
  gfx: Graphics,
  lineLength: number,
  coreWidth: number,
  coreColor: number,
  outlineColor: number,
  outlineAlpha: number,
  tipRadius: number,
): void {
  gfx
    .clear()
    .moveTo(0, 0)
    .lineTo(lineLength, 0)
    .stroke({ width: coreWidth + 4, color: outlineColor, alpha: outlineAlpha })
    .moveTo(0, 0)
    .lineTo(lineLength, 0)
    .stroke({ width: coreWidth, color: coreColor })
    .circle(lineLength, 0, tipRadius)
    .fill({ color: coreColor });
}

export interface PlayerView {
  container: Container;
  setFacing(angle: number): void;
  /**
   * Local-only aim indicator for the player currently charging a pass - only
   * ever call this with `active: true` for the client's own player; other
   * clients must not see it. `worldAimAngle` is independent of the player's
   * facing (which intentionally never rotates during the charge).
   */
  setPassAim(active: boolean, progressRatio: number, worldAimAngle: number): void;
  /** Local-only shoot power indicator - same rules as setPassAim: self only. */
  setShootPower(active: boolean, progressRatio: number, worldAimAngle: number): void;
}

export function createPlayerView(color: number): PlayerView {
  const container = new Container();
  const body = new Graphics().circle(0, 0, PLAYER_RADIUS).fill(color);
  const facingLine = new Graphics()
    .moveTo(0, 0)
    .lineTo(PLAYER_RADIUS + 6, 0)
    .stroke({ width: 3, color: 0xffffff });
  const passAimLine = new Graphics();
  passAimLine.visible = false;
  const shootPowerLine = new Graphics();
  shootPowerLine.visible = false;
  container.addChild(body, facingLine, passAimLine, shootPowerLine);

  return {
    container,
    setFacing(angle: number) {
      container.rotation = angle;
    },
    setPassAim(active: boolean, progressRatio: number, worldAimAngle: number) {
      passAimLine.visible = active;
      if (!active) return;

      const clamped = Math.max(0, Math.min(1, progressRatio));
      const lineLength =
        PASS_AIM_LINE_MIN_LENGTH + (PASS_AIM_LINE_MAX_LENGTH - PASS_AIM_LINE_MIN_LENGTH) * clamped;

      // Cancel out the container's own rotation so this points at the actual
      // aim direction regardless of the (frozen) facing rotation.
      passAimLine.rotation = worldAimAngle - container.rotation;
      drawChargeLine(
        passAimLine,
        lineLength,
        PASS_AIM_LINE_WIDTH,
        PASS_AIM_LINE_COLOR,
        PASS_AIM_LINE_OUTLINE_COLOR,
        0.6,
        PASS_AIM_LINE_WIDTH,
      );
    },
    setShootPower(active: boolean, progressRatio: number, worldAimAngle: number) {
      shootPowerLine.visible = active;
      if (!active) return;

      const clamped = Math.max(0, Math.min(1, progressRatio));
      const lineLength =
        SHOOT_POWER_LINE_MIN_LENGTH + (SHOOT_POWER_LINE_MAX_LENGTH - SHOOT_POWER_LINE_MIN_LENGTH) * clamped;
      const tipRadius = SHOOT_POWER_TIP_MIN_RADIUS + (SHOOT_POWER_TIP_MAX_RADIUS - SHOOT_POWER_TIP_MIN_RADIUS) * clamped;

      shootPowerLine.rotation = worldAimAngle - container.rotation;
      drawChargeLine(
        shootPowerLine,
        lineLength,
        SHOOT_POWER_LINE_WIDTH,
        SHOOT_POWER_LINE_CORE_COLOR,
        SHOOT_POWER_LINE_OUTLINE_COLOR,
        0.8,
        tipRadius,
      );
    },
  };
}

export function createBallView(): Container {
  const container = new Container();
  const body = new Graphics().circle(0, 0, BALL_RADIUS).fill(0xffffff);
  container.addChild(body);
  return container;
}

export interface BallInteractIndicatorView {
  container: Container;
  setVisible(visible: boolean): void;
  setPosition(x: number, y: number): void;
}

/**
 * Diamond outline around the ball meaning "you're close enough to act on it
 * right now" - local-only, one per client, shown only around the client's
 * own proximity to the ball, never revealing anything about other players.
 */
export function createBallInteractIndicatorView(): BallInteractIndicatorView {
  const container = new Container();
  const diamond = new Graphics()
    .moveTo(0, -BALL_INDICATOR_RADIUS)
    .lineTo(BALL_INDICATOR_RADIUS, 0)
    .lineTo(0, BALL_INDICATOR_RADIUS)
    .lineTo(-BALL_INDICATOR_RADIUS, 0)
    .closePath()
    .stroke({ width: 2, color: BALL_INDICATOR_COLOR, alpha: 0.9 });
  container.addChild(diamond);
  container.visible = false;

  return {
    container,
    setVisible(visible: boolean) {
      container.visible = visible;
    },
    setPosition(x: number, y: number) {
      container.position.set(x, y);
    },
  };
}

export interface StaminaBarView {
  container: Container;
  setVisible(visible: boolean): void;
  /** Position this above a specific player's current screen position. */
  setPosition(x: number, y: number): void;
  setStamina(ratio: number): void;
}

/**
 * Local-only endurance bar, floated above the local player's head. Never
 * instantiate or show one for another client's player.
 */
export function createStaminaBarView(): StaminaBarView {
  const container = new Container();
  const background = new Graphics()
    .roundRect(-STAMINA_BAR_WIDTH / 2, 0, STAMINA_BAR_WIDTH, STAMINA_BAR_HEIGHT, 2)
    .fill({ color: 0x000000, alpha: 0.55 });
  const fill = new Graphics();
  container.addChild(background, fill);
  container.visible = false;

  return {
    container,
    setVisible(visible: boolean) {
      container.visible = visible;
    },
    setPosition(x: number, y: number) {
      container.position.set(x, y - STAMINA_BAR_Y_OFFSET);
    },
    setStamina(ratio: number) {
      const clamped = Math.max(0, Math.min(1, ratio));
      fill
        .clear()
        .roundRect(-STAMINA_BAR_WIDTH / 2, 0, STAMINA_BAR_WIDTH * clamped, STAMINA_BAR_HEIGHT, 2)
        .fill({ color: staminaColor(clamped) });
    },
  };
}
