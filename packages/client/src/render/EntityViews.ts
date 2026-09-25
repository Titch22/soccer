import { BALL_RADIUS, PLAYER_RADIUS } from "@rematch/shared";
import { Container, Graphics } from "pixi.js";

export function createPlayerView(color: number): Container {
  const container = new Container();
  const body = new Graphics().circle(0, 0, PLAYER_RADIUS).fill(color);
  const facingLine = new Graphics()
    .moveTo(0, 0)
    .lineTo(PLAYER_RADIUS + 6, 0)
    .stroke({ width: 3, color: 0xffffff });
  container.addChild(body, facingLine);
  return container;
}

export function createBallView(): Container {
  const container = new Container();
  const body = new Graphics().circle(0, 0, BALL_RADIUS).fill(0xffffff);
  container.addChild(body);
  return container;
}
