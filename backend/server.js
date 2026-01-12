import express from "express";
import cors from "cors";
import puppeteer from "puppeteer";

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/scrape", async (req, res) => {
  const { url, id } = req.body;
  if (!url || !id) return res.status(400).json({ error: "Missing url or id" });

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });

    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    const result = await page.evaluate((employeeId) => {
      let employeeRow = null;
      const trs = Array.from(document.querySelectorAll("tr"));
      for (const tr of trs) {
        const span = tr.querySelector("td span");
        if (!span) continue;
        const txt = span.textContent.trim();
        if (txt.startsWith(employeeId + " ")) {
          employeeRow = tr;
          break;
        }
      }
      if (!employeeRow) return { error: "Employee row not found" };

      const schedule = [];
      const tds = Array.from(employeeRow.querySelectorAll("td[id]"));
      for (const td of tds) {
        const cellId = td.getAttribute("id");
        if (!cellId || !cellId.includes("_")) continue;
        const date = cellId.split("_")[1];
        const shifts = Array.from(td.querySelectorAll("div b"))
          .map(b => b.textContent.trim())
          .filter(Boolean);
        if (shifts.length) schedule.push({ date, locations: shifts });
      }
      schedule.sort((a,b) => a.date.localeCompare(b.date));
      return { id: employeeId, schedule };
    }, id);

    await browser.close();
    if (result.error) return res.status(404).json(result);
    res.json(result);
  } catch (err) {
    if (browser) await browser.close();
    res.status(500).json({ error: err.message });
  }
});

app.get("/", (req,res)=>res.send("Backend OK"));
app.listen(3000, ()=>console.log("Backend running on http://localhost:3000"));