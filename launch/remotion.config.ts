import { Config } from "@remotion/cli/config"
import { existsSync } from "node:fs"
import { homedir } from "node:os"

// Remotion's bundled headless shell crashes on start on this machine ("Target closed");
// Playwright's build of the same browser works. Override with REMOTION_BROWSER if needed.
const playwrightShell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`
const browser = process.env.REMOTION_BROWSER ?? (existsSync(playwrightShell) ? playwrightShell : null)
if (browser) Config.setBrowserExecutable(browser)
Config.setVideoImageFormat("jpeg")
Config.setJpegQuality(92)
