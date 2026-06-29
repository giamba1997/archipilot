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
  // Click "Nouveau PV" CTA on Overview
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("button, a, [role=button]")];
    const t = all.find(el => /nouveau pv/i.test(el.textContent));
    if (t) t.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  // Capture chooser screen with 3 options
  await page.screenshot({ path: path.join(__dirname, "screenshots", "freewrite-1-chooser.png") });
  console.log("✓ freewrite-1-chooser.png");

  // Click "Capture libre" card
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("button")];
    const t = all.find(b => /capture libre/i.test(b.textContent));
    if (t) t.click();
  });
  await new Promise(r => setTimeout(r, 800));
  // Click CTA "Commencer la capture"
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("button")];
    const t = all.find(b => /commencer la capture/i.test(b.textContent));
    if (t) t.click();
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "freewrite-2-textarea.png") });
  console.log("✓ freewrite-2-textarea.png");

  // Type some notes
  await page.evaluate(() => {
    const ta = document.querySelector("textarea");
    if (ta) ta.focus();
  });
  await page.keyboard.type("- Peinture rdc 1ère couche OK\n- Goulottes en cours\n- Resserrages coupe-feu pas faits — RETARD 5 jours\n- MO rappelle: gilet fluo obligatoire", { delay: 15 });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "freewrite-3-typed.png") });
  console.log("✓ freewrite-3-typed.png");

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
