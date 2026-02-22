document.addEventListener("DOMContentLoaded",()=>{
const cal=document.getElementById("calendar");
const daily=document.getElementById("daily");
const calBtn=document.getElementById("calBtn");
const dayBtn=document.getElementById("dayBtn");
const loadBtn=document.getElementById("loadBtn");
const loading=document.getElementById("loading");

calBtn.onclick=()=>toggle(true);
dayBtn.onclick=()=>toggle(false);
loadBtn.onclick=load;

function toggle(c){
  cal.classList.toggle("hidden",!c);
  daily.classList.toggle("hidden",c);
  calBtn.classList.toggle("active",c);
  dayBtn.classList.toggle("active",!c);
}

async function load(){
  const url=document.getElementById("url").value.trim();
  const id=document.getElementById("id").value.trim();
  if(!url||!id) return alert("Enter URL and ID");
  loading.classList.remove("hidden");
  cal.innerHTML=""; daily.innerHTML="";
  const r=await fetch("http://localhost:3000/api/scrape",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({url,id})
  });
  const d=await r.json();
  loading.classList.add("hidden");
  if(d.error) return alert(d.error);
  d.schedule.forEach(e=>{
    const div=document.createElement("div");
    div.className="day";
    div.innerHTML=`<strong>${e.date}</strong><br>`+e.locations.map(l=>`<span class='badge'>${l}</span>`).join("");
    cal.appendChild(div);

    const row=document.createElement("div");
    row.className="item";
    row.textContent=e.date+" — "+e.locations.join(", ");
    daily.appendChild(row);
  });
}
toggle(true);
});

// Tooltip element
const tooltip = document.getElementById("tooltip");

// Map of shift codes to place/time
const shiftReference = {
  // ---- Sälen ----
  
  "HL1": "Harrys Lindvallen 1: 22.00-01.15",
  "HT1": "Harrys Tandådalen 1: 22.00-02.15",
  "Hö1R": "Högfjällshotellet i Sälen 1: Pianobaren Roulette 20:00-02:15",
  "Hö2": "Högfjällshotellet i Sälen 2: Vinterträdgården NK 22.00-02.15",
  "Hö3": "Högfjällshotellet i Sälen 3: Nattklubb 22:00-02:15",
  "Hö4": "Högfjällshotellet i Sälen 4: 22.00-02.15",
  "HöA1": "Högfjällshotellet i Sälen 5: Afterski Vinterträdgården 15.00-18.15",
  "HöA2": "Högfjällshotellet i Sälen 6: Afterski bord 2 15.00-18.10",
  "Kl.A": "Klubb W 3: Afterki 14.30-17.15",
  "Kl1": "Klubb W 1: 22.00-02.15",
  "Kl2": "Klubb W 2: 22.00-02.15",
  "Tv": "Tvillingpass",
  "Wä1": "Wärsan 1: 22.00-02.15",
  "Wä2": "Wärsan 3: Wärsan bord 2 22.00-02.15",
  "WäA": "Wärsan 2: Dagspass afterski 15.00-17.45",

  // ---- Gothenburg ----

  "8T": "8ight 1: Fre & Lör 23.00-03.15 (kan ha öppet till 04) || 26/2 22.00-02.15 || 27/2 22.00-03.15",
  "AD": "Annat Distrikt",
  "BA": "Bar Petite 1: Fre & Lör 23.00-02.15 (kan ha öppet till 03)",
  "BP1": "Biljardpalatset Göteborg 1: Fre & Lör 19.00-03.15",
  "BP2": "Biljardpalatset Göteborg 2: Fre 22.00-03.15 || Lör 21.00-03.15",
  "DU1": "Irish Embassy 1: Sön-Tors 22.00-03.15 || Fre & Lör 21.00-05.15",
  "DU2": "Irish Embassy 2: Fre & Lör 22.00-05.15",
  "DU3": "Irish Embassy 3: Fre & Lör 23.45-05.15",
  "EV": "Event",
  "EX1": "Excet 1: Fre & Lör 23.00-05.15",
  "EX2": "Excet 2: Fre & Lör 00.00-05.15 || Inlogg Joker 23:59",
  "EX3": "Excet 3: Fre & Lör 00.00-05.15 || 24/2 22.00-02.15 || Inlogg Joker 23:59",
  "EX4": "Excet 4: Fre & Lör 23.00-05.15 || 24/2 22.00-02.15",
  "Gr1": "Grand Bingo 1: Mån-Tors 18.00-23.00 || Fre & Lör 18.00-02.00 || Kontanter || Stängning börjar 22.15 vardagar, 01.15 helger",
  "Gr2": "Grand Bingo 2: Mån-Tors 18.00-23.00 || Fre & Lör 18.00-02.00 || Kontanter || Stängning börjar 22.15 vardagar, 01.15 helger",
  "Gr4": "Grand Bingo 4: Fre & Lör 19.00-01.30 || Kontanter || Stängning börjar 01.15",
  "Gr5": "Grand Bingo 5: Fre & Lör 20.00-01.30 || Kontanter || Stängning börjar 01.15",
  "GS": "Gillestugan 1: Fre & Lör 22.00-03.15",
  "JA": "Jacy'z: Tis 20.00-00.15 || Tors & Sön 19.00-23.15 || Fre & Lör 18.00-21.00 || Alternativt 19.00-23.00 eller 21.00-01.15 beroende på pass",
  "JS": "John Scotts Mölndal 1: Fre & Lör 20.00-01.15",
  "JSA": "John Scotts Avenyn 1: Fre & Lör 20.00-02.15",
  "Ka1": "Kajskjul 105 1: 21/2 18.00-03.15",
  "Ka2": "Kajskjul 105 2: 21/2 18.00-03.15",
  "Ka3": "Kajskjul 105 3: 21/2 21.30-03.15 (rastar bord 1 i 30 min)",
  "Ka4": "Kajskjul 105 4: 21/2 21.30-03.15 (rastar bord 2 i 30 min)",
  "LB": "Lion Bar: Fre & Lör 21.00-03.15",
  "Li1": "Lilla London 1: Ons & Tors 20.00-00.15 || Fre & Lör 19.00-03.15 (kan ha öppet till 04)",
  "Li2": "Lilla London 2: Fre & Lör 22.00-03.15 (kan ha öppet till 04)",
  "Li3": "Lilla London 3: Fre & Lör 22.00-03.15 (kan ha öppet till 04)",
  "OL": "Olearys Järntorget 1: Fre & Lör 21.00-01.15",
  "OP": "Ospecificerat Pass: Ring schematelefon kl 16.00 (0708-85 15 55)",
  "PL1": "Park Lane 1: Fre & Lör 23.00-05.15 || Sön 23.00-03.15",
  "PL2": "Park Lane 2: Fre & Lör 23.00-05.15 || Sön 23.00-03.15",
  "PZ": "Plaza Göteborg 1: Fre & Lör 20.00-00.15 (kan ha öppet till 01) || Platsnummer 17092",
  "RB1": "Rockbaren 1: Tors 22.00-03.15 || Fre & Lör 21.00-03.15 (kan ha öppet till 04) || 25/2 21.30-03.15",
  "RB2": "Rockbaren 2: 25/2 21.30-03.15",
  "Si": "Sing Sing Göteborg 1: Fre & Lör 22.00-03.15",
  "SÄ": "Säsong",
  "TG": "TG Valandhuset 1: Fre & Lör 22.00-02.15 (kan ha öppet till 03/04) || Platsnummer 17107 || Kodlås 170",
  "TP": "Tvillingpass",
  "TR1": "Trädgårn Göteborg 1: 6/2 23.00-04.15 || 7/2 22.00-02.15 || 14/2 23.00-03.15 || 23-24/2 22.00-02.15 || 27/2 23.00-03.15",
  "TR2": "Trädgårn Göteborg 2: 6/2 23.00-04.15 || 23-24/2 22.00-02.15 || 27/2 23.00-03.15",
  "VA": "Valand 1: Fre & Lör 23.00-03.15 (kan ha öppet till 04/05)",
  "VI": "Viiva 1: Fre & Lör 21.00-01.30 (kan ha öppet till 02)",
  "ÅB1": "Åby 1: 14/2 15.00-21.15"
};


// Event delegation: works for dynamic badges
document.getElementById("calendar").addEventListener("mouseover", (e) => {
  const badge = e.target.closest(".badge");
  if (!badge) return;

  const code = badge.textContent.trim();
  if (!shiftReference[code]) return;

  tooltip.textContent = shiftReference[code];
  tooltip.classList.add("show");
});

document.getElementById("calendar").addEventListener("mousemove", (e) => {
  if (!tooltip.classList.contains("show")) return;

  const offset = 12;
  const tooltipRect = tooltip.getBoundingClientRect();
  let left = e.pageX + offset;
  let top = e.pageY + offset;

  // Keep inside viewport
  if (left + tooltipRect.width > window.scrollX + window.innerWidth) {
    left = e.pageX - tooltipRect.width - offset;
  }
  if (top + tooltipRect.height > window.scrollY + window.innerHeight) {
    top = e.pageY - tooltipRect.height - offset;
  }

  tooltip.style.left = left + "px";
  tooltip.style.top = top + "px";
});

document.getElementById("calendar").addEventListener("mouseout", (e) => {
  if (!e.target.closest(".badge")) return;
  tooltip.classList.remove("show");
});
