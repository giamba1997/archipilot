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
  // 1. State idle on a project (TimerPill compact in header)
  await page.screenshot({ path: path.join(__dirname, "screenshots", "v2-1-pill-idle.png") });
  console.log("✓ v2-1-pill-idle.png");

  // 2. Click "Suivi" to start
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("button")];
    const t = all.find(b => /^suivi$/i.test(b.textContent.trim()));
    if (t) t.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "v2-2-pill-running.png") });
  console.log("✓ v2-2-pill-running.png");

  // 3. Wait 4 seconds, screenshot to show counter advancing
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "v2-3-pill-running-4s.png") });
  console.log("✓ v2-3-pill-running-4s.png");

  // 4. Navigate to Vue d'ensemble (other view) — banner should appear
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("button")];
    const t = all.find(b => /vue d'ensemble/i.test(b.textContent) && !b.textContent.match(/sessions/i));
    if (t) t.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "v2-4-banner-thin.png") });
  console.log("✓ v2-4-banner-thin.png");

  // 5. Click "Temps" tab in Vue d'ensemble
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("button")];
    const t = all.find(b => /^temps$/i.test(b.textContent.trim()));
    if (t) t.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "v2-5-timesheet.png") });
  console.log("✓ v2-5-timesheet.png");

  // 6. Click on the timer chrono to go back to project + open Sessions
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("button.sb-project")];
    if (all[0]) all[0].click();
  });
  await new Promise(r => setTimeout(r, 1200));
  // Click on the chrono in the pill (it's the inner button with timer text)
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")].filter(b => /^\d{2}:\d{2}:\d{2}$/.test(b.textContent.trim()));
    if (buttons[0]) buttons[0].click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "v2-6-sessions-modal.png") });
  console.log("✓ v2-6-sessions-modal.png");

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
