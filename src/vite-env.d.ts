/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POKEMONTCG_API_KEY?: string
  readonly BASE_URL: string
  readonly PROD: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
