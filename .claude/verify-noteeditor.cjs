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
  // Click "Nouveau PV" CTA
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("button, a, [role=button]")];
    const t = all.find(el => /nouveau pv/i.test(el.textContent));
    if (t) t.click();
  });
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "uniform-noteeditor.png") });
  console.log("✓ uniform-noteeditor.png");
  // Profile
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("button, a")];
    const t = all.find(b => /mon profil/i.test(b.getAttribute("aria-label") || "") || b.title === "Mon profil");
    if (t) t.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "uniform-profile.png") });
  console.log("✓ uniform-profile.png");
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
