const loadBtn = document.getElementById("loadBtn");
const loading = document.getElementById("loading");
const errorMsg = document.getElementById("error-msg");
const scheduleSection = document.getElementById("schedule-section");
const calendarContainer = document.getElementById("calendar");
const dailyContainer = document.getElementById("daily");
const calBtn = document.getElementById("calBtn");
const dayBtn = document.getElementById("dayBtn");
const tooltip = document.getElementById("tooltip");

// ── View toggle ─────────────────────────────────────────────
calBtn.addEventListener("click", () => switchView("calendar"));
dayBtn.addEventListener("click", () => switchView("daily"));

function switchView(view) {
  if (view === "calendar") {
    calBtn.classList.add("active");
    calBtn.setAttribute("aria-pressed", "true");
    dayBtn.classList.remove("active");
    dayBtn.setAttribute("aria-pressed", "false");
    calendarContainer.classList.remove("hidden");
    dailyContainer.classList.add("hidden");
  } else {
    dayBtn.classList.add("active");
    dayBtn.setAttribute("aria-pressed", "true");
    calBtn.classList.remove("active");
    calBtn.setAttribute("aria-pressed", "false");
    dailyContainer.classList.remove("hidden");
    calendarContainer.classList.add("hidden");
  }
}

// ── Load schedule ────────────────────────────────────────────
loadBtn.addEventListener("click", async () => {
  const url = document.getElementById("url").value.trim();
  const id  = document.getElementById("id").value.trim();

  if (!url || !id) {
    showError("Please enter both a schedule URL and your Employee ID.");
    return;
  }

  hideError();
  loading.classList.remove("hidden");
  scheduleSection.classList.add("hidden");
  calendarContainer.innerHTML = "";
  dailyContainer.innerHTML = "";

  try {
    const response = await fetch("http://localhost:3000/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, id })
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.error || "Server returned an error.");
    }

    renderCalendar(data.schedule);
    renderDaily(data.schedule);
    scheduleSection.classList.remove("hidden");

  } catch (err) {
    showError("Could not load schedule: " + err.message);
  } finally {
    loading.classList.add("hidden");
  }
});

// ── Calendar view ────────────────────────────────────────────
const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];
const DAY_NAMES   = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function renderCalendar(schedule) {
  if (!schedule || schedule.length === 0) {
    calendarContainer.innerHTML = "<p class='empty-state'>No shifts found for this employee.</p>";
    return;
  }

  // Build shift map: "YYYY-MM-DD" → [shifts]
  const shiftMap = {};
  schedule.forEach(e => { shiftMap[e.date] = e.shifts; });

  // Group entries by year+month
  const monthGroups = {};
  schedule.forEach(e => {
    const d = new Date(e.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!monthGroups[key]) monthGroups[key] = { year: d.getFullYear(), month: d.getMonth() };
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  Object.values(monthGroups).forEach(({ year, month }) => {
    const firstDay   = new Date(year, month, 1);
    const lastDay    = new Date(year, month + 1, 0);
    const jsFirstDay = firstDay.getDay(); // 0=Sun
    // Convert to Monday-first offset
    const startOffset = jsFirstDay === 0 ? 6 : jsFirstDay - 1;

    // Month header
    const monthHeader = document.createElement("div");
    monthHeader.className = "month-header";
    monthHeader.textContent = `${MONTH_NAMES[month]} ${year}`;
    calendarContainer.appendChild(monthHeader);

    // Day name row
    const nameRow = document.createElement("div");
    nameRow.className = "cal-day-names";
    DAY_NAMES.forEach(n => {
      const s = document.createElement("span");
      s.textContent = n;
      nameRow.appendChild(s);
    });
    calendarContainer.appendChild(nameRow);

    // Grid
    const grid = document.createElement("div");
    grid.className = "cal-grid";

    // Leading empty cells
    for (let i = 0; i < startOffset; i++) {
      const empty = document.createElement("div");
      empty.className = "cal-cell empty";
      grid.appendChild(empty);
    }

    // Day cells
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateObj = new Date(year, month, d);
      const dateStr = toDateStr(dateObj);
      const shifts  = shiftMap[dateStr];
      const isToday = dateObj.getTime() === today.getTime();
      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

      const cell = document.createElement("div");
      cell.className = "cal-cell" +
        (shifts  ? " has-shift"  : "") +
        (isToday ? " today"      : "") +
        (isWeekend ? " weekend"  : "");

      const num = document.createElement("span");
      num.className = "cal-num";
      num.textContent = d;
      cell.appendChild(num);

      if (shifts && shifts.length > 0) {
        // Show first shift as a badge inside cell
        const badge = document.createElement("span");
        badge.className = "cal-badge";
        badge.textContent = shifts[0];
        cell.appendChild(badge);

        if (shifts.length > 1) {
          const more = document.createElement("span");
          more.className = "cal-more";
          more.textContent = `+${shifts.length - 1}`;
          cell.appendChild(more);
        }

        // Tooltip
        cell.addEventListener("mouseenter", (e) => {
          tooltip.innerHTML = `<strong>${dateStr}</strong>` +
            shifts.map(s => `<div class="tt-shift">${s}</div>`).join("");
          tooltip.classList.add("show");
          moveTooltip(e);
        });
        cell.addEventListener("mousemove", moveTooltip);
        cell.addEventListener("mouseleave", () => tooltip.classList.remove("show"));
      }

      grid.appendChild(cell);
    }

    calendarContainer.appendChild(grid);
  });
}

function moveTooltip(e) {
  const x = e.clientX + 16;
  const y = e.clientY - 10;
  const tw = tooltip.offsetWidth  || 180;
  const th = tooltip.offsetHeight || 60;
  tooltip.style.left = (x + tw > window.innerWidth  ? e.clientX - tw - 10 : x) + "px";
  tooltip.style.top  = (y + th > window.innerHeight ? e.clientY - th - 10 : y) + "px";
}

// ── Daily list view ──────────────────────────────────────────
const FULL_DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function renderDaily(schedule) {
  if (!schedule || schedule.length === 0) {
    dailyContainer.innerHTML = "<p class='empty-state'>No shifts found for this employee.</p>";
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  schedule.forEach(entry => {
    const date    = new Date(entry.date);
    const isToday = date.getTime() === today.getTime();

    const item = document.createElement("div");
    item.className = "daily-item" + (isToday ? " today" : "");

    item.innerHTML = `
      <div class="daily-date">
        <span class="daily-weekday">${FULL_DAYS[date.getDay()]}</span>
        <span class="daily-datenum">${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}</span>
      </div>
      <div class="daily-shifts">
        ${entry.shifts.map(s => `<span class="badge">${s}</span>`).join("")}
      </div>
    `;

    dailyContainer.appendChild(item);
  });
}

// ── Helpers ──────────────────────────────────────────────────
function toDateStr(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove("hidden");
}

function hideError() {
  errorMsg.classList.add("hidden");
  errorMsg.textContent = "";
}
