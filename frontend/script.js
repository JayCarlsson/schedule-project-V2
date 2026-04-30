const loadBtn           = document.getElementById("loadBtn");
const loading           = document.getElementById("loading");
const errorMsg          = document.getElementById("error-msg");
const scheduleSection   = document.getElementById("schedule-section");
const calendarContainer = document.getElementById("calendar");
const dailyContainer    = document.getElementById("daily");
const calBtn            = document.getElementById("calBtn");
const dayBtn            = document.getElementById("dayBtn");
const exportBtn         = document.getElementById("exportBtn");
const tooltip           = document.getElementById("tooltip");
const nextShiftBanner   = document.getElementById("next-shift-banner");
const urlInput          = document.getElementById("url");
const idInput           = document.getElementById("id");

let legendMap         = {};
let countdownInterval = null;
let lastSchedule      = [];

// ── Persist inputs in URL hash ────────────────────────────────────────────────────
function saveInputs() {
  const url = urlInput.value.trim();
  const id  = idInput.value.trim();
  if (url || id) {
    history.replaceState(null, '', '#' + btoa(JSON.stringify({ url, id })));
  }
}
function restoreInputs() {
  try {
    const { url, id } = JSON.parse(atob(location.hash.slice(1)));
    if (url) urlInput.value = url;
    if (id)  idInput.value  = id;
  } catch { /* ignore */ }
}
restoreInputs();
urlInput.addEventListener('input', saveInputs);
idInput.addEventListener('input',  saveInputs);

// ── Swedish day name → JS getDay() ───────────────────────────────────────────────
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
    .replace(/\s*(?:ll|\|\|)\s*/gi, '\n').replace(/\r/g, '')
    .split('\n').map(p => p.trim()).filter(Boolean);
}
function cleanTime(t) { return t.split(/\s+\(/)[0].trim(); }
function matchTimeForDay(timesStr, jsDay) {
  for (const part of splitTimeParts(timesStr)) {
    const ci = part.indexOf(':');
    if (ci === -1) { if (/^\d/.test(part)) return cleanTime(part); continue; }
    const dayPart = part.substring(0,ci).trim(), timePart = part.substring(ci+1).trim();
    if (/^\d/.test(dayPart)) return cleanTime(timePart);
    if (dayMatchesSpec(jsDay, dayPart)) return cleanTime(timePart);
  }
  return null;
}
const GAME_RE = /^(roulette|kontanter|bj|blackjack|poker)/i;
function extractLabels(timesStr) {
  return splitTimeParts(timesStr).filter(p => p.indexOf(':')===-1 && !/^\d/.test(p) && GAME_RE.test(p));
}
function getShiftInfoForDay(code, jsDay) {
  const entries = legendMap[code];
  if (!entries?.length) return null;
  for (const entry of entries) {
    const time = matchTimeForDay(entry.times, jsDay);
    if (time !== null) return { name: entry.name, time, labels: extractLabels(entry.times) };
  }
  return { name: entries[0].name, time: '', labels: extractLabels(entries[0].times) };
}

// ── Export to .ics ──────────────────────────────────────────────────────────────
function pad2(n) { return String(n).padStart(2,'0'); }

function toIcsDate(date, h, min) {
  // Returns UTC datetime string: YYYYMMDDTHHmmssZ
  const d = new Date(date);
  d.setHours(h, min, 0, 0);
  return d.getUTCFullYear()
    + pad2(d.getUTCMonth()+1)
    + pad2(d.getUTCDate())
    + 'T' + pad2(d.getUTCHours())
    + pad2(d.getUTCMinutes()) + '00Z';
}

function parseTimeRange(timeStr) {
  // "23.00-05.15" or "13:00-18:15" → { sh, sm, eh, em }
  if (!timeStr) return null;
  const m = timeStr.match(/(\d{1,2})[.:](\d{2})\s*[-–]\s*(\d{1,2})[.:](\d{2})/);
  if (!m) return null;
  return { sh: +m[1], sm: +m[2], eh: +m[3], em: +m[4] };
}

function exportIcs(schedule) {
  const now = new Date();
  const stamp = now.getUTCFullYear()
    + pad2(now.getUTCMonth()+1)+pad2(now.getUTCDate())
    +'T'+pad2(now.getUTCHours())+pad2(now.getUTCMinutes())+'00Z';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Schedule Viewer//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  let uid = 1;
  for (const entry of schedule) {
    const date  = new Date(entry.date);
    const jsDay = date.getDay();
    const realShifts = entry.shifts.filter(s => s.toUpperCase() !== 'X');
    if (!realShifts.length) continue;

    for (const code of realShifts) {
      const info = getShiftInfoForDay(code, jsDay);
      const range = info ? parseTimeRange(info.time) : null;
      const name  = info ? info.name : code;

      let dtStart, dtEnd;
      if (range) {
        // Night shifts: start hour < 12 means it's next calendar day (e.g. 05:00)
        const startDate = new Date(date);
        dtStart = toIcsDate(startDate, range.sh, range.sm);
        // If end hour < start hour the shift crosses midnight
        const endDate = new Date(date);
        if (range.eh < range.sh) endDate.setDate(endDate.getDate() + 1);
        dtEnd = toIcsDate(endDate, range.eh, range.em);
      } else {
        // All-day fallback
        const ds = entry.date.replace(/-/g,'');
        dtStart = `${ds}`;
        dtEnd   = `${ds}`;
        lines.push(
          'BEGIN:VEVENT',
          `UID:sv-${uid++}@schedule-viewer`,
          `DTSTAMP:${stamp}`,
          `DTSTART;VALUE=DATE:${ds}`,
          `DTEND;VALUE=DATE:${ds}`,
          `SUMMARY:${name} (${code})`,
          'END:VEVENT'
        );
        continue;
      }

      lines.push(
        'BEGIN:VEVENT',
        `UID:sv-${uid++}@schedule-viewer`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${name} (${code})`,
        info?.labels?.length ? `DESCRIPTION:${info.labels.join(', ')}` : '',
        'END:VEVENT'
      );
    }
  }

  lines.push('END:VCALENDAR');

  const blob = new Blob([lines.filter(Boolean).join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'schedule.ics';
  a.click();
  URL.revokeObjectURL(a.href);
}

exportBtn.addEventListener('click', () => exportIcs(lastSchedule));

// ── Next shift banner ─────────────────────────────────────────────────────────
function parseShiftStartTime(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.match(/(\d{1,2})[.:](\d{2})/);
  return m ? { h: +m[1], min: +m[2] } : null;
}
function renderNextShiftBanner(schedule) {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  const now = new Date(), today = new Date(now); today.setHours(0,0,0,0);
  let nextEntry=null, nextShiftCode=null, nextShiftTime=null, nextDate=null;
  for (const entry of schedule) {
    const d = new Date(entry.date);
    if (d < today) continue;
    const jsDay = d.getDay();
    const realShifts = entry.shifts.filter(s => s.toUpperCase()!=='X');
    if (!realShifts.length) continue;
    for (const code of realShifts) {
      const info  = getShiftInfoForDay(code, jsDay);
      const start = info ? parseShiftStartTime(info.time) : null;
      let shiftStart = new Date(d);
      if (start) {
        shiftStart.setHours(start.h, start.min, 0, 0);
        if (start.h < 12) shiftStart.setDate(shiftStart.getDate()+1);
      } else { shiftStart.setHours(20,0,0,0); }
      if (shiftStart > now) { nextEntry=entry; nextShiftCode=code; nextShiftTime=info?.time||''; nextDate=shiftStart; break; }
    }
    if (nextEntry) break;
  }
  if (!nextEntry) { nextShiftBanner.classList.add('hidden'); return; }
  const jsDay  = new Date(nextEntry.date).getDay();
  const info   = getShiftInfoForDay(nextShiftCode, jsDay);
  const isToday = new Date(nextEntry.date).setHours(0,0,0,0) === today.getTime();
  nextShiftBanner.className = 'next-shift-banner'+(isToday?' nsb-today':'');
  function updateBanner() {
    const diff  = nextDate - new Date();
    if (diff<=0) { renderNextShiftBanner(schedule); return; }
    const days  = Math.floor(diff/86400000);
    const hours = Math.floor((diff%86400000)/3600000);
    const mins  = Math.floor((diff%3600000)/60000);
    const countdown = days>0 ? `${days}d ${hours}h` : hours>0 ? `${hours}h ${mins}m` : `${mins}m`;
    const dateLabel = isToday ? 'Today' : nextDate.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
    nextShiftBanner.innerHTML = `
      <div class="nsb-icon">${isToday?'⏰':'📅'}</div>
      <div class="nsb-body">
        <div class="nsb-label">${isToday?'Shift today':'Next shift'}</div>
        <div class="nsb-venue">${info?info.name:nextShiftCode}
          <span style="font-size:.75rem;font-weight:400;color:var(--text-muted);">&nbsp;${nextShiftCode}</span>
        </div>
        <div class="nsb-detail">${dateLabel}${nextShiftTime?' &middot; '+nextShiftTime:''}</div>
      </div>
      <div class="nsb-countdown">
        <div class="nsb-countdown-value">${countdown}</div>
        <div class="nsb-countdown-label">until start</div>
      </div>`;
  }
  updateBanner();
  nextShiftBanner.classList.remove('hidden');
  countdownInterval = setInterval(updateBanner, 30000);
}

// ── Tooltip HTML ─────────────────────────────────────────────────────────────
function buildShiftHTML(code, jsDay) {
  if (code.toUpperCase()==='X') return `<div class="tt-entry tt-leave-entry"><span class="tt-leave-label">Beviljad ledighet</span></div>`;
  if (!legendMap[code]) return `<div class="tt-entry"><div class="tt-code-unknown">${code}</div></div>`;
  const info = getShiftInfoForDay(code, jsDay);
  if (!info) return `<div class="tt-entry"><div class="tt-code-unknown">${code}</div></div>`;
  const labelsHTML = info.labels.map(l=>`<span class="tt-label-tag">${l}</span>`).join('');
  return `<div class="tt-entry"><div class="tt-name">${info.name} <span class="tt-code-tag">${code}</span></div>${labelsHTML?`<div class="tt-labels">${labelsHTML}</div>`:''} ${info.time?`<div class="tt-time">${info.time}</div>`:''}</div>`;
}

// ── View toggle ───────────────────────────────────────────────────────────────
calBtn.addEventListener('click', () => switchView('calendar'));
dayBtn.addEventListener('click', () => switchView('daily'));
function switchView(view) {
  const cal = view==='calendar';
  calBtn.classList.toggle('active',cal);   calBtn.setAttribute('aria-pressed',cal);
  dayBtn.classList.toggle('active',!cal);  dayBtn.setAttribute('aria-pressed',!cal);
  calendarContainer.classList.toggle('hidden',!cal);
  dailyContainer.classList.toggle('hidden',cal);
}

// ── Load schedule ─────────────────────────────────────────────────────────────
loadBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  const id  = idInput.value.trim();
  if (!url||!id) { showError('Please enter both a schedule URL and your Employee ID.'); return; }
  saveInputs(); hideError();
  loading.classList.remove('hidden');
  scheduleSection.classList.add('hidden');
  nextShiftBanner.classList.add('hidden');
  calendarContainer.innerHTML=''; dailyContainer.innerHTML='';
  try {
    const res  = await fetch('http://localhost:3000/api/scrape',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({url,id})
    });
    const data = await res.json();
    if (!res.ok||data.error) throw new Error(data.error||'Server error.');
    legendMap    = data.legend||{};
    lastSchedule = data.schedule||[];
    renderCalendar(lastSchedule);
    renderDaily(lastSchedule);
    renderNextShiftBanner(lastSchedule);
    scheduleSection.classList.remove('hidden');
  } catch(err) {
    showError('Could not load schedule: '+err.message);
  } finally {
    loading.classList.add('hidden');
  }
});

// ── Calendar view ─────────────────────────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
function renderCalendar(schedule) {
  if (!schedule?.length) { calendarContainer.innerHTML="<p class='empty-state'>No shifts found.</p>"; return; }
  const shiftMap={}, monthGroups={};
  schedule.forEach(e => {
    shiftMap[e.date]=e.shifts;
    const d=new Date(e.date), key=`${d.getFullYear()}-${d.getMonth()}`;
    if (!monthGroups[key]) monthGroups[key]={year:d.getFullYear(),month:d.getMonth()};
  });
  const today=new Date(); today.setHours(0,0,0,0);
  Object.values(monthGroups).forEach(({year,month})=>{
    const first=new Date(year,month,1), last=new Date(year,month+1,0);
    const offset=first.getDay()===0?6:first.getDay()-1;
    const hdr=document.createElement('div'); hdr.className='month-header';
    hdr.textContent=`${MONTH_NAMES[month]} ${year}`; calendarContainer.appendChild(hdr);
    const names=document.createElement('div'); names.className='cal-day-names';
    DAY_NAMES.forEach(n=>{const s=document.createElement('span');s.textContent=n;names.appendChild(s);});
    calendarContainer.appendChild(names);
    const grid=document.createElement('div'); grid.className='cal-grid';
    for (let i=0;i<offset;i++){const e=document.createElement('div');e.className='cal-cell empty';grid.appendChild(e);}
    for (let d=1;d<=last.getDate();d++) {
      const dt=new Date(year,month,d), dateStr=toDateStr(dt), jsDay=dt.getDay();
      const shifts=shiftMap[dateStr], isToday=dt.getTime()===today.getTime();
      const isWknd=jsDay===0||jsDay===6, isXOnly=shifts?.length===1&&shifts[0].toUpperCase()==='X';
      const hasShifts=shifts?.length>0;
      const cell=document.createElement('div');
      cell.className='cal-cell'+(isXOnly?' leave':hasShifts?' has-shift':'')+(isToday?' today':'')+(isWknd?' weekend':'');
      const num=document.createElement('span'); num.className='cal-num'; num.textContent=d; cell.appendChild(num);
      if (hasShifts) {
        shifts.forEach(s=>{
          const b=document.createElement('span');
          b.className='cal-badge'+(isXOnly?' leave-badge':'');
          b.textContent=s; cell.appendChild(b);
        });
        cell.addEventListener('mouseenter',ev=>{
          tooltip.innerHTML=`<div class="tt-header">${dateStr}</div>`+shifts.map(s=>buildShiftHTML(s,jsDay)).join('<div class="tt-shift-sep"></div>');
          tooltip.classList.add('show'); moveTooltip(ev);
        });
        cell.addEventListener('mousemove',moveTooltip);
        cell.addEventListener('mouseleave',()=>tooltip.classList.remove('show'));
      }
      grid.appendChild(cell);
    }
    calendarContainer.appendChild(grid);
  });
}
function moveTooltip(e) {
  const pad=16,tw=tooltip.offsetWidth||220,th=tooltip.offsetHeight||80;
  const x=e.clientX+pad,y=e.clientY-10;
  tooltip.style.left=(x+tw>window.innerWidth?e.clientX-tw-pad:x)+'px';
  tooltip.style.top=(y+th>window.innerHeight?e.clientY-th-pad:y)+'px';
}

// ── Daily list view ───────────────────────────────────────────────────────────
const FULL_DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function renderDaily(schedule) {
  if (!schedule?.length){dailyContainer.innerHTML="<p class='empty-state'>No shifts found.</p>";return;}
  const today=new Date(); today.setHours(0,0,0,0);
  schedule.forEach(entry=>{
    const date=new Date(entry.date), jsDay=date.getDay();
    const isXOnly=entry.shifts.length===1&&entry.shifts[0].toUpperCase()==='X';
    const item=document.createElement('div');
    item.className='daily-item'+(isXOnly?' leave':'')+(date.getTime()===today.getTime()?' today':'');
    const shiftsHTML=entry.shifts.map(code=>{
      if (code.toUpperCase()==='X') return `<div class="daily-shift-row"><span class="badge leave-badge">X</span><span class="daily-shift-name daily-leave-label">Beviljad ledighet</span></div>`;
      const info=getShiftInfoForDay(code,jsDay);
      if (!info) return `<div class="daily-shift-row"><span class="badge">${code}</span></div>`;
      const labelsHTML=info.labels.map(l=>`<span class="daily-label-tag">${l}</span>`).join('');
      return `<div class="daily-shift-row"><span class="badge">${code}</span><span class="daily-shift-name">${info.name}</span>${labelsHTML}${info.time?`<span class="daily-shift-time">${info.time}</span>`:''}</div>`;
    }).join('');
    item.innerHTML=`<div class="daily-date"><span class="daily-weekday">${FULL_DAYS[jsDay]}</span><span class="daily-datenum">${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}</span></div><div class="daily-shifts">${shiftsHTML}</div>`;
    dailyContainer.appendChild(item);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function showError(msg){errorMsg.textContent=msg;errorMsg.classList.remove('hidden');}
function hideError(){errorMsg.classList.add('hidden');errorMsg.textContent='';}
