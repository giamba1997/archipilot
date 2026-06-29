// Login + inject mock project data via setProjects to display the rich header.
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

  // Inject rich data for the active project (in-memory only — won't persist
  // since saveProjects only triggers via setProjects after re-render in real use).
  // We patch localStorage to ensure the next render picks it up.
  await page.evaluate(() => {
    // Use the React DevTools-like approach: dispatch a custom event the app would react to.
    // Simpler: patch localStorage cache and reload.
    const projectsKeys = Object.keys(localStorage).filter(k => k.startsWith("archipilot_projects:"));
    for (const k of projectsKeys) {
      try {
        const data = JSON.parse(localStorage.getItem(k));
        if (data?.projects && data.projects.length > 0) {
          // Enrich the first project
          const p = data.projects[0];
          p.client = "SNCB sa";
          p.contractor = "LAURENTY";
          p.city = "Schaerbeek, Bruxelles";
          p.startDate = "25/09/2025";
          p.endDate = "28/09/2026";
          // Set meeting in the past (25 days ago)
          const past = new Date(); past.setDate(past.getDate() - 25);
          p.nextMeeting = `${String(past.getDate()).padStart(2,"0")}/${String(past.getMonth()+1).padStart(2,"0")}/${past.getFullYear()}`;
          // Add 2 urgent actions
          p.actions = [
            { id: 1, text: "Resserrages coupe-feu non finalisés", who: "MO", since: "2 sem.", urgent: true, open: true },
            { id: 2, text: "Plans EI 30 manquants", who: "Entr.", since: "1 sem.", urgent: true, open: true },
            { id: 3, text: "Confirmer commande radiateur", who: "MO", since: "3j", urgent: false, open: true },
          ];
          localStorage.setItem(k, JSON.stringify(data));
        }
      } catch {}
    }
  });
  await page.reload({ waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 2500));
  // Click on the first project in sidebar to ensure we are on Overview
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("button.sb-project")];
    if (all[0]) all[0].click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(__dirname, "screenshots", "header-rich.png") });
  console.log("✓ header-rich.png");
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
