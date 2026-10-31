
const { chromium } = require("../../desktop/node_modules/@playwright/test");
const out = (process.env.SHOTS_DIR || "shots") + "/";
require("fs").mkdirSync(out, { recursive: true });
const pages = JSON.parse(process.argv[2] || "[]"); // [{name,url,action?}]
const only = process.argv[3]; // optional: "desktop-light" etc
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  for (const [vp, w, h, dpr] of [["desktop", 1440, 900, 1], ["phone", 390, 844, 2]]) {
    for (const mode of ["light", "dark"]) {
      if (only && only !== `${vp}-${mode}`) continue;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, colorScheme: mode, isMobile: vp === "phone", hasTouch: vp === "phone" });
      await ctx.addInitScript((m) => { try { localStorage.setItem("rw_theme_mode", m); } catch {} }, mode);
      const page = await ctx.newPage();
      await page.goto("http://localhost:4200/auth/login");
      await page.getByLabel("Username").fill("admin");
      await page.getByLabel("Password").fill("admin");
      await page.getByRole("button", { name: /login/i }).click();
      await page.waitForURL(/overview|receipts/, { timeout: 20000 });
      for (const p of pages) {
        await page.goto("http://localhost:4200" + p.url);
        await page.waitForTimeout(p.wait ?? 3000);
        if (p.click) { await page.getByRole("button", { name: p.click }).first().click(); await page.waitForTimeout(1500); }
        if (p.scrollText) { await page.getByText(p.scrollText, { exact: false }).first().evaluate((el) => el.scrollIntoView({ block: "start" })); await page.waitForTimeout(1200); } if (p.scrollY) { await page.evaluate((y) => { const s = document.scrollingElement; s.scrollTop = y; document.querySelectorAll("*").forEach((e) => { if (e.scrollHeight > e.clientHeight + 50 && getComputedStyle(e).overflowY !== "visible" && e !== s) e.scrollTop = y; }); }, p.scrollY); await page.waitForTimeout(1200); }
        await page.screenshot({ path: `${out}${p.name}-${vp}-${mode}.png`, fullPage: !!p.full });
      }
      await ctx.close();
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
