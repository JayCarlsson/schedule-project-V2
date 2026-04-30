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

// ── Swedish day name → JS getDay() (0=Sun … 6=Sat) ──────────────────────────
const SV_DAYS = {
  'sön':0,'son':0, 'mån':1,'man':1, 'tis':2,
  'ons':3, 'tor':4,'tors':4, 'fre':5, 'lör':6,'lor':6
};
function svDay(n) { return SV_DAYS[n.trim().toLowerCase()]; }
function dayMatchesSingle(jsDay, n) { const v = svDay(n); return v !== undefined && v === jsDay; }

function dayMatchesSpec(jsDay, spec) {
  const s = spec.trim(), sl = s.toLowerCase();
  if (sl==='vardagar'||sl==='vardag'||sl==='mån-fre') return jsDay>=1&&jsDay<=5;
  if (sl==='helg'||sl==='helgdag'||sl==='helger')    return jsDay===0||jsDay===6;
  if (s.includes('&')) return s.split('&').some(p => dayMatchesSingle(jsDay, p));
  if (s.includes('-')) {
    const [a,b] = s.split('-');
    const st = svDay(a), en = svDay(b);
    if (st===undefined||en===undefined) return false;
    return st<=en ? jsDay>=st&&jsDay<=en : jsDay>=st||jsDay<=en;
  }
  return dayMatchesSingle(jsDay, s);
}

// ── Normalise a raw times string before splitting ────────────────────────────
function normalizeTimesStr(s) {
  if (!s) return '';
  s = s.replace(/\s+och\s+/gi, ' & ');
  s = s.replace(/&\s*([A-ZÅÄÖ][a-zåäö]{1,5})\s+(\d)/g, ' ll $1: $2');
  const DW = '(?:Vardagar?|Helg(?:dag)?|S[oö]n|M[åa]n|Tis|Ons|Tors?|Fre|L[oö]r)';
  const DL = `(${DW}(?:\\s*&\\s*${DW})*)`;
  s = s.replace(new RegExp(`${DL}\\s+(\\d{1,2}[.:])`,'gi'), '$1: $2');
  return s;
}

function splitTimeParts(timesStr) {
  if (!timesStr) return [];
  return normalizeTimesStr(timesStr)
    .replace(/\s*(?:ll|\|\|)\s*/gi, '\n')
    .replace(/\r/g, '')
    .split('\n')
    .map(p => p.trim())
    .filter(Boolean);
}

function cleanTime(t) {
  return t.split(/\s+\(/)[0].trim();
}

function matchTimeForDay(timesStr, jsDay) {
  const parts = splitTimeParts(timesStr);
  for (const part of parts) {
    const ci = part.indexOf(':');
    if (ci === -1) {
      if (/^\d/.test(part)) return cleanTime(part);
      continue;
    }
    const dayPart  = part.substring(0, ci).trim();
    const timePart = part.substring(ci + 1).trim();
    if (/^\d/.test(dayPart)) {
      // "30/5: 13.00-18.15" — specific date entry: return ONLY the time, no date prefix
      return cleanTime(timePart);
    }
    if (dayMatchesSpec(jsDay, dayPart)) return cleanTime(timePart);
  }
  return null;
}

const GAME_RE = /^(roulette|kontanter|bj|blackjack|poker)/i;
function extractLabels(timesStr) {
  return splitTimeParts(timesStr).filter(p => {
    if (p.indexOf(':') !== -1) return false;
    if (/^\d/.test(p))         return false;
    return GAME_RE.test(p);
  });
}

function getShiftInfoForDay(code, jsDay) {
  const entries = legendMap[code];
  if (!entries || entries.length === 0) return null;
  for (const entry of entries) {
    const time = matchTimeForDay(entry.times, jsDay);
    if (time !== null) return { name: entry.name, time, labels: extractLabels(entry.times) };
  }
  return { name: entries[0].name, time: '', labels: extractLabels(entries[0].times) };
}

// ── Tooltip HTML ─────────────────────────────────────────────────────────────
function buildShiftHTML(code, jsDay) {
  if (code.toUpperCase() === 'X')
    return `<div class="tt-entry tt-leave-entry"><span class="tt-leave-label">Beviljad ledighet</span></div>`;
  if (!legendMap[code])
    return `<div class="tt-entry"><div class="tt-code-unknown">${code}</div></div>`;
  const info = getShiftInfoForDay(code, jsDay);
  if (!info) return `<div class="tt-entry"><div class="tt-code-unknown">${code}</div></div>`;
  const labelsHTML = info.labels.map(l => `<span class="tt-label-tag">${l}</span>`).join('');
  return `<div class="tt-entry">
    <div class="tt-name">${info.name} <span class="tt-code-tag">${code}</span></div>
    ${labelsHTML ? `<div class="tt-labels">${labelsHTML}</div>` : ''}
    ${info.time ? `<div class="tt-time">${info.time}</div>` : ''}
  </div>`;
}

// ── View toggle ───────────────────────────────────────────────────────────────
calBtn.addEventListener('click', () => switchView('calendar'));
dayBtn.addEventListener('click', () => switchView('daily'));
function switchView(view) {
  const cal = view === 'calendar';
  calBtn.classList.toggle('active', cal);    calBtn.setAttribute('aria-pressed', cal);
  dayBtn.classList.toggle('active', !cal);   dayBtn.setAttribute('aria-pressed', !cal);
  calendarContainer.classList.toggle('hidden', !cal);
  dailyContainer.classList.toggle('hidden', cal);
}

// ── Load schedule ─────────────────────────────────────────────────────────────
loadBtn.addEventListener('click', async () => {
  const url = document.getElementById('url').value.trim();
  const id  = document.getElementById('id').value.trim();
  if (!url || !id) { showError('Please enter both a schedule URL and your Employee ID.'); return; }
  hideError();
  loading.classList.remove('hidden');
  scheduleSection.classList.add('hidden');
  calendarContainer.innerHTML = ''; dailyContainer.innerHTML = '';
  try {
    const res  = await fetch('http://localhost:3000/api/scrape', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, id })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Server error.');
    legendMap = data.legend || {};
    renderCalendar(data.schedule);
    renderDaily(data.schedule);
    scheduleSection.classList.remove('hidden');
  } catch (err) {
    showError('Could not load schedule: ' + err.message);
  } finally {
    loading.classList.add('hidden');
  }
});

// ── Calendar view ─────────────────────────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
const DAY_NAMES   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function renderCalendar(schedule) {
  if (!schedule?.length) { calendarContainer.innerHTML = "<p class='empty-state'>No shifts found.</p>"; return; }
  const shiftMap = {};
  schedule.forEach(e => { shiftMap[e.date] = e.shifts; });
  const monthGroups = {};
  schedule.forEach(e => {
    const d = new Date(e.date), key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!monthGroups[key]) monthGroups[key] = { year: d.getFullYear(), month: d.getMonth() };
  });
  const today = new Date(); today.setHours(0,0,0,0);
  Object.values(monthGroups).forEach(({ year, month }) => {
    const first = new Date(year, month, 1);
    const last  = new Date(year, month+1, 0);
    const offset = first.getDay() === 0 ? 6 : first.getDay()-1;
    const hdr = document.createElement('div'); hdr.className = 'month-header';
    hdr.textContent = `${MONTH_NAMES[month]} ${year}`;
    calendarContainer.appendChild(hdr);
    const names = document.createElement('div'); names.className = 'cal-day-names';
    DAY_NAMES.forEach(n => { const s = document.createElement('span'); s.textContent = n; names.appendChild(s); });
    calendarContainer.appendChild(names);
    const grid = document.createElement('div'); grid.className = 'cal-grid';
    for (let i=0; i<offset; i++) { const e = document.createElement('div'); e.className='cal-cell empty'; grid.appendChild(e); }
    for (let d=1; d<=last.getDate(); d++) {
      const dt      = new Date(year, month, d);
      const dateStr = toDateStr(dt);
      const jsDay   = dt.getDay();
      const shifts  = shiftMap[dateStr];
      const isToday = dt.getTime() === today.getTime();
      const isWknd  = jsDay===0||jsDay===6;
      const isXOnly = shifts?.length===1 && shifts[0].toUpperCase()==='X';
      const hasShifts = shifts?.length > 0;
      const cell = document.createElement('div');
      cell.className = 'cal-cell'
        + (isXOnly ? ' leave' : hasShifts ? ' has-shift' : '')
        + (isToday ? ' today' : '') + (isWknd ? ' weekend' : '');
      const num = document.createElement('span'); num.className='cal-num'; num.textContent=d;
      cell.appendChild(num);
      if (hasShifts) {
        shifts.forEach(s => {
          const b = document.createElement('span');
          b.className = 'cal-badge'+(isXOnly?' leave-badge':'');
          b.textContent = s; cell.appendChild(b);
        });
        cell.addEventListener('mouseenter', ev => {
          tooltip.innerHTML = `<div class="tt-header">${dateStr}</div>`
            + shifts.map(s => buildShiftHTML(s, jsDay)).join('<div class="tt-shift-sep"></div>');
          tooltip.classList.add('show'); moveTooltip(ev);
        });
        cell.addEventListener('mousemove', moveTooltip);
        cell.addEventListener('mouseleave', () => tooltip.classList.remove('show'));
      }
      grid.appendChild(cell);
    }
    calendarContainer.appendChild(grid);
  });
}

function moveTooltip(e) {
  const pad=16, tw=tooltip.offsetWidth||220, th=tooltip.offsetHeight||80;
  const x=e.clientX+pad, y=e.clientY-10;
  tooltip.style.left=(x+tw>window.innerWidth  ? e.clientX-tw-pad : x)+'px';
  tooltip.style.top =(y+th>window.innerHeight ? e.clientY-th-pad : y)+'px';
}

// ── Daily list view ───────────────────────────────────────────────────────────
const FULL_DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function renderDaily(schedule) {
  if (!schedule?.length) { dailyContainer.innerHTML = "<p class='empty-state'>No shifts found.</p>"; return; }
  const today = new Date(); today.setHours(0,0,0,0);
  schedule.forEach(entry => {
    const date   = new Date(entry.date);
    const jsDay  = date.getDay();
    const isXOnly = entry.shifts.length===1 && entry.shifts[0].toUpperCase()==='X';
    const item = document.createElement('div');
    item.className = 'daily-item'+(isXOnly?' leave':'')+(date.getTime()===today.getTime()?' today':'');
    const shiftsHTML = entry.shifts.map(code => {
      if (code.toUpperCase()==='X')
        return `<div class="daily-shift-row"><span class="badge leave-badge">X</span><span class="daily-shift-name daily-leave-label">Beviljad ledighet</span></div>`;
      const info = getShiftInfoForDay(code, jsDay);
      if (!info) return `<div class="daily-shift-row"><span class="badge">${code}</span></div>`;
      const labelsHTML = info.labels.map(l => `<span class="daily-label-tag">${l}</span>`).join('');
      return `<div class="daily-shift-row">
        <span class="badge">${code}</span>
        <span class="daily-shift-name">${info.name}</span>
        ${labelsHTML}
        ${info.time ? `<span class="daily-shift-time">${info.time}</span>` : ''}
      </div>`;
    }).join('');
    item.innerHTML = `
      <div class="daily-date">
        <span class="daily-weekday">${FULL_DAYS[jsDay]}</span>
        <span class="daily-datenum">${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}</span>
      </div>
      <div class="daily-shifts">${shiftsHTML}</div>`;
    dailyContainer.appendChild(item);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function showError(msg) { errorMsg.textContent=msg; errorMsg.classList.remove('hidden'); }
function hideError()    { errorMsg.classList.add('hidden'); errorMsg.textContent=''; }
