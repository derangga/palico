import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

// COOP/COEP make the document cross-origin isolated so multi-threaded
// ffmpeg-core can use SharedArrayBuffer. src/server.ts sets these on the
// SSR/worker responses, but Vite's dev & preview middleware serves
// @ffmpeg/ffmpeg's own worker (worker.js?worker_file&type=module) directly —
// without these headers the nested pthreads workers can't spawn and
// ffmpeg.load() hangs on "Preparing tools". Mirror them here for dev/preview.
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  server: { headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },
  plugins: [
    devtools(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
