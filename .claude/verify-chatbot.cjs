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

  // 1. Capture overview with floating chat button
  await page.screenshot({ path: path.join(__dirname, "screenshots", "chat-1-launcher.png") });
  console.log("✓ chat-1-launcher.png");

  // 2. Click the floating button
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("button")];
    const t = all.find(b => /ouvrir l'assistant/i.test(b.getAttribute("aria-label") || ""));
    if (t) t.click();
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "chat-2-empty-state.png") });
  console.log("✓ chat-2-empty-state.png");

  // 3. Click on a starter suggestion
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("button")];
    const t = all.find(b => /pv à finaliser/i.test(b.textContent));
    if (t) t.click();
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "chat-3-thinking.png") });
  console.log("✓ chat-3-thinking.png");

  // 4. Wait for AI response
  await new Promise(r => setTimeout(r, 8000));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "chat-4-response.png") });
  console.log("✓ chat-4-response.png");

  // 5. Type follow-up
  await page.evaluate(() => {
    const ta = document.querySelector("textarea");
    if (ta) ta.focus();
  });
  await page.keyboard.type("Et combien j'ai d'urgences en ce moment ?", { delay: 20 });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "chat-5-followup-typed.png") });
  console.log("✓ chat-5-followup-typed.png");

  // 6. Send and wait
  await page.keyboard.press("Enter");
  await new Promise(r => setTimeout(r, 8000));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "chat-6-followup-response.png") });
  console.log("✓ chat-6-followup-response.png");

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
