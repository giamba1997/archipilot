const puppeteer = require("puppeteer-core");
(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--hide-scrollbars"],
  });
  const page = await browser.newPage();
  const errors = [];
  const pageErrors = [];
  page.on("console", msg => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", err => pageErrors.push(err.message));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle2", timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));

  const bodyLen = await page.evaluate(() => document.body.innerText.length);
  const rootChildren = await page.evaluate(() => document.getElementById("root")?.childElementCount || 0);
  const title = await page.title();

  console.log("title:", title);
  console.log("body innerText length:", bodyLen);
  console.log("#root children:", rootChildren);
  console.log("console errors:", errors.length);
  errors.forEach(e => console.log("  ERR:", e));
  console.log("page errors:", pageErrors.length);
  pageErrors.forEach(e => console.log("  PAGEERR:", e));

  await browser.close();
  process.exit(pageErrors.length > 0 || rootChildren === 0 ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
