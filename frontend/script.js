const loadBtn          = document.getElementById("loadBtn");
const loading          = document.getElementById("loading");
const errorMsg         = document.getElementById("error-msg");
const scheduleSection  = document.getElementById("schedule-section");
const calendarContainer = document.getElementById("calendar");
const dailyContainer   = document.getElementById("daily");
const calBtn           = document.getElementById("calBtn");
const dayBtn           = document.getElementById("dayBtn");
const tooltip          = document.getElementById("tooltip");

let legendMap = {}; // code → [{ name, times }]

// ── View toggle ─────────────────────────────────────────────────────────────
calBtn.addEventListener("click", () => switchView("calendar"));
dayBtn.addEventListener("click", () => switchView("daily"));

function switchView(view) {
  if (view === "calendar") {
    calBtn.classList.add("active");    calBtn.setAttribute("aria-pressed", "true");
    dayBtn.classList.remove("active"); dayBtn.setAttribute("aria-pressed", "false");
    calendarContainer.classList.remove("hidden");
    dailyContainer.classList.add("hidden");
  } else {
    dayBtn.classList.add("active");    dayBtn.setAttribute("aria-pressed", "true");
    calBtn.classList.remove("active"); calBtn.setAttribute("aria-pressed", "false");
    dailyContainer.classList.remove("hidden");
    calendarContainer.classList.add("hidden");
  }
}

// ── Load schedule ────────────────────────────────────────────────────────────
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

    legendMap = data.legend || {};

    renderCalendar(data.schedule);
    renderDaily(data.schedule);
    scheduleSection.classList.remove("hidden");

  } catch (err) {
    showError("Could not load schedule: " + err.message);
  } finally {
    loading.classList.add("hidden");
  }
});

// ── Build rich tooltip HTML for a shift code ─────────────────────────────────
function buildShiftHTML(code) {
  const entries = legendMap[code];

  if (!entries || entries.length === 0) {
    // Unknown code — just show the raw value
    return `<div class="tt-entry">
      <div class="tt-code-unknown">${code}</div>
    </div>`;
  }

  return entries.map(entry => {
    const timeParts = entry.times
      ? entry.times.split(/\s*ll\s*/).map(t => t.trim()).filter(Boolean)
      : [];

    return `<div class="tt-entry">
      <div class="tt-name">${entry.name} <span class="tt-code-tag">${code}</span></div>
      ${timeParts.map(t => `<div class="tt-time">${t}</div>`).join("")}
    </div>`;
  }).join('<div class="tt-sep"></div>');
}

// ── Calendar view ─────────────────────────────────────────────────────────────
const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];
const DAY_NAMES   = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function renderCalendar(schedule) {
  if (!schedule || schedule.length === 0) {
    calendarContainer.innerHTML = "<p class='empty-state'>No shifts found for this employee.</p>";
    return;
  }

  const shiftMap = {};
  schedule.forEach(e => { shiftMap[e.date] = e.shifts; });

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
    const jsFirstDay = firstDay.getDay();
    const startOffset = jsFirstDay === 0 ? 6 : jsFirstDay - 1;

    const monthHeader = document.createElement("div");
    monthHeader.className = "month-header";
    monthHeader.textContent = `${MONTH_NAMES[month]} ${year}`;
    calendarContainer.appendChild(monthHeader);

    const nameRow = document.createElement("div");
    nameRow.className = "cal-day-names";
    DAY_NAMES.forEach(n => {
      const s = document.createElement("span");
      s.textContent = n;
      nameRow.appendChild(s);
    });
    calendarContainer.appendChild(nameRow);

    const grid = document.createElement("div");
    grid.className = "cal-grid";

    for (let i = 0; i < startOffset; i++) {
      const empty = document.createElement("div");
      empty.className = "cal-cell empty";
      grid.appendChild(empty);
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateObj  = new Date(year, month, d);
      const dateStr  = toDateStr(dateObj);
      const shifts   = shiftMap[dateStr];
      const isToday  = dateObj.getTime() === today.getTime();
      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

      const cell = document.createElement("div");
      cell.className = "cal-cell" +
        (shifts    ? " has-shift" : "") +
        (isToday   ? " today"     : "") +
        (isWeekend ? " weekend"   : "");

      const num = document.createElement("span");
      num.className = "cal-num";
      num.textContent = d;
      cell.appendChild(num);

      if (shifts && shifts.length > 0) {
        // Show badges inside the cell
        shifts.forEach(s => {
          const badge = document.createElement("span");
          badge.className = "cal-badge";
          badge.textContent = s;
          cell.appendChild(badge);
        });

        // Rich tooltip on hover
        cell.addEventListener("mouseenter", (e) => {
          const inner = shifts.map(s => buildShiftHTML(s)).join('<div class="tt-shift-sep"></div>');
          tooltip.innerHTML =
            `<div class="tt-header">${dateStr}</div>` + inner;
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
  const pad = 16;
  const tw  = tooltip.offsetWidth  || 220;
  const th  = tooltip.offsetHeight || 80;
  const x   = e.clientX + pad;
  const y   = e.clientY - 10;
  tooltip.style.left = (x + tw > window.innerWidth  ? e.clientX - tw - pad : x) + "px";
  tooltip.style.top  = (y + th > window.innerHeight ? e.clientY - th - pad : y) + "px";
}

// ── Daily list view ───────────────────────────────────────────────────────────
const FULL_DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function renderDaily(schedule) {
  if (!schedule || schedule.length === 0) {
    dailyContainer.innerHTML = "<p class='empty-state'>No shifts found.</p>";
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  schedule.forEach(entry => {
    const date    = new Date(entry.date);
    const isToday = date.getTime() === today.getTime();

    const item = document.createElement("div");
    item.className = "daily-item" + (isToday ? " today" : "");

    const shiftsHTML = entry.shifts.map(code => {
      const entries = legendMap[code];
      if (!entries || entries.length === 0) {
        return `<div class="daily-shift-row">
          <span class="badge">${code}</span>
        </div>`;
      }
      return entries.map(e => {
        const timeParts = e.times
          ? e.times.split(/\s*ll\s*/).map(t => t.trim()).filter(Boolean)
          : [];
        return `<div class="daily-shift-row">
          <span class="badge">${code}</span>
          <span class="daily-shift-name">${e.name}</span>
          ${timeParts.length > 0
            ? `<span class="daily-shift-time">${timeParts[0]}${timeParts.length > 1 ? ` <span class="daily-shift-more">+${timeParts.length - 1} more</span>` : ""}</span>`
            : ""}
        </div>`;
      }).join("");
    }).join("");

    item.innerHTML = `
      <div class="daily-date">
        <span class="daily-weekday">${FULL_DAYS[date.getDay()]}</span>
        <span class="daily-datenum">${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}</span>
      </div>
      <div class="daily-shifts">${shiftsHTML}</div>
    `;

    dailyContainer.appendChild(item);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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
