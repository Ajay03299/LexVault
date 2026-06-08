/**
 * browser.ts — MCA portal browser session (Playwright, persistent Firefox).
 *
 * HUMAN-IN-THE-LOOP CONTRACT (never violated):
 *   The human performs login, CAPTCHA, and payment in this real browser window.
 *   LexVault only drives the DOM AFTER the human signals "Resume".
 *
 * Firefox is the default engine (MCA is "best viewed in Firefox"; the reference
 * tool used it). A persistent context keeps the logged-in session across the
 * pause/resume, and across app restarts (within MCA's 7-day workspace window).
 */
import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import type { BrowserContext, Page, Download } from 'playwright'
import { activity } from '../logger'

// MCA V3 entry point. Human navigates to the specific company's
// "View Public Documents V3" page after login + payment.
export const MCA_ENTRY_URL = 'https://www.mca.gov.in/'

let context: BrowserContext | null = null
let page: Page | null = null

function profileDir(): string {
  const dir = join(app.getPath('userData'), '.mca-profile')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function downloadsDir(cin: string): string {
  const dir = join(app.getPath('userData'), 'downloads', cin)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function isOpen(): boolean {
  return context !== null && page !== null && !page.isClosed()
}

/** Launch (or focus) the persistent Firefox window at the MCA portal. */
export async function open(): Promise<void> {
  if (isOpen()) {
    await page!.bringToFront()
    return
  }
  // Lazy import keeps Playwright out of the startup path.
  const { firefox } = (await import('playwright')) as typeof import('playwright')
  activity.info('Launching Firefox (persistent profile)…')
  context = await firefox.launchPersistentContext(profileDir(), {
    headless: false,
    acceptDownloads: true,
    viewport: { width: 1280, height: 900 }
  })
  page = context.pages()[0] ?? (await context.newPage())
  await page.goto(MCA_ENTRY_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  activity.success('MCA portal opened. Log in, open your company in “View Public Documents V3”, complete payment, then click Resume.')
}

export function getPage(): Page {
  if (!page || page.isClosed()) throw new Error('Browser is not open. Start a collection first.')
  return page
}

/**
 * Capture the current page state for selector-building / debugging.
 * Saves a full-page screenshot + HTML next to the company's downloads.
 */
export async function capture(cin: string): Promise<{ html: string; screenshot: string }> {
  const p = getPage()
  const dir = downloadsDir(cin)
  const screenshot = join(dir, `capture_${Date.now()}.png`)
  const htmlPath = join(dir, `capture_${Date.now()}.html`)
  await p.screenshot({ path: screenshot, fullPage: true })
  const { writeFileSync } = await import('node:fs')
  writeFileSync(htmlPath, await p.content(), 'utf8')
  activity.info(`Captured current page → ${screenshot}`)
  return { html: htmlPath, screenshot }
}

/** Wait for the next browser download and save it to disk. */
export async function waitForDownload(
  cin: string,
  trigger: () => Promise<void>,
  timeoutMs = 120_000
): Promise<string> {
  const p = getPage()
  const [download] = await Promise.all([
    p.waitForEvent('download', { timeout: timeoutMs }) as Promise<Download>,
    trigger()
  ])
  const suggested = download.suggestedFilename()
  const dest = join(downloadsDir(cin), suggested)
  await download.saveAs(dest)
  return dest
}

export async function close(): Promise<void> {
  try {
    await context?.close()
  } finally {
    context = null
    page = null
    activity.info('Browser closed.')
  }
}
