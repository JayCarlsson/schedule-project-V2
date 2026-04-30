import express from "express";
import cors from "cors";
import puppeteer from "puppeteer";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

let browser;

(async () => {
  browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  console.log("✅ Puppeteer browser launched");
})();

app.post("/api/scrape", async (req, res) => {
  const { url, id } = req.body;

  if (!url || !id) {
    return res.status(400).json({ error: "Missing url or id" });
  }

  let page;

  try {
    page = await browser.newPage();
    console.log("🌍 Loading page:", url);

    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector("tr", { timeout: 30000 });

    const result = await page.evaluate((employeeId) => {
      const rows = Array.from(document.querySelectorAll("tr"));

      // ── Find employee row ──────────────────────────────────────────────
      let employeeRow = null;
      for (const tr of rows) {
        const firstCell = tr.querySelector("td");
        if (!firstCell) continue;
        const txt = firstCell.innerText.trim();
        const match = txt.match(/^(\d+)\s+/);
        if (match && match[1] === employeeId) {
          employeeRow = tr;
          break;
        }
      }

      if (!employeeRow) return { error: "Employee not found" };

      // ── Extract schedule ───────────────────────────────────────────────
      const cells = Array.from(employeeRow.querySelectorAll("td"));
      const schedule = [];

      for (const cell of cells) {
        const cellId = cell.getAttribute("id");
        if (!cellId || !cellId.includes("_")) continue;
        const date = cellId.split("_")[1];
        const shifts = cell.innerText.split("\n").map(s => s.trim()).filter(Boolean);
        if (shifts.length > 0) schedule.push({ date, shifts });
      }

      schedule.sort((a, b) => new Date(a.date) - new Date(b.date));

      // ── Extract shift legend from the bottom table ─────────────────────
      // Legend rows have 2-3 cells: [full name:] [CODE] [optional times]
      const legend = {};

      for (const tr of rows) {
        const tds = Array.from(tr.querySelectorAll("td"));
        if (tds.length < 2 || tds.length > 3) continue;

        const rawName = tds[0].innerText.trim();
        const code    = tds[1].innerText.trim();
        const times   = tds.length === 3 ? tds[2].innerText.trim() : "";

        // Must look like a legend row: name ends with ":" and code is short
        if (!rawName.endsWith(":")) continue;
        if (code.length < 1 || code.length > 6) continue;
        if (!/^[A-ZÅÄÖa-zåäö0-9]+$/.test(code)) continue;

        const name = rawName.replace(/:$/, "").trim();
        if (!legend[code]) legend[code] = [];
        legend[code].push({ name, times });
      }

      return { schedule, legend };
    }, id);

    if (result.error) {
      return res.status(404).json({ error: result.error });
    }

    res.json(result);

  } catch (err) {
    console.error("❌ Scrape error:", err);
    res.status(500).json({ error: "Failed to scrape schedule" });
  } finally {
    if (page) await page.close();
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
