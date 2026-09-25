import { PITCH_HEIGHT, PITCH_WIDTH, GOAL_WIDTH } from "@soccer/shared";
import { Container, Graphics } from "pixi.js";

export function createPitchView(): Container {
  const container = new Container();
  const g = new Graphics();

  g.rect(0, 0, PITCH_WIDTH, PITCH_HEIGHT).fill(0x1e7a34);

  g.rect(2, 2, PITCH_WIDTH - 4, PITCH_HEIGHT - 4).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });

  g.moveTo(PITCH_WIDTH / 2, 0)
    .lineTo(PITCH_WIDTH / 2, PITCH_HEIGHT)
    .stroke({ width: 2, color: 0xffffff, alpha: 0.8 });

  g.circle(PITCH_WIDTH / 2, PITCH_HEIGHT / 2, 60).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });

  const goalTop = (PITCH_HEIGHT - GOAL_WIDTH) / 2;
  g.rect(-10, goalTop, 10, GOAL_WIDTH).stroke({ width: 2, color: 0xffffff });
  g.rect(PITCH_WIDTH, goalTop, 10, GOAL_WIDTH).stroke({ width: 2, color: 0xffffff });

  container.addChild(g);
  return container;
}
