const puppeteer = require("puppeteer-core");
const path = require("path");
(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--hide-scrollbars"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 1800));
  await page.evaluate(() => { const e = [...document.querySelectorAll("input")].find(i => i.type === "email"); e?.focus(); });
  await page.keyboard.type(process.env.AP_EMAIL, { delay: 25 });
  await page.keyboard.press("Tab");
  await page.evaluate(() => { const p = [...document.querySelectorAll("input")].find(i => i.type === "password"); p?.focus(); });
  await page.keyboard.type(process.env.AP_PASS, { delay: 25 });
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /accéder à mes chantiers/i.test(x.textContent)); b?.click(); });
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const ok = await page.evaluate(() => /nouveau projet|nouveau pv/i.test(document.body.textContent));
    if (ok) break;
  }
  await new Promise(r => setTimeout(r, 1500));

  // 1. Idle — Pas de pill dans le header (validation)
  await page.screenshot({ path: path.join(__dirname, "screenshots", "v3-1-no-pill-header.png") });
  console.log("✓ v3-1-no-pill-header.png");

  // 2. Click "Démarrer le suivi" sur la card
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("button")];
    const t = all.find(b => /démarrer le suivi/i.test(b.textContent));
    if (t) t.click();
  });
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "v3-2-card-running.png") });
  console.log("✓ v3-2-card-running.png");

  // 3. Click "Arrêter" sur la card
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("button")].filter(b => /arrêter/i.test(b.textContent));
    if (all[0]) all[0].click();
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "v3-3-stop-prompt.png") });
  console.log("✓ v3-3-stop-prompt.png");

  // 4. Type a description
  await page.evaluate(() => {
    const ta = document.querySelector("#session-note");
    if (ta) ta.focus();
  });
  await page.keyboard.type("Plans niveau 2 — façade nord", { delay: 30 });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "v3-4-prompt-filled.png") });
  console.log("✓ v3-4-prompt-filled.png");

  // 5. Confirm
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("button")];
    const t = all.find(b => /enregistrer la session/i.test(b.textContent));
    if (t) t.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "v3-5-after-save.png") });
  console.log("✓ v3-5-after-save.png");

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
