const loadBtn           = document.getElementById("loadBtn");
const loading           = document.getElementById("loading");
const errorMsg          = document.getElementById("error-msg");
const scheduleSection   = document.getElementById("schedule-section");
const calendarContainer = document.getElementById("calendar");
const dailyContainer    = document.getElementById("daily");
const calBtn            = document.getElementById("calBtn");
const dayBtn            = document.getElementById("dayBtn");
const tooltip           = document.getElementById("tooltip");

let legendMap = {};

// ── Swedish day name → JS getDay() (0=Sun … 6=Sat) ──────────────────────────────────
const SV_DAYS = {
  'sön':0,'son':0,  'mån':1,'man':1,  'tis':2,
  'ons':3,  'tor':4,'tors':4,  'fre':5,  'lör':6,'lor':6
};

function svDay(name) {
  return SV_DAYS[name.trim().toLowerCase()];
}

function dayMatchesSingle(jsDay, name) {
  const v = svDay(name);
  return v !== undefined && v === jsDay;
}

function dayMatchesSpec(jsDay, spec) {
  const s = spec.trim();
  const sl = s.toLowerCase();

  // Swedish compound specs
  if (sl === 'vardagar' || sl === 'vardag' || sl === 'mån-fre' || sl === 'man-fre') {
    return jsDay >= 1 && jsDay <= 5; // Mon–Fri
  }
  if (sl === 'helg' || sl === 'helgdag' || sl === 'helger') {
    return jsDay === 0 || jsDay === 6; // Sat–Sun
  }

  // List: "Fre & Lör"
  if (s.includes('&')) {
    return s.split('&').some(p => dayMatchesSingle(jsDay, p));
  }

  // Range: "Sön-Tors"
  if (s.includes('-')) {
    const [a, b] = s.split('-');
    const start = svDay(a);
    const end   = svDay(b);
    if (start === undefined || end === undefined) return false;
    if (start <= end) return jsDay >= start && jsDay <= end;
    return jsDay >= start || jsDay <= end; // wrap-around e.g. Tor-Sön
  }

  return dayMatchesSingle(jsDay, s);
}

// Split a legend times string into its per-day parts.
// Cherry uses "ll" (two L’s) as separator, but we also handle |, \n, etc.
function splitTimeParts(timesStr) {
  if (!timesStr) return [];
  // Try separators in order of specificity
  for (const sep of [/\s*ll\s*/, /\s*\|\|\s*/, /\s*\|\s*/, /\n/]) {
    const parts = timesStr.split(sep).map(p => p.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
  }
  // Only one part (or no separator found)
  return [timesStr.trim()].filter(Boolean);
}

// Given a times string and a JS day number, return the time that applies.
function matchTimeForDay(timesStr, jsDay) {
  const parts = splitTimeParts(timesStr);

  for (const part of parts) {
    const colonIdx = part.indexOf(':');

    if (colonIdx === -1) return part; // No colon — plain time, any day

    const dayPart  = part.substring(0, colonIdx).trim();
    const timePart = part.substring(colonIdx + 1).trim();

    if (/^\d/.test(dayPart)) return part; // dayPart is a time — any day

    if (dayMatchesSpec(jsDay, dayPart)) return timePart;
  }

  return null;
}

// Find the best legend entry + matched time for a code on a given day.
function getShiftInfoForDay(code, jsDay) {
  const entries = legendMap[code];
  if (!entries || entries.length === 0) return null;

  // Try each entry; return the first whose times include this day
  for (const entry of entries) {
    const time = matchTimeForDay(entry.times, jsDay);
    if (time !== null) return { name: entry.name, time };
  }

  // No day-specific match — fall back to first entry with raw times
  const fallback = entries[0];
  return { name: fallback.name, time: fallback.times || '' };
}

// ── Build tooltip HTML for one shift code ───────────────────────────────────────
function buildShiftHTML(code, jsDay) {
  if (code.toUpperCase() === 'X') {
    return `<div class="tt-entry tt-leave-entry">
      <span class="tt-leave-label">Beviljad ledighet</span>
    </div>`;
  }

  if (!legendMap[code]) {
    return `<div class="tt-entry"><div class="tt-code-unknown">${code}</div></div>`;
  }

  const info = getShiftInfoForDay(code, jsDay);
  if (!info) {
    return `<div class="tt-entry"><div class="tt-code-unknown">${code}</div></div>`;
  }

  return `<div class="tt-entry">
    <div class="tt-name">${info.name} <span class="tt-code-tag">${code}</span></div>
    ${info.time ? `<div class="tt-time">${info.time}</div>` : ''}
  </div>`;
}

// ── View toggle ────────────────────────────────────────────────────────────────
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

  if (!url || !id) { showError("Please enter both a schedule URL and your Employee ID."); return; }

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
    if (!response.ok || data.error) throw new Error(data.error || "Server error.");

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

// ── Calendar view ────────────────────────────────────────────────────────────────
const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];
const DAY_NAMES   = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function renderCalendar(schedule) {
  if (!schedule || schedule.length === 0) {
    calendarContainer.innerHTML = "<p class='empty-state'>No shifts found.</p>";
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
    const firstDay    = new Date(year, month, 1);
    const lastDay     = new Date(year, month + 1, 0);
    const jsFirstDay  = firstDay.getDay();
    const startOffset = jsFirstDay === 0 ? 6 : jsFirstDay - 1;

    const monthHeader = document.createElement("div");
    monthHeader.className = "month-header";
    monthHeader.textContent = `${MONTH_NAMES[month]} ${year}`;
    calendarContainer.appendChild(monthHeader);

    const nameRow = document.createElement("div");
    nameRow.className = "cal-day-names";
    DAY_NAMES.forEach(n => { const s = document.createElement("span"); s.textContent = n; nameRow.appendChild(s); });
    calendarContainer.appendChild(nameRow);

    const grid = document.createElement("div");
    grid.className = "cal-grid";

    for (let i = 0; i < startOffset; i++) {
      const e = document.createElement("div"); e.className = "cal-cell empty"; grid.appendChild(e);
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateObj   = new Date(year, month, d);
      const dateStr   = toDateStr(dateObj);
      const jsDay     = dateObj.getDay();
      const shifts    = shiftMap[dateStr];
      const isToday   = dateObj.getTime() === today.getTime();
      const isWeekend = jsDay === 0 || jsDay === 6;
      const isXOnly   = shifts && shifts.length === 1 && shifts[0].toUpperCase() === 'X';
      const hasShifts = shifts && shifts.length > 0;

      const cell = document.createElement("div");
      cell.className = "cal-cell" +
        (isXOnly   ? " leave"     : hasShifts ? " has-shift" : "") +
        (isToday   ? " today"     : "") +
        (isWeekend ? " weekend"   : "");

      const num = document.createElement("span");
      num.className = "cal-num";
      num.textContent = d;
      cell.appendChild(num);

      if (hasShifts) {
        shifts.forEach(s => {
          const badge = document.createElement("span");
          badge.className = "cal-badge" + (isXOnly ? " leave-badge" : "");
          badge.textContent = s;
          cell.appendChild(badge);
        });

        cell.addEventListener("mouseenter", (ev) => {
          const inner = shifts
            .map(s => buildShiftHTML(s, jsDay))
            .join('<div class="tt-shift-sep"></div>');
          tooltip.innerHTML = `<div class="tt-header">${dateStr}</div>` + inner;
          tooltip.classList.add("show");
          moveTooltip(ev);
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

// ── Daily list view ────────────────────────────────────────────────────────────
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
    const jsDay   = date.getDay();
    const isToday = date.getTime() === today.getTime();
    const isXOnly = entry.shifts.length === 1 && entry.shifts[0].toUpperCase() === 'X';

    const item = document.createElement("div");
    item.className = "daily-item" + (isXOnly ? " leave" : "") + (isToday ? " today" : "");

    const shiftsHTML = entry.shifts.map(code => {
      if (code.toUpperCase() === 'X') {
        return `<div class="daily-shift-row">
          <span class="badge leave-badge">X</span>
          <span class="daily-shift-name daily-leave-label">Beviljad ledighet</span>
        </div>`;
      }
      const info = getShiftInfoForDay(code, jsDay);
      if (!info) return `<div class="daily-shift-row"><span class="badge">${code}</span></div>`;
      return `<div class="daily-shift-row">
        <span class="badge">${code}</span>
        <span class="daily-shift-name">${info.name}</span>
        ${info.time ? `<span class="daily-shift-time">${info.time}</span>` : ''}
      </div>`;
    }).join("");

    item.innerHTML = `
      <div class="daily-date">
        <span class="daily-weekday">${FULL_DAYS[jsDay]}</span>
        <span class="daily-datenum">${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}</span>
      </div>
      <div class="daily-shifts">${shiftsHTML}</div>
    `;

    dailyContainer.appendChild(item);
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────────
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function showError(msg) { errorMsg.textContent = msg; errorMsg.classList.remove("hidden"); }
function hideError()    { errorMsg.classList.add("hidden"); errorMsg.textContent = ""; }
