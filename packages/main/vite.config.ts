import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  build: {
    outDir: path.resolve(__dirname, '../../dist/main'),
    lib: {
      entry: path.resolve(__dirname, 'index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.cjs'
    },
    rollupOptions: {
      // Bundle everything local; externalise only bare npm/electron specifiers.
      // path.isAbsolute keeps Windows entry paths (C:\...) from being treated
      // as external, which would otherwise produce an empty bundle.
      external: (id) => {
        if (id === 'electron' || id.startsWith('electron/')) return true
        if (id.startsWith('\0') || id.startsWith('.') || id.startsWith('@nememu/')) return false
        return !path.isAbsolute(id)
      }
    },
    minify: false,
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@nememu/shared': path.resolve(__dirname, '../shared/index.ts')
    }
  }
})
