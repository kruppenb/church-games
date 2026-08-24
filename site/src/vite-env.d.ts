/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the shared leaderboard API, including `/api`. Unset ⇒ device-local boards. */
  readonly VITE_LEADERBOARD_API?: string;
  /** Random token gating teacher mode. */
  readonly VITE_TEACHER_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
