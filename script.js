const API_BASE_URL = "http://127.0.0.1:8000";

const RING_CIRCUMFERENCE = 2 * Math.PI * 86; // matches r=86 in the SVG

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("api-url-display").textContent = API_BASE_URL;

  setupTheme();
  setupSliders();
  setupPillGroups();
  setupForm();
  setupReset();
});

// ---------- Theme toggle (persisted) ----------

function setupTheme() {
  const root = document.documentElement;
  const toggleBtn = document.getElementById("theme-toggle");
  const icon = document.getElementById("theme-icon");

  const saved = localStorage.getItem("mh-theme");
  const preferred = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(preferred);

  toggleBtn.addEventListener("click", () => {
    const current = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("mh-theme", next);
  });

  function applyTheme(mode) {
    if (mode === "dark") {
      root.setAttribute("data-theme", "dark");
      icon.innerHTML = "&#9789;"; // moon
    } else {
      root.removeAttribute("data-theme");
      icon.innerHTML = "&#9728;"; // sun
    }
  }
}

// ---------- Sliders: keep the live "X hrs" label in sync ----------

function setupSliders() {
  const sliderIds = [
    "avg_daily_usage_hours",
    "study_hours",
    "physical_activity_hours",
    "sleep_hours_per_night",
  ];

  sliderIds.forEach((id) => {
    const slider = document.getElementById(id);
    const valueLabel = document.getElementById(`${id}-value`);

    const updateLabel = () => {
      valueLabel.textContent = `${parseFloat(slider.value).toFixed(1)} hrs`;
      valueLabel.style.transform = "scale(1.15)";
      setTimeout(() => (valueLabel.style.transform = "scale(1)"), 120);
    };

    slider.addEventListener("input", updateLabel);
    updateLabel();
  });
}

// ---------- Pill toggle groups (gender, stress level) ----------

function setupPillGroups() {
  document.querySelectorAll(".pill-group").forEach((group) => {
    group.addEventListener("click", (event) => {
      const btn = event.target.closest(".pill");
      if (!btn) return;

      group.querySelectorAll(".pill").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

function getPillValue(fieldName) {
  const group = document.querySelector(`.pill-group[data-field="${fieldName}"]`);
  const active = group.querySelector(".pill.active");
  return active ? active.dataset.value : null;
}

// ---------- Form submit -> processing sequence -> POST /predict ----------

function setupForm() {
  const form = document.getElementById("predict-form");
  form.addEventListener("submit", handleSubmit);
}

async function handleSubmit(event) {
  event.preventDefault();

  const errorEl = document.getElementById("form-error");
  errorEl.hidden = true;

  const payload = buildPayload();

  setLoading(true);
  showProcessing();

  const minAnimationTime = wait(1900);
  const stepsAnimation = runProcessingSteps();

  try {
    const [response] = await Promise.all([
      fetch(`${API_BASE_URL}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      minAnimationTime,
    ]);

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new Error(describeApiError(response.status, errorBody));
    }

    const data = await response.json();
    hideProcessing();
    showResult(data.predicted_mental_health_score, payload);
  } catch (err) {
    hideProcessing();
    showError(err.message);
  } finally {
    setLoading(false);
    clearTimeout(stepsAnimation);
  }
}

function buildPayload() {
  const form = document.getElementById("predict-form");

  return {
    age: parseInt(form.age.value, 10),
    gender: getPillValue("gender"),
    country: form.country.value.trim(),
    academic_level: form.academic_level.value,
    most_used_platform: form.most_used_platform.value,
    purpose_of_use: form.purpose_of_use.value,
    avg_daily_usage_hours: parseFloat(form.avg_daily_usage_hours.value),
    daily_unlocks: parseInt(form.daily_unlocks.value, 10),
    study_hours: parseFloat(form.study_hours.value),
    physical_activity_hours: parseFloat(form.physical_activity_hours.value),
    sleep_hours_per_night: parseFloat(form.sleep_hours_per_night.value),
    stress_level: getPillValue("stress_level"),
  };
}

function describeApiError(status, body) {
  if (status === 422 && body && Array.isArray(body.detail)) {
    const first = body.detail[0];
    const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : "a field";
    return `Check "${field}": ${first.msg}`;
  }
  if (status === 0) {
    return "Could not reach the API. Is the FastAPI server running?";
  }
  return `The API returned an error (status ${status}). Please try again.`;
}

function setLoading(isLoading) {
  const submitBtn = document.getElementById("submit-btn");
  submitBtn.disabled = isLoading;
}

function showError(message) {
  const errorEl = document.getElementById("form-error");
  errorEl.textContent = message || "Something went wrong. Please check your connection and try again.";
  errorEl.hidden = false;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- Processing sequence ----------

function showProcessing() {
  document.getElementById("predict-form").style.display = "none";
  const card = document.getElementById("processing-card");
  card.hidden = false;
  document.querySelectorAll("#processing-steps li").forEach((li) => li.classList.remove("active", "done"));
  card.scrollIntoView({ behavior: "smooth", block: "center" });
}

function hideProcessing() {
  document.getElementById("processing-card").hidden = true;
  document.getElementById("predict-form").style.display = "flex";
}

function runProcessingSteps() {
  const steps = document.querySelectorAll("#processing-steps li");
  let i = 0;

  function activateNext() {
    if (i > 0) steps[i - 1].classList.remove("active");
    if (i > 0) steps[i - 1].classList.add("done");
    if (i < steps.length) {
      steps[i].classList.add("active");
      i++;
      return setTimeout(activateNext, 450);
    }
  }
  return activateNext();
}

// ---------- Result card ----------

function showResult(score, inputs) {
  const clamped = Math.max(0, Math.min(10, score));
  const band = getScoreBand(clamped);

  applyScoreTheme(band.color);
  document.getElementById("result-label").textContent = band.label;

  animateCountUp(score);
  animateRing(clamped);
  renderInsightChips(inputs);

  const resultCard = document.getElementById("result-card");
  resultCard.hidden = false;
  resultCard.scrollIntoView({ behavior: "smooth", block: "center" });

  if (band.celebrate) {
    launchConfetti();
  }
}

function getScoreBand(score) {
  if (score >= 7.5) return { label: "Thriving", color: "var(--sage)", celebrate: true };
  if (score >= 6.0) return { label: "Steady", color: "var(--coral)", celebrate: false };
  if (score >= 4.5) return { label: "Strained", color: "var(--amber)", celebrate: false };
  return { label: "Struggling \u2014 be kind to yourself", color: "var(--coral)", celebrate: false };
}

function applyScoreTheme(colorVar) {
  document.documentElement.style.setProperty("--score-color", colorVar);
}

function animateCountUp(target) {
  const el = document.getElementById("result-score");
  const duration = 1200;
  const start = performance.now();

  function tick(now) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = target * eased;
    el.textContent = value.toFixed(1);
    if (progress < 1) requestAnimationFrame(tick);
    else el.textContent = target.toFixed(1);
  }
  requestAnimationFrame(tick);
}

function animateRing(score) {
  const ring = document.getElementById("ring-fill");
  const percent = score / 10;
  const offset = RING_CIRCUMFERENCE * (1 - percent);
  // force reflow so the transition always plays, even on repeat submits
  ring.style.transition = "none";
  ring.style.strokeDashoffset = RING_CIRCUMFERENCE;
  void ring.offsetWidth;
  ring.style.transition = "";
  requestAnimationFrame(() => {
    ring.style.strokeDashoffset = offset;
  });
}

function renderInsightChips(inputs) {
  const chips = [];

  if (inputs.sleep_hours_per_night >= 7) chips.push({ text: "Well-rested", status: "good" });
  else if (inputs.sleep_hours_per_night >= 5) chips.push({ text: "Sleep could improve", status: "ok" });
  else chips.push({ text: "Low sleep", status: "watch" });

  if (inputs.avg_daily_usage_hours <= 3) chips.push({ text: "Light screen time", status: "good" });
  else if (inputs.avg_daily_usage_hours <= 6) chips.push({ text: "Moderate screen time", status: "ok" });
  else chips.push({ text: "High screen time", status: "watch" });

  if (inputs.physical_activity_hours >= 1) chips.push({ text: "Active lifestyle", status: "good" });
  else if (inputs.physical_activity_hours >= 0.3) chips.push({ text: "Some activity", status: "ok" });
  else chips.push({ text: "Low activity", status: "watch" });

  if (inputs.stress_level === "Low") chips.push({ text: "Low stress", status: "good" });
  else if (inputs.stress_level === "Medium") chips.push({ text: "Moderate stress", status: "ok" });
  else chips.push({ text: `${inputs.stress_level} stress`, status: "watch" });

  const container = document.getElementById("insight-chips");
  container.innerHTML = chips
    .map((c) => `<span class="chip"><span class="chip-dot ${c.status}"></span>${c.text}</span>`)
    .join("");
}

// ---------- Reset ----------

function setupReset() {
  document.getElementById("reset-btn").addEventListener("click", () => {
    document.getElementById("result-card").hidden = true;
    document.getElementById("predict-form").scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

// ---------- Gentle confetti (only for high scores) ----------

function launchConfetti() {
  const canvas = document.getElementById("confetti-canvas");
  const card = document.getElementById("result-card");
  const ctx = canvas.getContext("2d");

  const rect = card.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  const colors = ["#8FAE94", "#E2775B", "#D6A24C", "#24443F"];
  const particles = Array.from({ length: 60 }, () => ({
    x: canvas.width / 2,
    y: canvas.height * 0.25,
    vx: (Math.random() - 0.5) * 6,
    vy: Math.random() * -5 - 2,
    size: Math.random() * 5 + 3,
    color: colors[Math.floor(Math.random() * colors.length)],
    rotation: Math.random() * 360,
    vr: (Math.random() - 0.5) * 10,
    life: 0,
  }));

  const gravity = 0.15;
  let frame = 0;
  const maxFrames = 90;

  function step() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frame++;

    particles.forEach((p) => {
      p.vy += gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.vr;
      p.life = frame / maxFrames;

      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    });

    if (frame < maxFrames) {
      requestAnimationFrame(step);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  requestAnimationFrame(step);
}
