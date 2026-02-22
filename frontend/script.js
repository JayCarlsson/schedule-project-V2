const form = document.getElementById("form");
const loading = document.getElementById("loading");
const scheduleContainer = document.getElementById("schedule");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const url = document.getElementById("url").value;
  const id = document.getElementById("employeeId").value;

  loading.classList.remove("hidden");
  scheduleContainer.innerHTML = "";

  try {
    const response = await fetch("/api/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url, id })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    renderSchedule(data.schedule);

  } catch (err) {
    alert("Error: " + err.message);
  } finally {
    loading.classList.add("hidden");
  }
});

function renderSchedule(schedule) {
  if (!schedule || schedule.length === 0) {
    scheduleContainer.innerHTML = "<p>No shifts found.</p>";
    return;
  }

  schedule.forEach(entry => {
    const div = document.createElement("div");
    div.classList.add("shift-card");

    div.innerHTML = `
      <h3>${entry.date}</h3>
      <p>${entry.shifts.join(", ")}</p>
    `;

    scheduleContainer.appendChild(div);
  });
}