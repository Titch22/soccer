import { Application } from "pixi.js";

export async function createPixiApp(container: HTMLElement): Promise<Application> {
  const app = new Application();
  await app.init({
    background: "#0a0a0a",
    resizeTo: container,
    antialias: true,
  });
  container.appendChild(app.canvas);
  return app;
}
