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

  // 1. Idle state
  await page.screenshot({ path: path.join(__dirname, "screenshots", "timer-1-idle.png") });
  console.log("✓ timer-1-idle.png");

  // 2. Click "Démarrer le suivi"
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => /démarrer le suivi/i.test(x.textContent));
    if (b) b.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "timer-2-running.png") });
  console.log("✓ timer-2-running.png");

  // 3. Wait 3 seconds, capture again to show counter advancing
  await new Promise(r => setTimeout(r, 3500));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "timer-3-running-3s.png") });
  console.log("✓ timer-3-running-3s.png");

  // 4. Click Pause
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")].filter(x => /^pause$/i.test(x.textContent.trim()));
    if (buttons.length) buttons[0].click();
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "timer-4-paused.png") });
  console.log("✓ timer-4-paused.png");

  // 5. Navigate to "Vue d'ensemble" (deep view) — banner should stay
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("button")];
    const t = all.find(b => /vue d'ensemble/i.test(b.textContent) && !b.textContent.match(/sessions/i));
    if (t) t.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "timer-5-banner-other-view.png") });
  console.log("✓ timer-5-banner-other-view.png");

  // 6. Back to project, open Sessions modal
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("button.sb-project")];
    if (all[0]) all[0].click();
  });
  await new Promise(r => setTimeout(r, 1200));
  // Stop the timer first
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")].filter(x => /arrêter/i.test(x.textContent));
    if (buttons.length) buttons[0].click();
  });
  await new Promise(r => setTimeout(r, 1200));
  // Click on "Sessions"
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("button")];
    const t = all.find(b => /^sessions/i.test(b.textContent.trim()));
    if (t) t.click();
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "timer-6-sessions-modal.png") });
  console.log("✓ timer-6-sessions-modal.png");

  // 7. Click "Ajouter du temps" to show form
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("button")];
    const t = all.find(b => /ajouter du temps/i.test(b.textContent));
    if (t) t.click();
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "timer-7-add-form.png") });
  console.log("✓ timer-7-add-form.png");

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
