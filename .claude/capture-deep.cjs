// Deeper capture pass: dismiss cookie banner, capture NoteEditor, Collab,
// PDF preview, Agency. Uses bbox-based clicks instead of text matching for
// reliability when multiple buttons share text.
const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = path.join(__dirname, "screenshots");
const BASE = process.env.URL || "http://localhost:3000/";
const EMAIL = process.env.AP_EMAIL;
const PASSWORD = process.env.AP_PASS;
if (!EMAIL || !PASSWORD) { console.error("AP_EMAIL / AP_PASS env required"); process.exit(2); }

const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const wait = ms => new Promise(r => setTimeout(r, ms));

async function shot(page, name, opts = {}) {
  const file = path.join(OUT, `${name}.png`);
  await wait(opts.settle || 700);
  await page.screenshot({ path: file, fullPage: !!opts.full });
  console.log(`  ✓ ${name}.png`);
}

async function login(page) {
  console.log("→ login...");
  await page.goto(BASE, { waitUntil: "networkidle2", timeout: 30000 });
  await wait(1800);
  await page.evaluate(() => {
    const e = [...document.querySelectorAll("input")].find(i => i.type === "email");
    if (e) e.focus();
  });
  await page.keyboard.type(EMAIL, { delay: 25 });
  await page.keyboard.press("Tab");
  await page.evaluate(() => {
    const p = [...document.querySelectorAll("input")].find(i => i.type === "password");
    if (p) p.focus();
  });
  await page.keyboard.type(PASSWORD, { delay: 25 });
  await wait(150);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => /accéder à mes chantiers/i.test(x.textContent));
    if (b) b.click();
  });
  for (let i = 0; i < 30; i++) {
    await wait(500);
    const ready = await page.evaluate(() => /nouveau projet|nouveau pv/i.test(document.body.textContent));
    if (ready) { console.log(`  ✓ authed (${(i+1)*500}ms)`); return; }
  }
}

async function dismissCookies(page) {
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("button")];
    const compris = all.find(b => /^compris$/i.test(b.textContent.trim()));
    if (compris) compris.click();
  });
  await wait(400);
}

// Click whichever element matches selector predicate. The predicate runs in
// the page context and returns the first matching DOM element.
async function clickFirst(page, predicateSrc) {
  return page.evaluate(`(${predicateSrc})()`).then(ok => ok);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars"],
  });

  // ── Desktop deep tour ────────────────────────────────────
  {
    const page = await browser.newPage();
    await page.setViewport(DESKTOP);
    await login(page);
    await wait(1000);
    await dismissCookies(page);
    await wait(400);

    // Overview clean (no cookie banner)
    await shot(page, "desktop-20b-overview-clean", { settle: 800 });

    // Click "Nouveau PV" CTA — the big orange card. Find by textContent
    // including "Nouveau PV".
    const enteredEditor = await clickFirst(page, `() => {
      const all = [...document.querySelectorAll("button, a, [role=button]")];
      const target = all.find(el => /nouveau pv/i.test(el.textContent));
      if (!target) return false;
      target.scrollIntoView({ block: "center" });
      target.click();
      return true;
    }`);
    console.log("  Nouveau PV click:", enteredEditor);
    await wait(2500);
    await shot(page, "desktop-40-noteeditor", { settle: 1200 });
    await shot(page, "desktop-41-noteeditor-full", { full: true, settle: 800 });

    // Click into one post if visible
    await page.evaluate(() => {
      const posts = [...document.querySelectorAll("button")].filter(b => /\b\d{2}\.\s/.test(b.textContent));
      if (posts.length) posts[0].click();
    });
    await wait(900);
    await shot(page, "desktop-42-noteeditor-post", { settle: 600 });

    // Back to overview
    await page.evaluate(() => {
      const back = [...document.querySelectorAll("button")].find(b => /retour/i.test(b.getAttribute("aria-label") || b.title || ""));
      if (back) back.click();
    });
    await wait(900);

    // Open Collab modal — "Inviter des collaborateurs" dashed button
    const opened = await clickFirst(page, `() => {
      const all = [...document.querySelectorAll("button")];
      const t = all.find(b => /inviter des collaborateurs/i.test(b.textContent));
      if (!t) return false;
      t.click(); return true;
    }`);
    console.log("  Collab click:", opened);
    await wait(1000);
    await shot(page, "desktop-60-collab", { settle: 700 });
    await page.keyboard.press("Escape"); await wait(500);

    // Click bell (notifications)
    await clickFirst(page, `() => {
      const all = [...document.querySelectorAll("button")];
      const bell = all.find(b => b.querySelector("svg") && (b.getAttribute("aria-label") || "").match(/notif/i));
      if (bell) { bell.click(); return true; }
      // fallback: top-right button
      const right = all.filter(b => { const r = b.getBoundingClientRect(); return r.top < 60 && r.right > window.innerWidth - 60; });
      if (right.length) { right[0].click(); return true; }
      return false;
    }`);
    await wait(700);
    await shot(page, "desktop-70-notifications", { settle: 500 });
    await page.keyboard.press("Escape"); await wait(400);

    // Open agency view (in profile → Mon agence section, OR via context switcher → Créer agence?)
    // Let's go via Profile → Mon agence section
    await clickFirst(page, `() => {
      const all = [...document.querySelectorAll("button, a")];
      const t = all.find(b => /mon profil/i.test(b.getAttribute("aria-label") || "") || b.title === "Mon profil");
      if (t) { t.click(); return true; } return false;
    }`);
    await wait(900);
    // Now click "Mon agence" anchor in the inner sidebar
    await clickFirst(page, `() => {
      const all = [...document.querySelectorAll("a, button")];
      const t = all.find(b => /^mon agence$/i.test(b.textContent.trim()));
      if (t) { t.click(); return true; } return false;
    }`);
    await wait(900);
    await shot(page, "desktop-80-profile-agency", { settle: 700 });

    // Sidebar context switcher → click to open dropdown
    await page.evaluate(() => {
      const back = [...document.querySelectorAll("button")].find(b => /retour/i.test(b.getAttribute("aria-label") || b.title || ""));
      if (back) back.click();
    });
    await wait(800);
    await clickFirst(page, `() => {
      const all = [...document.querySelectorAll("button")];
      // Context switcher = button containing "ESPACE" + "Personnel" or org name
      const t = all.find(b => /espace/i.test(b.textContent) && /personnel|agence/i.test(b.textContent));
      if (t) { t.click(); return true; } return false;
    }`);
    await wait(700);
    await shot(page, "desktop-90-context-switcher", { settle: 400 });
    await page.keyboard.press("Escape"); await wait(300);

    await page.close();
  }

  // ── Mobile deep tour ─────────────────────────────────────
  {
    const page = await browser.newPage();
    await page.setViewport(MOBILE);
    await page.setUserAgent(MOBILE_UA);
    await login(page);
    await wait(1000);
    await dismissCookies(page);
    await wait(400);

    // Hide skip-link by tabbing past it (it's an a11y skip-link visible at top
    // because Chrome may keep focus on body)
    await page.evaluate(() => document.activeElement?.blur && document.activeElement.blur());
    await page.evaluate(() => document.body.click());
    await wait(300);

    await shot(page, "mobile-20b-overview-clean", { settle: 800 });
    await shot(page, "mobile-21b-overview-full-clean", { full: true, settle: 600 });

    // Try to enter NoteEditor on mobile (PV tab in bottom bar)
    await clickFirst(page, `() => {
      const all = [...document.querySelectorAll("button")];
      const pv = all.find(b => /^pv$/i.test(b.textContent.trim()) || (b.getAttribute("aria-label") || "").match(/^PV$/i));
      if (pv) { pv.click(); return true; } return false;
    }`);
    await wait(1500);
    await shot(page, "mobile-40-noteeditor", { settle: 700 });

    // Open mobile profile
    await clickFirst(page, `() => {
      const all = [...document.querySelectorAll("button")];
      const profil = all.find(b => /^profil$/i.test(b.textContent.trim()) || (b.getAttribute("aria-label") || "").match(/^Profil$/i));
      if (profil) { profil.click(); return true; } return false;
    }`);
    await wait(1000);
    await shot(page, "mobile-30b-profile-clean", { settle: 600 });
    await shot(page, "mobile-31b-profile-full-clean", { full: true, settle: 500 });

    // Tap Photo FAB (camera)
    await clickFirst(page, `() => {
      const all = [...document.querySelectorAll("button")];
      const cam = all.find(b => (b.getAttribute("aria-label") || "").match(/photo/i));
      if (cam) { cam.click(); return true; } return false;
    }`);
    await wait(800);
    await shot(page, "mobile-50-photo-sheet", { settle: 500 });

    await page.close();
  }

  await browser.close();
  console.log("done");
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
