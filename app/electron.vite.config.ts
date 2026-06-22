import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// 让 app 主进程/preload/renderer 可以直接 import 仓库根 src/
// (in-process 复用 upup agent-core / tools / skills 源码)
const WORKSPACE_SRC = resolve(__dirname, '..', '..', 'src')

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@upup-src': WORKSPACE_SRC
      }
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          'claw-schedule-mcp-node-entry': resolve('src/main/claw-schedule-mcp-node-entry.ts')
        }
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@upup-src': WORKSPACE_SRC
      }
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
        '@upup-src': WORKSPACE_SRC
      }
    },
    plugins: [react()]
  }
})
