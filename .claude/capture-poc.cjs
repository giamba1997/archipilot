// Targeted POC review capture. Reuses the login flow of capture-auth.cjs and
// drills into the screens the POC scope review needs:
//   desktop : Profile→Abonnement (plan cards), NoteEditor with a remark line
//   mobile  : MobileHome, Mode Chantier (Visite) capture actions, quick sheet
const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = path.join(__dirname, "screenshots-poc");
const BASE = process.env.URL || "http://localhost:3000/";
const EMAIL = process.env.AP_EMAIL;
const PASSWORD = process.env.AP_PASS;
if (!EMAIL || !PASSWORD) { console.error("AP_EMAIL / AP_PASS env required"); process.exit(2); }

const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));

async function shot(page, name, opts = {}) {
  const file = path.join(OUT, `${name}.png`);
  await wait(opts.settle || 700);
  await page.screenshot({ path: file, fullPage: !!opts.full });
  console.log(`  ✓ ${name}.png  (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
}

async function clickByText(page, regex) {
  return page.evaluate((re) => {
    const rx = new RegExp(re, "i");
    const all = [...document.querySelectorAll("button, a, [role=button]")];
    const el = all.find(e => rx.test((e.textContent || "").trim()));
    if (!el) return false;
    el.scrollIntoView({ block: "center" });
    el.click();
    return true;
  }, regex.source);
}

async function clickAria(page, regex) {
  return page.evaluate((re) => {
    const rx = new RegExp(re, "i");
    const all = [...document.querySelectorAll("button, a, [role=button]")];
    const el = all.find(e => rx.test(e.getAttribute("aria-label") || "") || rx.test(e.title || ""));
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
  await page.evaluate(() => {
    const inputs = [...document.querySelectorAll("input")];
    const emailEl = inputs.find(i => i.type === "email" || /email/i.test(i.placeholder || i.name || ""));
    if (emailEl) emailEl.focus();
  });
  await page.keyboard.type(EMAIL, { delay: 20 });
  await page.keyboard.press("Tab");
  await wait(150);
  await page.evaluate(() => {
    const pw = [...document.querySelectorAll("input")].find(i => i.type === "password");
    if (pw) pw.focus();
  });
  await page.keyboard.type(PASSWORD, { delay: 20 });
  await wait(200);
  await clickByText(page, /accéder à mes chantiers|se connecter$|^connexion$/);
  for (let i = 0; i < 30; i++) {
    await wait(500);
    const ready = await page.evaluate(() =>
      /nouveau projet|nouveau pv|tout est calme|mes chantiers/i.test(document.body.textContent));
    if (ready) { console.log(`  authed after ${(i+1)*500}ms`); return true; }
  }
  console.log("  ⚠ auth timeout");
  return false;
}

async function dismissOnboarding(page) {
  const present = await page.evaluate(() => /votre chantier|bienvenue|commencer|étape \d/i.test(document.body.textContent));
  if (present) {
    await shot(page, "00-onboarding");
    if (!await clickByText(page, /plus tard|passer|fermer|ignorer/)) { await page.keyboard.press("Escape"); }
    await wait(800);
  }
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars"],
  });

  // ── DESKTOP ──
  {
    const page = await browser.newPage();
    await page.setViewport(DESKTOP);
    await login(page);
    await dismissOnboarding(page);
    await wait(800);

    // Open a project (click the project card in the sidebar)
    await page.evaluate(() => {
      const cards = [...document.querySelectorAll("button, a, [role=button], div")];
      const c = cards.find(e => /\b1\s*PV\b|Esquisse|Permis|Exécution|Réception/i.test(e.textContent || "") && e.getBoundingClientRect().left < 270 && e.getBoundingClientRect().width < 270 && e.getBoundingClientRect().width > 120);
      if (c) c.click();
    });
    await wait(1200);
    await shot(page, "d-10-overview");
    await shot(page, "d-11-overview-full", { full: true, settle: 900 });

    // Enter NoteEditor via "Préparer le PV" / "Nouveau PV" CTA
    let inEditor = await clickByText(page, /préparer le pv|nouveau pv|reprendre le pv/i);
    if (inEditor) {
      await wait(2000);
      await shot(page, "d-20-noteeditor");
      await shot(page, "d-21-noteeditor-full", { full: true, settle: 900 });
      // back out
      if (!await clickAria(page, /retour|back|fermer/)) await page.keyboard.press("Escape");
      await wait(900);
    } else { console.log("  ⚠ could not enter NoteEditor"); }

    // Profile → Abonnement
    await clickAria(page, /mon profil|profil/);
    await page.evaluate(() => {
      const av = [...document.querySelectorAll("button")].find(b => b.getBoundingClientRect().bottom > window.innerHeight - 80 && b.getBoundingClientRect().left < 280);
      if (av) av.click();
    });
    await wait(1200);
    const onProfile = await page.evaluate(() => /mon profil|votre abonnement|abonnement/i.test(document.body.textContent));
    if (onProfile) {
      await shot(page, "d-30-profile");
      await clickByText(page, /^abonnement$/i);
      await wait(900);
      await shot(page, "d-31-profile-abonnement");
      await shot(page, "d-32-profile-full", { full: true, settle: 800 });
    } else { console.log("  ⚠ profile not opened"); }

    await page.close();
  }

  // ── MOBILE ──
  {
    const page = await browser.newPage();
    await page.setViewport(MOBILE);
    await page.setUserAgent(MOBILE_UA);
    await login(page);
    await dismissOnboarding(page);
    await wait(800);
    await shot(page, "m-10-home");

    // Tap center FAB "Visite" → Mode Chantier
    const fab = await clickAria(page, /démarrer une visite|reprendre la visite|visite chantier/);
    if (fab) {
      await wait(1600);
      await shot(page, "m-20-chantier-mode");
      await shot(page, "m-21-chantier-mode-full", { full: true, settle: 800 });
    } else { console.log("  ⚠ Visite FAB not found"); }

    // Back to home, open profile "Moi"
    await clickAria(page, /retour|back|fermer/);
    await wait(600);
    await page.evaluate(() => {
      const moi = [...document.querySelectorAll("button")].find(b => /moi/i.test(b.getAttribute("aria-label") || "") || /moi/i.test(b.textContent || ""));
      if (moi) moi.click();
    });
    await wait(1000);
    await shot(page, "m-30-profile-full", { full: true, settle: 700 });

    await page.close();
  }

  await browser.close();
  console.log("done");
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
