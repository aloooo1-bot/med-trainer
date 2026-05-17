/**
 * Phase B — Tab Inspection
 * Uses Playwright to walk every study tab as a signed-in student,
 * capturing screenshots, HTML, console errors, and interaction logs.
 *
 * Prerequisites:
 *   npm install playwright
 *   npx playwright install chromium
 */

import { config } from 'dotenv'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '..', '..', '.env.local') })

import { tabArtifactPath, writeJSON, listTranscripts } from './lib/artifacts.mjs'

const BASE = 'http://localhost:3000'

// Tabs to inspect in order
const TABS = [
  { name: 'dashboard', route: '/' },
  { name: 'history', route: '/history' },
  { name: 'progress', route: '/progress' },
  { name: 'review', route: '/review' },
  { name: 'focus', route: '/focus' },
  { name: 'help', route: '/help' },
  { name: 'settings', route: '/settings' },
  { name: 'trainer', route: '/trainer' },
]

function buildLocalStorageSessions(transcripts) {
  // Inject session records into localStorage so /review has data to render.
  // Format matches CaseSessionRecord in app/lib/analytics.ts.
  return transcripts
    .filter(t => t.grading && !t.error)
    .slice(0, 20) // cap at 20 to avoid overstuffing localStorage
    .map((t, i) => ({
      id: Date.now().toString(36) + i.toString(36),
      startedAt: Date.now() - (i + 1) * 25 * 60 * 1000,
      completedAt: Date.now() - i * 25 * 60 * 1000,
      system: t.system,
      difficulty: t.difficulty,
      diagnosis: t.correctDiagnosis ?? t.caseData?.diagnosis ?? 'Unknown',
      userDiagnosis: t.diagnosis ?? 'Unknown',
      correct: t.correct ?? false,
      score: t.score ?? 50,
      questionCount: t.difficulty === 'Foundations' ? 3 : t.difficulty === 'Clinical' ? 4 : 5,
      apiCalls: [],
      totalCostUSD: 0.08,
      totalInputTokens: 3000,
      totalOutputTokens: 1200,
      elapsedSeconds: t.difficulty === 'Foundations' ? 420 : t.difficulty === 'Clinical' ? 600 : 850,
      gradingResult: t.grading ?? null,
      bookmarked: i % 5 === 0,
      notes: i % 7 === 0 ? `Review: ${t.correctDiagnosis ?? ''}` : '',
    }))
}

async function inspectTab(page, tabDef, interactionLog, consoleErrors, networkErrors) {
  const { name, route } = tabDef
  process.stdout.write(`  → ${name} (${route})... `)
  const start = Date.now()

  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForTimeout(1500) // allow JS to settle

    // Tab-specific interactions
    if (name === 'history') {
      await interactHistory(page, interactionLog)
    } else if (name === 'focus') {
      await interactFocus(page, interactionLog)
    } else if (name === 'settings') {
      await interactSettings(page, interactionLog)
    }

    // Capture
    const htmlPath = tabArtifactPath(name, 'html')
    const html = await page.evaluate(() => document.documentElement.outerHTML)
    fs.writeFileSync(htmlPath, html)

    await page.screenshot({
      path: tabArtifactPath(name, 'png'),
      fullPage: true,
    })

    const elapsed = Date.now() - start
    const tabJson = {
      url: `${BASE}${route}`,
      capturedAt: new Date().toISOString(),
      consoleErrors: [...consoleErrors],
      networkErrors: [...networkErrors],
      interactionLog: [...interactionLog],
      elapsedMs: elapsed,
    }
    writeJSON(tabArtifactPath(name, 'json'), tabJson)
    console.log(`done (${elapsed}ms, ${consoleErrors.length} console err, ${networkErrors.length} net err)`)
    return tabJson
  } catch (err) {
    console.log(`ERROR: ${err.message}`)
    const tabJson = {
      url: `${BASE}${route}`,
      capturedAt: new Date().toISOString(),
      error: err.message,
      consoleErrors: [...consoleErrors],
      networkErrors: [...networkErrors],
      interactionLog: [...interactionLog],
      elapsedMs: Date.now() - start,
    }
    writeJSON(tabArtifactPath(name, 'json'), tabJson)
    // Still try screenshot even if navigation failed
    try {
      await page.screenshot({ path: tabArtifactPath(name, 'png'), fullPage: true })
    } catch {}
    return tabJson
  }
}

async function interactHistory(page, log) {
  try {
    // Expand first row if available
    const rows = page.locator('[data-session-id], [data-testid="session-row"], .dx-table-row, tbody tr, .session-row').first()
    if (await rows.isVisible({ timeout: 3000 })) {
      await rows.click()
      await page.waitForTimeout(800)
      log.push({ action: 'expand-first-row', status: 'ok' })
    } else {
      log.push({ action: 'expand-first-row', status: 'no rows visible' })
    }
  } catch (err) {
    log.push({ action: 'expand-first-row', status: `failed: ${err.message}` })
  }

  try {
    // Try toggling a bookmark star
    const bookmarkBtn = page.locator('button[aria-label*="ookmark"], button[title*="ookmark"]').first()
    if (await bookmarkBtn.isVisible({ timeout: 2000 })) {
      await bookmarkBtn.click()
      await page.waitForTimeout(500)
      log.push({ action: 'toggle-bookmark', status: 'ok' })
    } else {
      log.push({ action: 'toggle-bookmark', status: 'not found' })
    }
  } catch (err) {
    log.push({ action: 'toggle-bookmark', status: `failed: ${err.message}` })
  }

  try {
    // Check filter chips exist
    const chips = await page.locator('button').filter({ hasText: /Foundations|Clinical|Advanced/ }).count()
    log.push({ action: 'check-filter-chips', status: chips > 0 ? `${chips} found` : 'none found' })
  } catch (err) {
    log.push({ action: 'check-filter-chips', status: `failed: ${err.message}` })
  }
}

async function interactFocus(page, log) {
  // Focus tab uses mock data — try to click "Start Case" or "Study this" stubs
  page.once('dialog', async dialog => {
    log.push({ action: 'focus-dialog', text: dialog.message(), type: dialog.type() })
    await dialog.accept()
  })

  try {
    const startBtn = page.locator('button').filter({ hasText: /Start Case|Study this/i }).first()
    if (await startBtn.isVisible({ timeout: 3000 })) {
      await startBtn.click()
      await page.waitForTimeout(800)
      log.push({ action: 'click-start-case', status: 'ok' })
    } else {
      log.push({ action: 'click-start-case', status: 'button not visible' })
    }
  } catch (err) {
    log.push({ action: 'click-start-case', status: `failed: ${err.message}` })
  }
}

async function interactSettings(page, log) {
  try {
    // Toggle dark mode chip
    const darkBtn = page.locator('button, [role="radio"]').filter({ hasText: /^Dark$/i }).first()
    if (await darkBtn.isVisible({ timeout: 3000 })) {
      await darkBtn.click()
      await page.waitForTimeout(500)
      log.push({ action: 'toggle-dark-mode', status: 'ok' })
      // Toggle back to avoid messing with the test user's prefs
      const lightBtn = page.locator('button, [role="radio"]').filter({ hasText: /^Light$/i }).first()
      if (await lightBtn.isVisible({ timeout: 2000 })) {
        await lightBtn.click()
        await page.waitForTimeout(500)
        log.push({ action: 'restore-light-mode', status: 'ok' })
      }
    } else {
      log.push({ action: 'toggle-dark-mode', status: 'button not found' })
    }
  } catch (err) {
    log.push({ action: 'toggle-dark-mode', status: `failed: ${err.message}` })
  }

  // Do NOT interact with volume inputs or destructive account settings
  log.push({ action: 'account-settings', status: 'skipped (destructive)' })
}

export async function runTabInspection() {
  const email    = process.env.STUDENT_AUDIT_TEST_EMAIL
  const password = process.env.STUDENT_AUDIT_TEST_PASSWORD
  if (!email || !password) {
    throw new Error('STUDENT_AUDIT_TEST_EMAIL and STUDENT_AUDIT_TEST_PASSWORD must be set in .env.local')
  }

  // Lazy import playwright (must be installed separately)
  let chromium
  try {
    const pw = await import('playwright')
    chromium = pw.chromium
  } catch {
    throw new Error('playwright not installed. Run: npm install playwright && npx playwright install chromium')
  }

  // Load transcripts to build localStorage injection data
  const transcripts = listTranscripts()
  const localSessions = buildLocalStorageSessions(transcripts)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  // Per-context error listeners (clear between tabs)
  const consoleErrors = []
  const networkErrors = []
  const interactionLog = []

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push({ text: msg.text(), url: msg.location()?.url })
  })
  page.on('pageerror', err => {
    consoleErrors.push({ text: err.message, type: 'pageerror' })
  })
  page.on('requestfailed', req => {
    const url = req.url()
    if (!url.includes('/__nextjs') && !url.includes('/_next/static')) {
      networkErrors.push({ url, failure: req.failure()?.errorText })
    }
  })

  try {
    // Sign in
    console.log(`  Signing in as ${email}...`)
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')
    await page.waitForURL(url => url.pathname !== '/auth/login', { timeout: 20000, waitUntil: 'commit' })
    console.log('  Signed in successfully.')
    interactionLog.push({ action: 'sign-in', status: 'ok', email })

    // Inject localStorage sessions so /review has data
    if (localSessions.length > 0) {
      await page.evaluate((sessions) => {
        localStorage.setItem('medtrainer_analytics', JSON.stringify(sessions))
      }, localSessions)
      interactionLog.push({ action: 'inject-localstorage', count: localSessions.length })
      console.log(`  Injected ${localSessions.length} sessions into localStorage for /review`)
    }

    // Walk each tab
    for (const tabDef of TABS) {
      // Clear per-tab error state
      consoleErrors.length = 0
      networkErrors.length = 0
      interactionLog.length = 0
      // Restore localStorage on each navigation (it persists within the session)
      await inspectTab(page, tabDef, interactionLog, consoleErrors, networkErrors)
    }
  } finally {
    await browser.close()
  }

  console.log(`Tab inspection complete. Artifacts: scripts/student-audit/artifacts/tabs/`)
}
