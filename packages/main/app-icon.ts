import { app } from 'electron'
import path from 'node:path'

/**
 * Where `resources/icon.png` actually is at runtime.
 *
 * The three call sites used to build the path from `__dirname` alone, which is
 * only right in development. In a packaged build `__dirname` sits inside
 * `app.asar`, and `build.files` ships `dist/**` only — so the path resolved to
 * a file that was not in the archive and every window fell back to Electron's
 * default icon. On Windows nobody noticed: the executable carries the icon
 * compiled in from `icon.ico`, so the title bar looked right by accident. The
 * places where it did not were the taskbar grouping, macOS's dock and the
 * updater window, which appears before the main one.
 *
 * `extraResources` in package.json puts the file next to the asar rather than
 * inside it, and `process.resourcesPath` is how you reach that directory.
 */
export function appIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../../resources/icon.png')
}
