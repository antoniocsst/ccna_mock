/* CCNA MOCK EXAM — lógica de cliente.
   El servidor (Python) elige y baraja las preguntas, califica y guarda puntajes;
   aquí solo se navega el examen y se pinta el resultado. */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const OPTION_KEYS = ["A", "B", "C", "D", "E", "F"];

  // Acento de color por dominio: unifica HUD, tópicos y análisis.
  const DOMAIN_COLORS = {
    "Fundamentos de Red": "var(--cyan)",
    "Acceso a la Red": "var(--green)",
    "Conectividad IP": "var(--purple)",
    "Servicios IP": "var(--yellow)",
    "Seguridad": "var(--red)",
    "Automatización": "var(--orange)",
  };
  const domainColor = (d) => DOMAIN_COLORS[d] || "var(--cyan)";

  const state = {
    examId: null,
    questions: [],
    answers: [],
    current: 0,
    timeLimit: 0,
    timeLeft: 0,
    timerId: null,
    player: "ANON",
    count: 25,
    mode: "general",   // 'general' | 'topic'
    domain: null,      // nombre del dominio cuando mode === 'topic'
    play: "exam",      // 'exam' | 'practice'
    practice: false,   // reflejo de la respuesta del servidor
    feedback: [],      // en práctica: {ok, correct, e} por pregunta ya respondida
    review: [],
    domains: [],       // [{name, count}] desde /api/meta
    total: 100,
  };

  /* ---------- navegación entre pantallas ---------- */
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $(id).classList.add("active");
    window.scrollTo({ top: 0 });
  }

  /* ---------- pantalla de inicio: modo / tópico / cantidad ---------- */
  // Máximo de preguntas disponible según el modo/tópico seleccionado.
  function maxAvailable() {
    if (state.mode === "topic" && state.domain) {
      const d = state.domains.find((x) => x.name === state.domain);
      return d ? d.count : state.total;
    }
    return state.total;
  }

  // Habilita/inhabilita botones de cantidad según lo disponible y ajusta la
  // selección si la actual ya no cabe.
  function refreshCountButtons() {
    const max = maxAvailable();
    const btns = $$("#count-picker .count-btn");
    let selectedValid = false;
    btns.forEach((b) => {
      const val = parseInt(b.dataset.count, 10);
      const disabled = val > max;
      b.disabled = disabled;
      b.classList.toggle("disabled", disabled);
      if (b.classList.contains("selected")) {
        if (disabled) b.classList.remove("selected");
        else selectedValid = true;
      }
    });
    if (!selectedValid) {
      // elige el mayor valor que quepa
      const fits = btns.filter((b) => parseInt(b.dataset.count, 10) <= max);
      const pick = fits[fits.length - 1] || btns[0];
      pick.classList.add("selected");
      state.count = Math.min(parseInt(pick.dataset.count, 10), max);
    }
    const hint = $("#count-hint");
    if (state.mode === "topic" && state.domain) {
      hint.textContent = `» ${state.domain}: ${max} preguntas disponibles`;
    } else {
      hint.textContent = `» banco completo: ${state.total} preguntas`;
    }
  }

  $$("#count-picker .count-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      $$("#count-picker .count-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      state.count = Math.min(parseInt(btn.dataset.count, 10), maxAvailable());
    });
  });

  // Selector de modo (general vs por tópico)
  $$(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".mode-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      state.mode = btn.dataset.mode;
      const topicBlock = $("#topic-block");
      if (state.mode === "topic") {
        topicBlock.classList.remove("hidden");
        if (!state.domain && state.domains.length) selectTopic(state.domains[0].name);
      } else {
        topicBlock.classList.add("hidden");
        state.domain = null;
      }
      refreshCountButtons();
    });
  });

  function selectTopic(name) {
    state.domain = name;
    $$("#topic-picker .topic-btn").forEach((b) =>
      b.classList.toggle("selected", b.dataset.domain === name));
    refreshCountButtons();
  }

  // Selector de juego (examen cronometrado vs práctica con feedback)
  $$(".play-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".play-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      state.play = btn.dataset.play;
      $("#play-hint").textContent = state.play === "practice"
        ? "» sin tiempo · corrige al instante y explica · no puntúa"
        : "» examen cronometrado · puntúa en el ranking";
    });
  });

  // Construye los botones de tópico desde /api/meta
  async function loadMeta() {
    try {
      const data = await (await fetch("/api/meta")).json();
      state.domains = data.domains;
      state.total = data.total;
      const tag = $(".tagline");
      if (tag) tag.innerHTML = `&gt;&gt; ${data.total} preguntas esenciales 200-301 &lt;&lt;`;
      const picker = $("#topic-picker");
      picker.innerHTML = "";
      data.domains.forEach((d) => {
        const b = document.createElement("button");
        b.className = "topic-btn";
        b.dataset.domain = d.name;
        b.style.setProperty("--accent", domainColor(d.name));
        b.innerHTML = `<span class="topic-dot"></span><span class="topic-name">${escapeHtml(d.name)}</span><span class="topic-count">${d.count}</span>`;
        b.addEventListener("click", () => selectTopic(d.name));
        picker.appendChild(b);
      });
      refreshCountButtons();
    } catch (_) { /* meta no disponible: se queda el modo general */ }
  }

  function animateCount(el, target) {
    const start = parseInt(el.textContent, 10) || 0;
    if (start === target) return;
    const steps = 18;
    let i = 0;
    const tick = () => {
      i++;
      el.textContent = Math.round(start + (target - start) * (i / steps));
      if (i < steps) setTimeout(tick, 25);
      else el.textContent = target;
    };
    tick();
  }

  async function loadHighScores() {
    try {
      const res = await fetch("/api/scores");
      const data = await res.json();
      animateCount($("#stat-attempts"), data.attempts || 0);
      animateCount($("#stat-players"), data.players || 0);
      animateCount($("#stat-passed"), data.passed || 0);
      const list = $("#highscore-list");
      list.innerHTML = "";
      if (!data.top.length) {
        list.innerHTML = '<li class="score-empty">SIN REGISTROS...</li>';
        return;
      }
      data.top.forEach((s, i) => {
        const li = document.createElement("li");
        const passCls = s.passed ? "" : " fail";
        const medal = ["🥇", "🥈", "🥉"][i] || `${i + 1}.`;
        li.innerHTML =
          `<span><span class="score-rank">${medal}</span>${escapeHtml(s.player)}</span>` +
          `<span class="score-val${passCls}">${s.scaled}/1000 (${s.correct}/${s.total})</span>`;
        list.appendChild(li);
      });
    } catch (_) { /* servidor sin historial aún */ }
  }

  $("#btn-start").addEventListener("click", startExam);

  async function startExam() {
    state.player = ($("#player-name").value.trim() || "ANON").toUpperCase().slice(0, 12);
    const btn = $("#btn-start");
    btn.disabled = true;
    btn.textContent = "CARGANDO...";
    try {
      const res = await fetch("/api/exam/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count: state.count,
          domain: state.mode === "topic" ? state.domain : null,
          practice: state.play === "practice",
        }),
      });
      const data = await res.json();
      state.examId = data.exam_id;
      state.practice = !!data.practice;
      state.questions = data.questions;
      state.answers = new Array(data.questions.length).fill(null);
      state.feedback = new Array(data.questions.length).fill(null);
      state.current = 0;
      state.timeLimit = data.time_limit;
      state.timeLeft = data.time_limit;
      buildDots();
      renderQuestion();
      if (state.practice) {
        // sin cronómetro: barra llena y reloj en infinito
        clearInterval(state.timerId);
        $(".hud-timer").classList.remove("low");
        $("#hud-time").textContent = "∞";
        const fill = $("#time-fill");
        fill.className = "hp-fill"; fill.style.width = "100%";
      } else {
        startTimer();
      }
      showScreen("#screen-exam");
    } catch (err) {
      alert("No se pudo iniciar el examen. ¿Está corriendo el servidor?");
    } finally {
      btn.disabled = false;
      btn.innerHTML = "&#9654; PRESS START";
    }
  }

  /* ---------- temporizador ---------- */
  function startTimer() {
    clearInterval(state.timerId);
    updateTimerUI();
    state.timerId = setInterval(() => {
      state.timeLeft -= 1;
      updateTimerUI();
      if (state.timeLeft <= 0) {
        clearInterval(state.timerId);
        submitExam(true);
      }
    }, 1000);
  }

  function updateTimerUI() {
    const m = Math.floor(state.timeLeft / 60);
    const s = state.timeLeft % 60;
    $("#hud-time").textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    const ratio = state.timeLimit ? state.timeLeft / state.timeLimit : 0;
    const fill = $("#time-fill");
    fill.style.width = `${ratio * 100}%`;
    fill.classList.toggle("mid", ratio <= 0.5 && ratio > 0.2);
    fill.classList.toggle("low", ratio <= 0.2);
    $(".hud-timer").classList.toggle("low", ratio <= 0.1);
  }

  /* ---------- render del examen ---------- */
  function buildDots() {
    const dots = $("#dots");
    dots.innerHTML = "";
    state.questions.forEach(() => {
      const d = document.createElement("span");
      d.className = "dot";
      dots.appendChild(d);
    });
  }

  function updateDots() {
    document.querySelectorAll("#dots .dot").forEach((d, i) => {
      d.classList.toggle("answered", state.answers[i] !== null);
      d.classList.toggle("current", i === state.current);
    });
  }

  function renderQuestion() {
    const q = state.questions[state.current];
    const card = $("#question-card");
    card.classList.remove("slide");
    void card.offsetWidth; // reinicia la animación
    card.classList.add("slide");

    $("#hud-progress").textContent = `${state.current + 1}/${state.questions.length}`;
    const hudDomain = $("#hud-domain");
    hudDomain.textContent = q.d.toUpperCase();
    hudDomain.style.color = domainColor(q.d);
    $("#question-text").textContent = q.q;

    const fb = state.feedback[state.current];   // en práctica: null hasta responder
    const picked = state.answers[state.current];
    const opts = $("#options");
    opts.innerHTML = "";
    q.o.forEach((text, i) => {
      const b = document.createElement("button");
      let cls = "option" + (picked === i ? " picked" : "");
      if (fb) {  // práctica ya respondida: revela correcta/incorrecta
        if (i === fb.correct) cls += " correct";
        else if (i === picked) cls += " wrong";
      }
      b.className = cls;
      b.innerHTML = `<span class="opt-key">${OPTION_KEYS[i]}&gt;</span><span>${escapeHtml(text)}</span>`;
      if (!fb) b.addEventListener("click", () => onPick(i));  // bloqueado tras responder en práctica
      opts.appendChild(b);
    });

    // panel de feedback (solo modo práctica)
    const fbBox = $("#practice-feedback");
    if (fb) {
      fbBox.classList.remove("hidden");
      const v = $("#feedback-verdict");
      v.textContent = fb.ok ? "✔ ¡CORRECTO!" : "✘ INCORRECTO";
      v.className = "feedback-verdict " + (fb.ok ? "good" : "bad");
      $("#feedback-exp").textContent = fb.e;
    } else {
      fbBox.classList.add("hidden");
    }

    $("#btn-prev").disabled = state.current === 0;
    const last = state.current === state.questions.length - 1;
    $("#btn-next").disabled = last;
    const allAnswered = state.answers.every((a) => a !== null);
    $("#btn-finish").classList.toggle("hidden", !(last || allAnswered));
    updateDots();
  }

  // Selección de una opción: en examen avanza solo; en práctica corrige al instante.
  function onPick(i) {
    if (state.practice) {
      if (state.feedback[state.current]) return;   // ya respondida: bloqueada
      state.answers[state.current] = i;
      checkPractice(state.current, i);
    } else {
      state.answers[state.current] = i;
      renderQuestion();
      if (state.current < state.questions.length - 1) {
        setTimeout(() => { state.current += 1; renderQuestion(); }, 350);
      }
    }
  }

  async function checkPractice(index, answer) {
    try {
      const res = await fetch("/api/exam/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exam_id: state.examId, index: index, answer: answer }),
      });
      const data = await res.json();
      state.feedback[index] = { ok: data.ok, correct: data.correct, e: data.e };
    } catch (_) {
      state.feedback[index] = { ok: false, correct: answer, e: "(sin conexión con el servidor)" };
    }
    renderQuestion();
  }

  $("#btn-prev").addEventListener("click", () => { if (state.current > 0) { state.current -= 1; renderQuestion(); } });
  $("#btn-next").addEventListener("click", () => { if (state.current < state.questions.length - 1) { state.current += 1; renderQuestion(); } });

  $("#btn-finish").addEventListener("click", () => {
    const unanswered = state.answers.filter((a) => a === null).length;
    if (unanswered > 0 && !confirm(`Tienes ${unanswered} pregunta(s) sin responder. ¿Terminar igual?`)) return;
    submitExam(false);
  });

  /* atajos de teclado: A-D responden, flechas navegan */
  document.addEventListener("keydown", (ev) => {
    if (!$("#screen-exam").classList.contains("active")) return;
    const idx = OPTION_KEYS.indexOf(ev.key.toUpperCase());
    if (idx >= 0 && idx < state.questions[state.current].o.length) {
      document.querySelectorAll("#options .option")[idx].click();
    } else if (ev.key === "ArrowLeft") { $("#btn-prev").click(); }
    else if (ev.key === "ArrowRight") { $("#btn-next").click(); }
  });

  /* ---------- envío y resultados ---------- */
  async function submitExam(timeout) {
    clearInterval(state.timerId);
    try {
      const res = await fetch("/api/exam/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exam_id: state.examId, answers: state.answers, player: state.player }),
      });
      if (!res.ok) throw new Error("submit failed");
      const data = await res.json();
      renderResults(data, timeout);
      showScreen("#screen-results");
      loadHighScores();
    } catch (err) {
      alert("Error al enviar el examen.");
    }
  }

  function renderResults(data, timeout) {
    const banner = $("#result-banner");
    banner.className = "result-banner " + (data.passed ? "pass" : "fail");
    if (data.practice) {
      banner.textContent = data.passed ? "★ PRÁCTICA OK ★" : "▸ PRÁCTICA COMPLETA";
    } else {
      banner.textContent = data.passed ? "★ APROBADO ★" : (timeout ? "⏰ TIEMPO AGOTADO" : "GAME OVER");
    }

    $("#score-scaled").textContent = data.scaled;
    $("#score-correct").textContent = `${data.correct}/${data.total}`;
    $("#score-pct").textContent = `${data.pct}%`;

    const fill = $("#score-fill");
    fill.className = "hp-fill " + (data.pct >= data.passing_pct ? "" : data.pct >= 60 ? "mid" : "low");
    fill.style.width = "0";
    setTimeout(() => { fill.style.width = `${data.pct}%`; }, 120);

    // análisis por dominio
    const analysis = $("#domain-analysis");
    analysis.innerHTML = "";
    data.domains.forEach((d) => {
      const cls = d.pct >= 80 ? "good" : d.pct >= 55 ? "mid" : "bad";
      const row = document.createElement("div");
      row.className = "domain-row";
      row.innerHTML =
        `<div class="domain-name"><span>${escapeHtml(d.domain)}</span>` +
        `<span class="domain-pct">${d.correct}/${d.total} (${d.pct}%)</span></div>` +
        `<div class="domain-bar"><div class="domain-fill ${cls}"></div></div>`;
      analysis.appendChild(row);
      setTimeout(() => { row.querySelector(".domain-fill").style.width = `${d.pct}%`; }, 150);
    });

    state.review = data.review;
    renderReview("all");
    if (data.passed) launchConfetti();
  }

  function renderReview(filter) {
    const list = $("#review-list");
    list.innerHTML = "";
    state.review.forEach((r, i) => {
      if (filter === "wrong" && r.ok) return;
      if (filter === "right" && !r.ok) return;
      const item = document.createElement("div");
      item.className = "review-item " + (r.ok ? "ok" : "bad");
      let answersHtml = `<p class="review-ans right">&#10004; Correcta: ${OPTION_KEYS[r.correct]}) ${escapeHtml(r.o[r.correct])}</p>`;
      if (!r.ok) {
        answersHtml = (r.given === null
          ? '<p class="review-ans wrong">&#10008; Sin responder</p>'
          : `<p class="review-ans wrong">&#10008; Tu respuesta: ${OPTION_KEYS[r.given]}) ${escapeHtml(r.o[r.given])}</p>`)
          + answersHtml;
      }
      item.innerHTML =
        `<span class="review-tag">${r.ok ? "CORRECTA" : "INCORRECTA"}</span>` +
        `<span class="review-domain" style="color:${domainColor(r.d)}"> ${escapeHtml(r.d)}</span>` +
        `<p class="review-q">${i + 1}. ${escapeHtml(r.q)}</p>` +
        answersHtml +
        `<p class="review-exp">&#128161; ${escapeHtml(r.e)}</p>`;
      list.appendChild(item);
    });
    if (!list.children.length) {
      list.innerHTML = '<p class="score-empty" style="font-size:.6rem;text-align:center">NADA QUE MOSTRAR AQUÍ</p>';
    }
  }

  document.querySelectorAll(".review-filter .count-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".review-filter .count-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      renderReview(btn.dataset.filter);
    });
  });

  /* ---------- confetti pixelado ---------- */
  function launchConfetti() {
    const box = $("#confetti");
    box.innerHTML = "";
    const colors = ["#00e08f", "#ffd23f", "#35d0ff", "#ff5964", "#b967ff"];
    for (let i = 0; i < 90; i++) {
      const p = document.createElement("span");
      p.className = "confetti-px";
      p.style.left = `${Math.random() * 100}%`;
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = `${2.2 + Math.random() * 2.5}s`;
      p.style.animationDelay = `${Math.random() * 1.2}s`;
      box.appendChild(p);
    }
    setTimeout(() => { box.innerHTML = ""; }, 6500);
  }

  /* ---------- acciones finales ---------- */
  $("#btn-retry").addEventListener("click", startExam);
  $("#btn-home").addEventListener("click", () => { loadHighScores(); showScreen("#screen-start"); });

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  loadMeta();
  loadHighScores();
})();
