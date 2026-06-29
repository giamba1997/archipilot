// Focused re-capture: clean NoteEditor flow (step0→step1→step2→ResultView),
// then ChatModal last so it doesn't overlay other shots. Desktop only.
const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = path.join(__dirname, "screenshots-review");
const BASE = process.env.URL || "http://localhost:3000/";
const EMAIL = process.env.AP_EMAIL, PASSWORD = process.env.AP_PASS;
if (!EMAIL || !PASSWORD) { console.error("env required"); process.exit(2); }
const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false };
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
async function shot(page, name, opts = {}) {
  const file = path.join(OUT, `${name}.png`); await wait(opts.settle || 700);
  try { await page.screenshot({ path: file, fullPage: !!opts.full }); console.log(`  ✓ ${name}.png`); }
  catch (e) { console.log(`  ! ${name}: ${e.message}`); }
}
async function clickByText(page, regex) {
  return page.evaluate((re) => {
    const rx = new RegExp(re, "i");
    const el = [...document.querySelectorAll("button, a, [role=button]")].find(e => rx.test((e.textContent||"").trim()));
    if (!el) return false; el.scrollIntoView({ block: "center" }); el.click(); return true;
  }, regex.source);
}
async function clickAria(page, regex) {
  return page.evaluate((re) => {
    const rx = new RegExp(re, "i");
    const el = [...document.querySelectorAll("button, a, [role=button]")].find(e => rx.test(e.getAttribute("aria-label")||"")||rx.test(e.title||""));
    if (!el) return false; el.scrollIntoView({ block: "center" }); el.click(); return true;
  }, regex.source);
}
async function login(page) {
  await page.goto(BASE, { waitUntil: "networkidle2", timeout: 30000 }); await wait(1800);
  await page.evaluate(() => { const i = [...document.querySelectorAll("input")].find(x => x.type==="email"||/email/i.test(x.placeholder||x.name||"")); if (i) i.focus(); });
  await page.keyboard.type(EMAIL, { delay: 20 }); await page.keyboard.press("Tab"); await wait(150);
  await page.evaluate(() => { const pw = [...document.querySelectorAll("input")].find(i => i.type==="password"); if (pw) pw.focus(); });
  await page.keyboard.type(PASSWORD, { delay: 20 }); await wait(200);
  await clickByText(page, /accéder à mes chantiers/);
  for (let i=0;i<30;i++){ await wait(500); if (await page.evaluate(()=>/préparer le pv|nouveau pv/i.test(document.body.textContent))) return; }
}
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: "new", args: ["--no-sandbox","--disable-setuid-sandbox","--hide-scrollbars","--use-fake-ui-for-media-stream"] });
  const page = await browser.newPage(); await page.setViewport(DESKTOP);
  await login(page); await wait(500);
  // open project
  await page.evaluate(() => { const c=[...document.querySelectorAll("button,a,[role=button],div")].find(e=>/Esquisse|Permis|Exécution|Réception|\bPV\b/i.test(e.textContent||"")&&e.getBoundingClientRect().left<280&&e.getBoundingClientRect().width<280&&e.getBoundingClientRect().width>110&&e.getBoundingClientRect().top>60); if(c)c.click(); });
  await wait(1200);
  // Enter NoteEditor
  await clickByText(page, /préparer le pv|nouveau pv|reprendre le pv/i); await wait(1800);
  // Choose manual structured → open posts
  await clickByText(page, /manuel structuré/i); await wait(300);
  await clickByText(page, /ouvrir les postes/i); await wait(1000);
  await shot(page, "d-22-step0-saisie", { full: true, settle: 800 });
  // open first post detail
  await page.evaluate(() => { const r=[...document.querySelectorAll("button,[role=button],div")].find(e=>/^\s*0?\d+\.\s/.test((e.textContent||""))&&e.getBoundingClientRect().width>300&&e.getBoundingClientRect().height<140); if(r)r.click(); });
  await wait(700); await shot(page, "d-23-post-detail", { settle: 600 });
  await clickAria(page, /retour|back/); await wait(600);
  // Step 1: Destinataires
  await clickAria(page, /Destinataires|Étape 2/); await wait(700);
  await shot(page, "d-24-step1-destinataires", { full: true, settle: 700 });
  // pick "Tous"
  await clickByText(page, /^tous$|tous les destinataires|tout le monde/i); await wait(500);
  await shot(page, "d-24b-step1-tous", { full: true, settle: 500 });
  // Step 2: Génération
  await clickByText(page, /^génération$/i); await wait(400);
  await clickAria(page, /Génération|Étape 3/); await wait(700);
  await shot(page, "d-25-step2-generation", { full: true, settle: 700 });
  // Generate → ResultView
  if (await clickByText(page, /générer le procès-verbal|générer le pv|générer$/i)) {
    await wait(5000); await shot(page, "d-26-result", { settle: 1500 });
    await shot(page, "d-27-result-full", { full: true, settle: 1000 });
  } else console.log("  ! generate not found");
  await browser.close(); console.log("done");
})().catch(e => { console.error("FAIL:", e.message); process.exit(1); });
