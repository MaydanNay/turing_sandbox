/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_API_PROXY_TARGET: string;
  readonly VITE_SCENE_EDITOR_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
