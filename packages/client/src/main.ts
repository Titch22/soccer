import {
  BALL_INTERACT_INDICATOR_RADIUS,
  computeSwungAimDirection,
  DEFAULT_MIN_PLAYERS_TO_START,
  distance,
  PASS_CHARGE_MAX_MS,
  resolveShootBaseAim,
  SHOOT_MAX_CHARGE_MS,
  STAMINA_MAX,
  TICK_DURATION_MS,
  type InputCommand,
  type MatchState,
} from "@rematch/shared";
import {
  createBallInteractIndicatorView,
  createBallView,
  createPlayerView,
  createStaminaBarView,
  type PlayerView,
} from "./render/EntityViews";
import { InputManager } from "./input/InputManager";
import { NetConnection } from "./net/connection";
import { createPitchView } from "./render/PitchView";
import { createPixiApp } from "./render/PixiApp";

// Dev talks to the local server directly; production goes through the reverse proxy on /ws.
const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV
    ? "ws://localhost:2567"
    : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
const TEAM_COLORS: Record<"A" | "B", number> = { A: 0x2255ee, B: 0xee3322 };
const GOAL_TOAST_DURATION_MS = 1800;

function waitForJoinClick(): Promise<void> {
  const landing = document.getElementById("landing");
  const button = document.getElementById("join-button") as HTMLButtonElement | null;
  return new Promise((resolve) => {
    if (!button || !landing) {
      resolve();
      return;
    }
    button.addEventListener(
      "click",
      () => {
        button.disabled = true;
        button.textContent = "Connecting...";
        landing.hidden = true;
        resolve();
      },
      { once: true },
    );
  });
}

async function main() {
  const container = document.getElementById("app");
  if (!container) throw new Error("missing #app container");

  const app = await createPixiApp(container);

  const pitch = createPitchView();
  app.stage.addChild(pitch);

  const ballView = createBallView();
  app.stage.addChild(ballView);

  const playerViews = new Map<string, PlayerView>();

  const staminaBar = createStaminaBarView();
  app.stage.addChild(staminaBar.container);

  const ballInteractIndicator = createBallInteractIndicatorView();
  app.stage.addChild(ballInteractIndicator.container);

  let viewport = { x: 0, y: 0, scale: 1 };
  function fitStage() {
    const scale = Math.min(app.screen.width / 1000, app.screen.height / 600);
    pitch.scale.set(scale);
    const offsetX = (app.screen.width - 1000 * scale) / 2;
    const offsetY = (app.screen.height - 600 * scale) / 2;
    pitch.position.set(offsetX, offsetY);
    viewport = { x: offsetX, y: offsetY, scale };
  }
  fitStage();
  app.renderer.on("resize", fitStage);

  const toScreen = (x: number, y: number) => ({
    x: viewport.x + x * viewport.scale,
    y: viewport.y + y * viewport.scale,
  });

  const hud = document.getElementById("hud");
  const statusBanner = document.getElementById("status-banner");
  const goalToast = document.getElementById("goal-toast");

  await waitForJoinClick();

  const net = new NetConnection(SERVER_URL);
  net.onStatusChange = (status) => {
    if (!statusBanner) return;
    if (status === "connected") {
      statusBanner.hidden = true;
    } else {
      statusBanner.hidden = false;
      statusBanner.textContent =
        status === "reconnecting" ? "Connection lost - reconnecting..." : "Disconnected from match";
    }
  };
  await net.connect();
  if (hud) hud.hidden = false;

  const input = new InputManager({ gamepadSlot: 0, keyboardMouseTarget: app.canvas });

  let tick = 0;
  let accumulator = 0;
  let lastTime = performance.now();
  let lastKnownSelfPos = { x: 500, y: 300 };
  let lastKnownScore = { A: 0, B: 0 };
  let goalToastHideAt = 0;
  let lastSentAimVector = { x: 1, y: 0 };
  let lastSentAimActive = false;

  app.ticker.add(() => {
    const now = performance.now();
    let frameDt = now - lastTime;
    lastTime = now;
    if (frameDt > 250) frameDt = 250;
    accumulator += frameDt;
    input.pollFlick(now);

    const state: MatchState | null = net.getState();
    const selfId = net.sessionId;
    if (state && selfId && state.players[selfId]) {
      const p = state.players[selfId]!;
      lastKnownSelfPos = { x: p.position.x, y: p.position.y };
    }

    while (accumulator >= TICK_DURATION_MS) {
      tick += 1;
      const screen = toScreen(lastKnownSelfPos.x, lastKnownSelfPos.y);
      const command: InputCommand = input.sample(tick, screen.x, screen.y);
      lastSentAimVector = command.aimVector;
      lastSentAimActive = command.aimActive;
      net.sendInput(command);
      accumulator -= TICK_DURATION_MS;
    }

    if (!state) return;

    const seenIds = new Set<string>();
    for (const player of Object.values(state.players)) {
      seenIds.add(player.id);
      let view = playerViews.get(player.id);
      if (!view) {
        view = createPlayerView(TEAM_COLORS[player.teamId], player.id === selfId);
        playerViews.set(player.id, view);
        app.stage.addChild(view.container);
      }
      const screen = toScreen(player.position.x, player.position.y);
      view.container.position.set(screen.x, screen.y);
      view.setFacing(player.facing);
      view.setStatus(
        {
          sprinting: player.isSprinting,
          possessing: state.ball.possessedByPlayerId === player.id,
          tackling: player.possessionState === "tackling",
          stunned: player.possessionState === "stunned",
          velocityAngle: Math.atan2(player.velocity.y, player.velocity.x),
          speed: Math.hypot(player.velocity.x, player.velocity.y),
        },
        performance.now(),
      );
      view.container.alpha = player.id === selfId ? 1 : 0.85;

      // Local-only indicators: never reveal another client's pass charge/aim,
      // shoot power, or stamina.
      if (player.id === selfId) {
        const worldAimAngle = Math.atan2(lastSentAimVector.y, lastSentAimVector.x);
        view.setPassAim(
          player.possessionState === "chargingPass",
          player.passChargeMs / PASS_CHARGE_MAX_MS,
          worldAimAngle,
        );

        if (player.possessionState === "chargingShot") {
          const baseAim = resolveShootBaseAim(
            player.velocity,
            player.facing,
            lastSentAimVector,
            lastSentAimActive,
          );
          const swungAim = computeSwungAimDirection(baseAim, player.shootChargeMs);
          const swungAngle = Math.atan2(swungAim.y, swungAim.x);
          view.setShootPower(true, player.shootChargeMs / SHOOT_MAX_CHARGE_MS, swungAngle);
        } else {
          view.setShootPower(false, 0, 0);
        }

        staminaBar.setVisible(true);
        staminaBar.setPosition(screen.x, screen.y);
        staminaBar.setStamina(player.stamina / STAMINA_MAX);
      } else {
        view.setPassAim(false, 0, 0);
        view.setShootPower(false, 0, 0);
      }
    }

    for (const [id, view] of playerViews) {
      if (!seenIds.has(id)) {
        app.stage.removeChild(view.container);
        playerViews.delete(id);
      }
    }

    const ballScreen = toScreen(state.ball.position.x, state.ball.position.y);
    ballView.position.set(ballScreen.x, ballScreen.y);

    // Local-only: only show the "you can act on the ball" diamond while the
    // ball is loose (nobody has possession yet) and close enough to THIS
    // client's own player - never reveals anything about how close other
    // players are to it.
    const selfPlayer = selfId ? state.players[selfId] : undefined;
    const canInteract =
      !!selfPlayer &&
      state.ball.possessedByPlayerId === null &&
      distance(selfPlayer.position, state.ball.position) < BALL_INTERACT_INDICATOR_RADIUS;
    ballInteractIndicator.setVisible(canInteract);
    if (canInteract) ballInteractIndicator.setPosition(ballScreen.x, ballScreen.y);

    if (hud) hud.textContent = formatHud(state);

    if (goalToast) {
      const scoringTeam =
        state.score.A > lastKnownScore.A ? "A" : state.score.B > lastKnownScore.B ? "B" : null;
      if (scoringTeam) {
        goalToast.textContent = `GOAL - TEAM ${scoringTeam}`;
        goalToast.style.color = scoringTeam === "A" ? "#6fa8ff" : "#ff8a75";
        goalToast.classList.add("visible");
        goalToastHideAt = now + GOAL_TOAST_DURATION_MS;
      } else if (goalToastHideAt && now >= goalToastHideAt) {
        goalToast.classList.remove("visible");
        goalToastHideAt = 0;
      }
    }
    lastKnownScore = state.score;
  });
}

function formatHud(state: MatchState): string {
  if (state.clock.phase === "kickoff") {
    const count = Object.keys(state.players).length;
    return `Waiting for players (${count}/${DEFAULT_MIN_PLAYERS_TO_START})`;
  }
  const totalSeconds = Math.ceil(state.clock.remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const phaseLabel = state.clock.phase === "fulltime" ? "  FULL TIME" : "";
  return `${state.score.A} - ${state.score.B}   ${minutes}:${seconds}${phaseLabel}`;
}

main().catch((err) => {
  console.error(err);
});
