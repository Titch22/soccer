interface ImportMetaEnv {
  readonly DEV: boolean;
  /** Overrides the game server WebSocket URL (e.g. wss://ws.example.com). */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
