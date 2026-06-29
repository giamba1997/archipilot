// Full design-review capture pass — desktop + mobile.
// Reuses the login flow of capture-auth.cjs and drills the complete journey:
//   auth, overview (phase hero/tabs/tools), NoteEditor (chooser→step0→step1→step2),
//   ResultView, Profile (full), Sidebar, ChatModal, mobile (home/bottombar/chantier/notifs).
// READ-ONLY review: writes screenshots only. No app-code changes.
const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = path.join(__dirname, "screenshots-review");
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
  try { await page.screenshot({ path: file, fullPage: !!opts.full }); }
  catch (e) { console.log(`  ! shot ${name} failed: ${e.message}`); return; }
  console.log(`  ✓ ${name}.png  (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
}

async function clickByText(page, regex) {
  return page.evaluate((re) => {
    const rx = new RegExp(re, "i");
    const all = [...document.querySelectorAll("button, a, [role=button]")];
    const el = all.find(e => rx.test((e.textContent || "").trim()));
    if (!el) return false;
    el.scrollIntoView({ block: "center" }); el.click(); return true;
  }, regex.source);
}
async function clickAria(page, regex) {
  return page.evaluate((re) => {
    const rx = new RegExp(re, "i");
    const all = [...document.querySelectorAll("button, a, [role=button]")];
    const el = all.find(e => rx.test(e.getAttribute("aria-label") || "") || rx.test(e.title || ""));
    if (!el) return false;
    el.scrollIntoView({ block: "center" }); el.click(); return true;
  }, regex.source);
}

async function login(page) {
  console.log("→ logging in...");
  await page.goto(BASE, { waitUntil: "networkidle2", timeout: 30000 });
  await wait(1800);
  await page.evaluate(() => {
    const i = [...document.querySelectorAll("input")].find(x => x.type === "email" || /email/i.test(x.placeholder || x.name || ""));
    if (i) i.focus();
  });
  await page.keyboard.type(EMAIL, { delay: 20 });
  await page.keyboard.press("Tab"); await wait(150);
  await page.evaluate(() => { const pw = [...document.querySelectorAll("input")].find(i => i.type === "password"); if (pw) pw.focus(); });
  await page.keyboard.type(PASSWORD, { delay: 20 }); await wait(200);
  await clickByText(page, /accéder à mes chantiers|se connecter$|^connexion$/);
  for (let i = 0; i < 30; i++) {
    await wait(500);
    const ready = await page.evaluate(() => /nouveau projet|nouveau pv|tout est calme|mes chantiers|préparer le pv/i.test(document.body.textContent));
    if (ready) { console.log(`  authed after ${(i+1)*500}ms`); return true; }
  }
  console.log("  ⚠ auth timeout"); return false;
}

async function dismissOnboarding(page, prefix) {
  const present = await page.evaluate(() => /votre chantier|bienvenue|commencer|étape \d/i.test(document.body.textContent));
  if (present) {
    await shot(page, `${prefix}-00-onboarding`);
    if (!await clickByText(page, /plus tard|passer|fermer|ignorer/)) await page.keyboard.press("Escape");
    await wait(800);
  }
}

async function ensureProjectOpen(page) {
  // If on a list, open first project. If "Nouveau projet" only (no project), create one.
  const opened = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("button, a, [role=button], div")];
    const c = cards.find(e => /Esquisse|Permis|Exécution|Réception|Avant-projet|\bPV\b/i.test(e.textContent || "")
      && e.getBoundingClientRect().left < 280 && e.getBoundingClientRect().width < 280 && e.getBoundingClientRect().width > 110 && e.getBoundingClientRect().top > 60);
    if (c) { c.click(); return true; }
    return false;
  });
  await wait(1200);
  return opened;
}

async function desktopTour(browser) {
  const page = await browser.newPage();
  await page.setViewport(DESKTOP);
  await page.goto(BASE, { waitUntil: "networkidle2", timeout: 30000 });
  await wait(1200);
  await shot(page, "d-01-auth");                       // auth screen (pre-login)
  await login(page);
  await dismissOnboarding(page, "d");
  await wait(600);

  await ensureProjectOpen(page);
  await shot(page, "d-10-overview");
  await shot(page, "d-11-overview-full", { full: true, settle: 900 });

  // Sidebar is always visible on desktop — captured within overview. Capture profile.
  // ChatModal — open the floating launcher
  if (await clickAria(page, /ouvrir l'assistant|assistant/)) {
    await wait(1200);
    await shot(page, "d-15-chat-open");
    await shot(page, "d-16-chat-full", { full: true, settle: 600 });
    await clickAria(page, /fermer l'assistant|fermer/); await page.keyboard.press("Escape"); await wait(500);
  } else { console.log("  ! chat launcher not found"); }

  // NoteEditor — enter via overview CTA
  if (await clickByText(page, /préparer le pv|nouveau pv|reprendre le pv|rédiger le pv/i)) {
    await wait(1800);
    await shot(page, "d-20-noteeditor-chooser");        // method chooser
    await shot(page, "d-21-noteeditor-chooser-full", { full: true, settle: 700 });
    // Select "Manuel structuré" then start → step 0 post list
    await clickByText(page, /manuel structuré/i); await wait(300);
    await clickByText(page, /commencer la saisie|commencer$|^commencer/i); await wait(900);
    await shot(page, "d-22-step0-saisie", { full: true, settle: 700 });
    // Open a post to show the remark editor (step 0 detail)
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll("button, [role=button], div")];
      const r = rows.find(e => /^\s*\d+\.\s/.test((e.textContent || "")) && e.getBoundingClientRect().width > 300);
      if (r) r.click();
    });
    await wait(700);
    await shot(page, "d-23-post-detail", { settle: 600 });
    await clickAria(page, /retour|back/); await wait(500);
    // Step 1 — Destinataires (click stepper)
    if (await clickAria(page, /Étape 2 sur 3|Destinataires/)) { await wait(700); await shot(page, "d-24-step1-destinataires", { full: true, settle: 600 }); }
    // Step 2 — Génération
    if (await clickAria(page, /Étape 3 sur 3|Génération/)) { await wait(700); await shot(page, "d-25-step2-generation", { full: true, settle: 600 }); }
    // Try to generate the PV → ResultView
    if (await clickByText(page, /générer le pv|générer$|créer le pv/i)) {
      await wait(4000);
      await shot(page, "d-26-result", { settle: 1200 });
      await shot(page, "d-27-result-full", { full: true, settle: 900 });
    } else { console.log("  ! generate CTA not found"); }
    // back out to overview
    await clickAria(page, /retour|back|fermer/); await page.keyboard.press("Escape"); await wait(800);
  } else { console.log("  ! could not enter NoteEditor"); }

  // Profile (full) — open via avatar at bottom of sidebar
  await page.evaluate(() => {
    const av = [...document.querySelectorAll("button")].find(b => b.getBoundingClientRect().bottom > window.innerHeight - 90 && b.getBoundingClientRect().left < 280);
    if (av) av.click();
  });
  await wait(1200);
  const onProfile = await page.evaluate(() => /mon profil|abonnement|votre abonnement|préférences/i.test(document.body.textContent));
  if (onProfile) {
    await shot(page, "d-30-profile");
    await shot(page, "d-31-profile-full", { full: true, settle: 900 });
    if (await clickByText(page, /^abonnement$/i)) { await wait(800); await shot(page, "d-32-abonnement-full", { full: true, settle: 700 }); }
  } else { console.log("  ! profile not opened"); }

  await page.close();
}

async function mobileTour(browser) {
  const page = await browser.newPage();
  await page.setViewport(MOBILE);
  await page.setUserAgent(MOBILE_UA);
  await page.goto(BASE, { waitUntil: "networkidle2", timeout: 30000 });
  await wait(1200);
  await shot(page, "m-01-auth");
  await login(page);
  await dismissOnboarding(page, "m");
  await wait(600);
  await shot(page, "m-10-home");
  await shot(page, "m-11-home-full", { full: true, settle: 800 });

  // Bottom bar exploration: tap each item by aria/text
  for (const [label, name] of [[/projets|chantiers/i, "projets"], [/notif/i, "notifs"], [/moi|profil/i, "profil"]]) {
    const tapped = await page.evaluate((re) => {
      const rx = new RegExp(re, "i");
      const bars = [...document.querySelectorAll("button, a, [role=button]")].filter(b => b.getBoundingClientRect().bottom > window.innerHeight - 90);
      const el = bars.find(b => rx.test(b.getAttribute("aria-label") || "") || rx.test(b.textContent || ""));
      if (el) { el.click(); return true; } return false;
    }, label.source);
    if (tapped) { await wait(1000); await shot(page, `m-12-bottombar-${name}`, { full: true, settle: 700 }); }
  }

  // Back home, open a project
  await page.evaluate(() => { const b = [...document.querySelectorAll("button,a")].find(x => /accueil|home|projets|chantiers/i.test(x.getAttribute("aria-label")||x.textContent||"") && x.getBoundingClientRect().bottom > window.innerHeight - 90); if (b) b.click(); });
  await wait(900);
  await ensureProjectOpen(page);
  await shot(page, "m-20-project-overview", { full: true, settle: 800 });

  // Mode Chantier / Visite — center FAB
  const fab = await clickAria(page, /démarrer une visite|reprendre la visite|visite|mode chantier/);
  if (fab) {
    await wait(1600);
    await shot(page, "m-30-chantier-mode");
    await shot(page, "m-31-chantier-mode-full", { full: true, settle: 800 });
    await clickAria(page, /retour|back|fermer/); await wait(600);
  } else { console.log("  ! Visite FAB not found"); }

  // NoteEditor on mobile (chooser + step0)
  await ensureProjectOpen(page);
  if (await clickByText(page, /préparer le pv|nouveau pv|reprendre le pv/i)) {
    await wait(1600);
    await shot(page, "m-40-noteeditor-chooser", { settle: 700 });
    await clickByText(page, /manuel structuré/i); await wait(300);
    await clickByText(page, /commencer la saisie|^commencer/i); await wait(800);
    await shot(page, "m-41-step0", { full: true, settle: 700 });
  }

  await page.close();
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars", "--use-fake-ui-for-media-stream"],
  });
  try { await desktopTour(browser); } catch (e) { console.error("desktop FAIL:", e.message); }
  try { await mobileTour(browser); } catch (e) { console.error("mobile FAIL:", e.message); }
  await browser.close();
  console.log("done");
})().catch(e => { console.error("FATAL:", e); process.exit(1); });
