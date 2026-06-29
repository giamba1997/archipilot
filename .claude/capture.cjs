// One-off screenshot harness. Drives the local dev server with puppeteer-core
// pointed at the user's installed Chrome. Captures auth + onboarding states
// across desktop (1440x900) and mobile (iPhone 14 Pro: 390x844 @3x).
const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = path.join(__dirname, "screenshots");
const URL = process.env.URL || "http://localhost:3000/";

const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false };
const MOBILE = {
  width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  // iPhone 14 Pro UA so the page believes it's a real mobile and uses meta viewport correctly.
};
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function ensureDir() { if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true }); }

async function shot(page, name, opts = {}) {
  const file = path.join(OUT, `${name}.png`);
  await new Promise(r => setTimeout(r, opts.settle || 600));
  await page.screenshot({ path: file, fullPage: !!opts.full });
  console.log(`✓ ${name}.png  (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
}

(async () => {
  ensureDir();
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars"],
  });

  // ── Desktop ────────────────────────────────────────────────
  {
    const page = await browser.newPage();
    await page.setViewport(DESKTOP);
    await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
    await shot(page, "01-auth-desktop", { settle: 1200 });

    // Click "Créer un compte" → signup mode
    try {
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll("button, a")].find(el => /créer un compte/i.test(el.textContent));
        if (btn) btn.click();
      });
      await shot(page, "05-signup-desktop", { settle: 800 });
    } catch (e) { console.log("signup click failed:", e.message); }

    // Click "Mot de passe oublié ?"
    try {
      await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise(r => setTimeout(r, 1000));
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll("button, a")].find(el => /mot de passe oublié/i.test(el.textContent));
        if (btn) btn.click();
      });
      await shot(page, "06-forgot-desktop", { settle: 800 });
    } catch (e) { console.log("forgot click failed:", e.message); }

    // Legal pages: open via the "Politique de Confidentialité" / "Conditions d'Utilisation" buttons
    try {
      await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise(r => setTimeout(r, 1000));
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll("button, a")].find(el => /confidentialité/i.test(el.textContent));
        if (btn) btn.click();
      });
      await shot(page, "07-legal-privacy-desktop", { settle: 800, full: true });
    } catch (e) { console.log("privacy click failed:", e.message); }

    try {
      await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise(r => setTimeout(r, 1000));
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll("button, a")].find(el => /conditions/i.test(el.textContent));
        if (btn) btn.click();
      });
      await shot(page, "08-legal-terms-desktop", { settle: 800, full: true });
    } catch (e) { console.log("terms click failed:", e.message); }

    await page.close();
  }

  // ── Mobile (iPhone 14 Pro) ────────────────────────────────
  {
    const page = await browser.newPage();
    await page.setViewport(MOBILE);
    await page.setUserAgent(MOBILE_UA);
    await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
    await shot(page, "02-auth-mobile", { settle: 1200, full: true });

    try {
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll("button, a")].find(el => /créer un compte/i.test(el.textContent));
        if (btn) btn.click();
      });
      await shot(page, "09-signup-mobile", { settle: 800, full: true });
    } catch (e) { console.log("signup mobile click failed:", e.message); }

    await page.close();
  }

  await browser.close();
  console.log("done");
})().catch(e => { console.error(e); process.exit(1); });
