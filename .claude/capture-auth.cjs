// Authenticated capture pass. Logs in once, then walks through the app.
// Credentials are read from env so they never land on disk via this file.
const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = path.join(__dirname, "screenshots");
const BASE = process.env.URL || "http://localhost:3000/";
const EMAIL = process.env.AP_EMAIL;
const PASSWORD = process.env.AP_PASS;
if (!EMAIL || !PASSWORD) { console.error("AP_EMAIL / AP_PASS env required"); process.exit(2); }

const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const wait = ms => new Promise(r => setTimeout(r, ms));

async function shot(page, name, opts = {}) {
  const file = path.join(OUT, `${name}.png`);
  await wait(opts.settle || 700);
  await page.screenshot({ path: file, fullPage: !!opts.full });
  console.log(`  ✓ ${name}.png  (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
}

// Click a button matching a French label, on the page or in any iframe.
async function clickByText(page, regex) {
  return page.evaluate((re) => {
    const rx = new RegExp(re, "i");
    const all = [...document.querySelectorAll("button, a, [role=button]")];
    const el = all.find(e => rx.test(e.textContent || ""));
    if (!el) return false;
    el.scrollIntoView({ block: "center" });
    el.click();
    return true;
  }, regex.source);
}

async function login(page) {
  console.log("→ logging in...");
  await page.goto(BASE, { waitUntil: "networkidle2", timeout: 30000 });
  await wait(1800);
  // Real keystrokes — React controlled inputs require synthetic events,
  // which only happen via puppeteer's keyboard API.
  await page.evaluate(() => {
    const inputs = [...document.querySelectorAll("input")];
    const emailEl = inputs.find(i => i.type === "email" || /email/i.test(i.placeholder || i.name || ""));
    if (emailEl) emailEl.focus();
  });
  await page.keyboard.type(EMAIL, { delay: 25 });
  await page.keyboard.press("Tab");
  await wait(150);
  await page.evaluate(() => {
    const pw = [...document.querySelectorAll("input")].find(i => i.type === "password");
    if (pw) pw.focus();
  });
  await page.keyboard.type(PASSWORD, { delay: 25 });
  await wait(200);
  await clickByText(page, /accéder à mes chantiers|se connecter$|^connexion$/);
  // Wait for either the app to render (sidebar appears) or an error
  for (let i = 0; i < 30; i++) {
    await wait(500);
    const ready = await page.evaluate(() => {
      // App is loaded if we see a project name or the "Nouveau projet" button
      return /nouveau projet|nouveau pv/i.test(document.body.textContent) ||
             document.querySelector('[class*="ap-"]') !== null;
    });
    if (ready) { console.log(`  authed after ${(i+1)*500}ms`); return; }
  }
  console.log("  ⚠ auth timeout — staying on auth page?");
}

async function dismissOverlays(page) {
  // Auto-dismiss cookie banner if it shows up.
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("button")];
    for (const b of all) {
      if (/accepter|ok|j'ai compris|fermer/i.test(b.textContent)) {
        const r = b.getBoundingClientRect();
        if (r.bottom > window.innerHeight - 200) { b.click(); return; }
      }
    }
  });
}

async function pressEscape(page) { await page.keyboard.press("Escape"); await wait(400); }

async function tour(page, prefix) {
  console.log(`→ tour (${prefix})`);
  await dismissOverlays(page);
  await wait(800);

  // Onboarding may show if not completed — capture if present, then skip.
  const onboardingPresent = await page.evaluate(() => /votre chantier|bienvenue|étape/i.test(document.body.textContent));
  if (onboardingPresent) {
    await shot(page, `${prefix}-10-onboarding-step1`);
    // Try to click "Plus tard" or close
    const skipped = await clickByText(page, /plus tard|passer|fermer/);
    if (!skipped) await pressEscape(page);
    await wait(800);
  }

  // Overview project (default landing)
  await shot(page, `${prefix}-20-overview`, { settle: 1000 });
  await shot(page, `${prefix}-21-overview-full`, { full: true, settle: 800 });

  // Open sidebar (mobile only — desktop sidebar is always visible)
  if (prefix === "mobile") {
    const opened = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(x => x.querySelector("svg") && /menu/i.test(x.getAttribute("aria-label") || "") || /menu/i.test(x.title || ""));
      if (b) { b.click(); return true; }
      // fallback: click first top-left small button
      const all = [...document.querySelectorAll("button")];
      const top = all.find(x => { const r = x.getBoundingClientRect(); return r.top < 80 && r.left < 80; });
      if (top) { top.click(); return true; }
      return false;
    });
    if (opened) {
      await shot(page, `${prefix}-22-sidebar`, { settle: 700 });
      await pressEscape(page);
    }
  }

  // Profile
  const profileOpened = await page.evaluate(() => {
    // On desktop: click the avatar button at the bottom of sidebar
    // On mobile: tap the bottom bar "Profil"
    const all = [...document.querySelectorAll("button, a")];
    const candidates = all.filter(el =>
      /profil|mon profil/i.test(el.getAttribute("aria-label") || "") ||
      /^\s*profil\s*$/i.test(el.textContent) ||
      el.getAttribute("title") === "Mon profil"
    );
    if (candidates.length) { candidates[0].click(); return true; }
    return false;
  });
  if (profileOpened) {
    await wait(1000);
    await shot(page, `${prefix}-30-profile`, { settle: 800 });
    await shot(page, `${prefix}-31-profile-full`, { full: true, settle: 600 });
  }

  // Go back to overview
  await page.evaluate(() => {
    const back = [...document.querySelectorAll("button")].find(b => /retour|back/i.test(b.getAttribute("aria-label") || b.title || ""));
    if (back) back.click();
  });
  await wait(600);

  // Click "Nouveau PV" (CTA on overview) to enter NoteEditor
  const inEditor = await clickByText(page, /nouveau pv/i);
  if (inEditor) {
    await wait(1500);
    await shot(page, `${prefix}-40-noteeditor-entry`, { settle: 800 });
    await shot(page, `${prefix}-41-noteeditor-full`, { full: true, settle: 600 });
    // Try to back out
    await page.evaluate(() => {
      const back = [...document.querySelectorAll("button")].find(b => /retour|back/i.test(b.getAttribute("aria-label") || b.title || ""));
      if (back) back.click();
    });
    await wait(800);
  }

  // Open the Search modal (Ctrl+K) — only meaningful on desktop
  if (prefix === "desktop") {
    await page.keyboard.down("Control");
    await page.keyboard.press("k");
    await page.keyboard.up("Control");
    await wait(700);
    await shot(page, `${prefix}-50-search`, { settle: 500 });
    await pressEscape(page);
  }

  // Open the collab / share modal — try via "Inviter" button
  const collabOpened = await clickByText(page, /inviter des collaborateurs|inviter/);
  if (collabOpened) {
    await wait(900);
    await shot(page, `${prefix}-60-collab`, { settle: 600 });
    await pressEscape(page);
    await wait(400);
  }
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars"],
  });

  // Desktop pass
  {
    const page = await browser.newPage();
    await page.setViewport(DESKTOP);
    await login(page);
    await tour(page, "desktop");
    await page.close();
  }

  // Mobile pass — reuse session via storage
  {
    const page = await browser.newPage();
    await page.setViewport(MOBILE);
    await page.setUserAgent(MOBILE_UA);
    await login(page);
    await tour(page, "mobile");
    await page.close();
  }

  await browser.close();
  console.log("done");
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
