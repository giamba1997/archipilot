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

  // Open chat
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("button")];
    const t = all.find(b => /ouvrir l'assistant/i.test(b.getAttribute("aria-label") || ""));
    if (t) t.click();
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "chat-att-1-empty-with-paperclip.png") });
  console.log("✓ chat-att-1-empty-with-paperclip.png");

  // Upload via the file input directly (puppeteer can't drag/drop natively)
  const fileInput = await page.$("input[type=file]");
  if (fileInput) {
    // Use an existing PDF (the one user provided earlier)
    const pdfPath = "C:\\Users\\gaalo\\Downloads\\PV_1_test_1_05-05-2026.pdf";
    try {
      await fileInput.uploadFile(pdfPath);
      await new Promise(r => setTimeout(r, 2500));
      await page.screenshot({ path: path.join(__dirname, "screenshots", "chat-att-2-pdf-attached.png") });
      console.log("✓ chat-att-2-pdf-attached.png");

      // Type a question
      await page.evaluate(() => {
        const ta = document.querySelector("textarea");
        if (ta) ta.focus();
      });
      await page.keyboard.type("Que penses-tu de ce PV par rapport à mes autres projets ?", { delay: 15 });
      await new Promise(r => setTimeout(r, 400));
      await page.screenshot({ path: path.join(__dirname, "screenshots", "chat-att-3-question-typed.png") });
      console.log("✓ chat-att-3-question-typed.png");

      // Send
      await page.keyboard.press("Enter");
      await new Promise(r => setTimeout(r, 12000));
      await page.screenshot({ path: path.join(__dirname, "screenshots", "chat-att-4-response.png") });
      console.log("✓ chat-att-4-response.png");
    } catch (e) {
      console.log("PDF upload failed:", e.message);
    }
  }

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
