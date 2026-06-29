// Final clean pass: step0→step1(destinataires)→step2(generation)→ResultView.
const puppeteer = require("puppeteer-core"); const path = require("path"); const fs = require("fs");
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = path.join(__dirname, "screenshots-review");
const BASE = "http://localhost:3000/"; const EMAIL = process.env.AP_EMAIL, PASSWORD = process.env.AP_PASS;
const wait = ms => new Promise(r => setTimeout(r, ms));
async function shot(page, name, opts = {}) { const f = path.join(OUT, `${name}.png`); await wait(opts.settle||700); try { await page.screenshot({ path: f, fullPage: !!opts.full }); console.log(`  ✓ ${name}`);} catch(e){console.log(`  ! ${name}: ${e.message}`);} }
async function clickByText(page, re) { return page.evaluate((r) => { const rx = new RegExp(r,"i"); const el=[...document.querySelectorAll("button,a,[role=button]")].find(e=>rx.test((e.textContent||"").trim())); if(!el)return false; el.scrollIntoView({block:"center"}); el.click(); return true; }, re.source); }
async function login(page){ await page.goto(BASE,{waitUntil:"networkidle2",timeout:30000}); await wait(1800); await page.evaluate(()=>{const i=[...document.querySelectorAll("input")].find(x=>x.type==="email");if(i)i.focus();}); await page.keyboard.type(EMAIL,{delay:20}); await page.keyboard.press("Tab"); await wait(150); await page.evaluate(()=>{const pw=[...document.querySelectorAll("input")].find(i=>i.type==="password");if(pw)pw.focus();}); await page.keyboard.type(PASSWORD,{delay:20}); await wait(200); await clickByText(page,/accéder à mes chantiers/); for(let i=0;i<30;i++){await wait(500);if(await page.evaluate(()=>/préparer le pv|nouveau pv/i.test(document.body.textContent)))return;} }
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless:"new", args:["--no-sandbox","--disable-setuid-sandbox","--hide-scrollbars","--use-fake-ui-for-media-stream"] });
  const page = await browser.newPage(); await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
  await login(page); await wait(500);
  await page.evaluate(()=>{const c=[...document.querySelectorAll("button,a,[role=button],div")].find(e=>/Esquisse|\bPV\b/i.test(e.textContent||"")&&e.getBoundingClientRect().left<280&&e.getBoundingClientRect().width<280&&e.getBoundingClientRect().width>110&&e.getBoundingClientRect().top>60);if(c)c.click();}); await wait(1200);
  await clickByText(page,/préparer le pv|nouveau pv|reprendre le pv/i); await wait(1800);
  await clickByText(page,/manuel structuré/i); await wait(300);
  await clickByText(page,/ouvrir les postes/i); await wait(1000);
  // Step 1 via bottom CTA "Destinataires"
  await clickByText(page,/^destinataires$/i); await wait(800);
  await shot(page,"d-24-step1-destinataires",{full:true,settle:700});
  // pick "Tous les destinataires"
  await page.evaluate(()=>{const el=[...document.querySelectorAll("button")].find(b=>/^tous les destinataires$|^tous$/i.test((b.textContent||"").trim()));if(el)el.click();}); await wait(500);
  // Step 2 via bottom CTA "Génération"
  await clickByText(page,/^génération$/i); await wait(800);
  await shot(page,"d-25-step2-generation",{full:true,settle:700});
  // Generate
  if (await clickByText(page,/générer le procès-verbal|générer le pv/i)) { await wait(6000); await shot(page,"d-26-result",{settle:1500}); await shot(page,"d-27-result-full",{full:true,settle:1200}); }
  else console.log("  ! generate CTA not found");
  await browser.close(); console.log("done");
})().catch(e=>{console.error("FAIL:",e.message);process.exit(1);});
