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
  "WäA": "Wärsan 2: Dagspass afterski 15.00-17.45"
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
