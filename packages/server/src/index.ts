import { createServer } from "node:http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { MatchRoom } from "./rooms/MatchRoom.js";

const port = Number(process.env.PORT ?? 2567);
// Behind a reverse proxy the game server should only be reachable locally.
const host = process.env.HOST ?? (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0");

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  // Non-health requests are handled by Colyseus (matchmaking) via its own listeners.
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("match", MatchRoom);

httpServer.listen(port, host, () => {
  console.log(`[server] rematch-web server listening on ${host}:${port}`);
});

async function shutdown(signal: string) {
  console.log(`[server] ${signal} received, shutting down`);
  try {
    await gameServer.gracefullyShutdown(false);
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
