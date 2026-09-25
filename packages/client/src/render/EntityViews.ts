import { BALL_RADIUS, DEFEND_HITBOX_SCALE, EXTRA_EFFORT_HITBOX_SCALE, PLAYER_RADIUS, STRAFE_HITBOX_SCALE } from "@rematch/shared";
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

const PLAYER_OUTLINE_COLOR = 0xffffff;
const STUN_BODY_TINT = 0x8a8a8a;
const STUN_DOT_COUNT = 3;
const SPRINT_TRAIL_MIN_SPEED = 20;

const BALL_INDICATOR_RADIUS = BALL_RADIUS + 11;
const BALL_INDICATOR_COLOR = 0xffffff;

const STAMINA_BAR_WIDTH = 300;
const STAMINA_BAR_HEIGHT = 18;
const STAMINA_BAR_BOTTOM_MARGIN = 28;
const EXTRA_BAR_HEIGHT = 10;
const EXTRA_BAR_GAP = 6;
const EXTRA_BAR_COLOR = 0x38bdf8;
const EXTRA_BAR_ACTIVE_COLOR = 0xe0f2fe;
const EXTRA_EFFORT_TRAIL_COLOR = 0x7dd3fc;

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

/** Publicly visible player statuses (safe to render for every player, unlike charge indicators). */
export interface PlayerStatus {
  sprinting: boolean;
  possessing: boolean;
  tackling: boolean;
  stunned: boolean;
  /** Defensive stance active / strafing (bigger hitbox). */
  defending: boolean;
  strafing: boolean;
  /** Extra effort boost active. */
  extraEffort: boolean;
  /** World-space movement direction (radians) and speed, used for the sprint/tackle streaks. */
  velocityAngle: number;
  speed: number;
}

function lighten(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

export interface PlayerView {
  container: Container;
  setFacing(angle: number): void;
  /** Sprinting / possession / tackling / stunned visuals. `nowMs` drives blinking and spinning. */
  setStatus(status: PlayerStatus, nowMs: number): void;
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

/**
 * The local player is drawn as an arrow, everyone else as a circle with a
 * facing line. Hitbox is identical for both - this is purely visual.
 */
export function createPlayerView(color: number, isSelf: boolean): PlayerView {
  const container = new Container();

  const trail = new Graphics();
  trail.visible = false;

  const body = new Graphics();
  if (isSelf) {
    const r = PLAYER_RADIUS;
    body
      .poly([r + 3, 0, -r * 0.85, -r * 0.95, -r * 0.35, 0, -r * 0.85, r * 0.95])
      .fill(color)
      .stroke({ width: 2, color: PLAYER_OUTLINE_COLOR, alpha: 0.9, join: "round" });
  } else {
    body.circle(0, 0, PLAYER_RADIUS).fill(color);
  }

  const facingLine = new Graphics()
    .moveTo(0, 0)
    .lineTo(PLAYER_RADIUS + 6, 0)
    .stroke({ width: 3, color: 0xffffff });
  facingLine.visible = !isSelf;

  const possessionRing = new Graphics()
    .circle(0, 0, PLAYER_RADIUS + 5)
    .stroke({ width: 3, color: lighten(color, 0.6) });
  possessionRing.visible = false;

  // Defensive stance: a bracket in front of the player (rotates with facing).
  const stanceArc = new Graphics()
    .arc(0, 0, PLAYER_RADIUS + 9, -Math.PI / 3, Math.PI / 3)
    .stroke({ width: 4, color: 0xffffff, alpha: 0.9, cap: "round" });
  stanceArc.visible = false;
  // Defending / strafing: outline of the enlarged hitbox (scaled per status) (a plain circle, facing-independent).
  const hitboxRing = new Graphics()
    .circle(0, 0, PLAYER_RADIUS)
    .stroke({ width: 1.5, color: 0xffffff, alpha: 0.6 });
  hitboxRing.visible = false;

  const tackleFlash = new Graphics().circle(0, 0, PLAYER_RADIUS).fill({ color: 0xffffff, alpha: 0.7 });
  tackleFlash.visible = false;

  const stunDots = new Graphics();
  for (let i = 0; i < STUN_DOT_COUNT; i++) {
    const a = (i / STUN_DOT_COUNT) * Math.PI * 2;
    stunDots.circle(Math.cos(a) * (PLAYER_RADIUS + 7), Math.sin(a) * (PLAYER_RADIUS + 7), 3).fill(0xfff08a);
  }
  stunDots.visible = false;

  const passAimLine = new Graphics();
  passAimLine.visible = false;
  const shootPowerLine = new Graphics();
  shootPowerLine.visible = false;
  container.addChild(trail, hitboxRing, body, facingLine, possessionRing, stanceArc, tackleFlash, stunDots, passAimLine, shootPowerLine);

  return {
    container,
    setFacing(angle: number) {
      container.rotation = angle;
    },
    setStatus(status: PlayerStatus, nowMs: number) {
      possessionRing.visible = status.possessing && !status.stunned;
      stanceArc.visible = status.defending && !status.stunned;
      const hitboxScale = status.strafing ? STRAFE_HITBOX_SCALE : status.defending ? DEFEND_HITBOX_SCALE : status.extraEffort ? EXTRA_EFFORT_HITBOX_SCALE : 1;
      hitboxRing.visible = hitboxScale > 1;
      hitboxRing.scale.set(hitboxScale);
      // The ring is drawn in local space, so keep it un-rotated (a circle either way).

      // Stunned: gray and blinking, with orbiting dots.
      body.tint = status.stunned ? STUN_BODY_TINT : 0xffffff;
      body.alpha = status.stunned ? 0.55 + 0.35 * Math.sin(nowMs / 45) : 1;
      stunDots.visible = status.stunned;
      if (status.stunned) stunDots.rotation = nowMs / 180 - container.rotation;

      // Tackling: body stretched forward plus a white flash.
      body.scale.set(status.tackling ? 1.35 : hitboxScale, status.tackling ? 0.8 : hitboxScale);
      tackleFlash.visible = status.tackling;
      tackleFlash.scale.set(status.tackling ? 1.35 : 1, status.tackling ? 0.8 : 1);

      // Streaks behind the movement direction while sprinting (or lunging).
      const showTrail = (status.sprinting || status.tackling || status.extraEffort) && status.speed > SPRINT_TRAIL_MIN_SPEED;
      trail.visible = showTrail;
      if (showTrail) {
        const length = status.tackling ? 46 : status.extraEffort ? 50 : 26;
        const alpha = status.tackling ? 0.7 : status.extraEffort ? 0.85 : 0.45;
        const trailColor = status.extraEffort ? EXTRA_EFFORT_TRAIL_COLOR : 0xffffff;
        trail.clear();
        for (const offset of [-0.55, 0, 0.55]) {
          const y = offset * PLAYER_RADIUS;
          const tail = length * (offset === 0 ? 1 : 0.7);
          trail
            .moveTo(-PLAYER_RADIUS * 0.6, y)
            .lineTo(-PLAYER_RADIUS * 0.6 - tail, y)
            .stroke({ width: status.extraEffort ? 4 : 3, color: trailColor, alpha, cap: "round" });
        }
        trail.rotation = status.velocityAngle - container.rotation;
      }
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
  /** Pins the bar to the bottom centre of a screen of the given size (call on resize / every frame). */
  setScreenSize(screenWidth: number, screenHeight: number): void;
  setStamina(ratio: number): void;
  /** Second bar, stacked above the stamina bar; brighter while the boost is active. */
  setExtraEffort(ratio: number, active: boolean): void;
}

/**
 * Local-only endurance bar, fixed at the bottom centre of the screen. Never
 * instantiate or show one for another client's player.
 */
export function createStaminaBarView(): StaminaBarView {
  const container = new Container();
  const background = new Graphics()
    .roundRect(-STAMINA_BAR_WIDTH / 2, 0, STAMINA_BAR_WIDTH, STAMINA_BAR_HEIGHT, 6)
    .fill({ color: 0x000000, alpha: 0.6 })
    .stroke({ width: 2, color: 0xffffff, alpha: 0.85 });
  const fill = new Graphics();
  const extraBackground = new Graphics()
    .roundRect(-STAMINA_BAR_WIDTH / 2, -EXTRA_BAR_HEIGHT - EXTRA_BAR_GAP, STAMINA_BAR_WIDTH, EXTRA_BAR_HEIGHT, 5)
    .fill({ color: 0x000000, alpha: 0.6 })
    .stroke({ width: 2, color: 0xffffff, alpha: 0.85 });
  const extraFill = new Graphics();
  container.addChild(background, fill, extraBackground, extraFill);
  container.visible = false;

  return {
    container,
    setVisible(visible: boolean) {
      container.visible = visible;
    },
    setExtraEffort(ratio: number, active: boolean) {
      const clamped = Math.max(0, Math.min(1, ratio));
      const inset = 2;
      const innerWidth = (STAMINA_BAR_WIDTH - inset * 2) * clamped;
      extraFill.clear();
      if (innerWidth <= 0) return;
      extraFill
        .roundRect(
          -STAMINA_BAR_WIDTH / 2 + inset,
          -EXTRA_BAR_HEIGHT - EXTRA_BAR_GAP + inset,
          innerWidth,
          EXTRA_BAR_HEIGHT - inset * 2,
          3,
        )
        .fill({ color: active ? EXTRA_BAR_ACTIVE_COLOR : EXTRA_BAR_COLOR });
    },
    setScreenSize(screenWidth: number, screenHeight: number) {
      container.position.set(screenWidth / 2, screenHeight - STAMINA_BAR_HEIGHT - STAMINA_BAR_BOTTOM_MARGIN);
    },
    setStamina(ratio: number) {
      const clamped = Math.max(0, Math.min(1, ratio));
      const inset = 3;
      const innerWidth = (STAMINA_BAR_WIDTH - inset * 2) * clamped;
      fill.clear();
      if (innerWidth <= 0) return;
      fill
        .roundRect(-STAMINA_BAR_WIDTH / 2 + inset, inset, innerWidth, STAMINA_BAR_HEIGHT - inset * 2, 4)
        .fill({ color: staminaColor(clamped) });
    },
  };
}
