import express from "express";
import cors from "cors";
import puppeteer from "puppeteer";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

// Launch browser ONCE (better performance)
let browser;

(async () => {
  browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  console.log("✅ Puppeteer browser launched");
})();

// ---------------------------
// Scrape Route
// ---------------------------
app.post("/api/scrape", async (req, res) => {
  const { url, id } = req.body;

  if (!url || !id) {
    return res.status(400).json({ error: "Missing url or id" });
  }

  let page;

  try {
    page = await browser.newPage();

    console.log("🌍 Loading page:", url);

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    // Wait for rows to load
    await page.waitForSelector("tr", { timeout: 30000 });

    const schedule = await page.evaluate((employeeId) => {
      const rows = Array.from(document.querySelectorAll("tr"));
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

      if (!employeeRow) {
        return { error: "Employee not found" };
      }

      const cells = Array.from(employeeRow.querySelectorAll("td"));
      const schedule = [];

      for (const cell of cells) {
        const cellId = cell.getAttribute("id");
        if (!cellId || !cellId.includes("_")) continue;

        const date = cellId.split("_")[1];
        const shifts = cell.innerText
          .split("\n")
          .map(s => s.trim())
          .filter(Boolean);

        if (shifts.length > 0) {
          schedule.push({ date, shifts });
        }
      }

      schedule.sort((a, b) => new Date(a.date) - new Date(b.date));

      return { schedule };
    }, id);

    if (schedule.error) {
      return res.status(404).json({ error: schedule.error });
    }

    res.json(schedule);

  } catch (err) {
    console.error("❌ Scrape error:", err);
    res.status(500).json({ error: "Failed to scrape schedule" });
  } finally {
    if (page) await page.close();
  }
});

// ---------------------------
// Start Server
// ---------------------------
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});