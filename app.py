# -*- coding: utf-8 -*-
"""CCNA Mock Exam — servidor Flask.

Python se encarga de: seleccionar y barajar las preguntas, calificar,
guardar el historial de puntajes y generar el análisis por dominio.
"""
import os
import random
import uuid
from datetime import datetime, timezone

from flask import Flask, jsonify, render_template, request

import store
from questions import QUESTIONS, DOMAINS

app = Flask(__name__)

PASSING_PCT = 82.5          # aproximación al corte real del CCNA (825/1000)
SECONDS_PER_QUESTION = 90   # ~120 min para ~100 preguntas en el examen real

# ------------------------------------------------------------------ #
# Marca y datos legales (cámbialos aquí en un solo lugar)
# ------------------------------------------------------------------ #
BRAND = "Datamock Networking"
CONTACT_EMAIL = os.environ.get("CONTACT_EMAIL", "[TU-EMAIL]")
LEGAL_UPDATED = "julio de 2026"
# ID de cliente de Google AdSense (p. ej. "ca-pub-1234567890123456").
# Si está vacío, se muestran espacios reservados en lugar de anuncios reales.
ADSENSE_CLIENT = os.environ.get("ADSENSE_CLIENT", "")


def tpl_ctx(**extra):
    """Contexto común (marca, contacto, anuncios) para todas las plantillas."""
    ctx = dict(
        brand=BRAND,
        contact_email=CONTACT_EMAIL,
        legal_updated=LEGAL_UPDATED,
        adsense_client=ADSENSE_CLIENT,
    )
    ctx.update(extra)
    return ctx


# Prepara el backend de puntajes: crea la tabla si se usa PostgreSQL
# (DATABASE_URL); si no, se usará el archivo JSON local.
store.init()

# Sesiones de examen activas: exam_id -> lista de preguntas ya barajadas
# (guardamos el índice correcto post-barajado para calificar en el servidor).
ACTIVE_EXAMS = {}


@app.route("/")
def index():
    return render_template("index.html", **tpl_ctx())


@app.route("/privacidad")
def privacidad():
    return render_template("privacidad.html", **tpl_ctx())


@app.route("/terminos")
def terminos():
    return render_template("terminos.html", **tpl_ctx())


@app.route("/ads.txt")
def ads_txt():
    """Requerido por AdSense para autorizar la venta de tu inventario.
    Rellena tu publisher ID en la variable de entorno ADSENSE_CLIENT."""
    if ADSENSE_CLIENT:
        pub = ADSENSE_CLIENT.replace("ca-", "")
        return f"google.com, {pub}, DIRECT, f08c47fec0942fa0\n", 200, {"Content-Type": "text/plain"}
    return "# Define ADSENSE_CLIENT para generar ads.txt\n", 200, {"Content-Type": "text/plain"}


@app.route("/api/meta")
def meta():
    """Dominios disponibles con su número de preguntas (para el selector por tópico)."""
    counts = {d: 0 for d in DOMAINS}
    for q in QUESTIONS:
        counts[q["d"]] = counts.get(q["d"], 0) + 1
    return jsonify({
        "domains": [{"name": d, "count": counts[d]} for d in DOMAINS],
        "total": len(QUESTIONS),
    })


@app.route("/api/exam/start", methods=["POST"])
def start_exam():
    data = request.get_json(silent=True) or {}

    # Tópico opcional: si es un dominio válido, el examen sale solo de él.
    domain = data.get("domain")
    if domain not in DOMAINS:
        domain = None
    pool = [q for q in QUESTIONS if q["d"] == domain] if domain else QUESTIONS

    # Cantidad: se ajusta al tamaño disponible del pool (1..len(pool)).
    try:
        count = int(data.get("count", 25))
    except (TypeError, ValueError):
        count = 25
    count = max(1, min(count, len(pool)))

    picked = random.sample(pool, count)
    exam_questions = []
    for q in picked:
        order = list(range(len(q["o"])))
        random.shuffle(order)
        exam_questions.append({
            "d": q["d"],
            "q": q["q"],
            "o": [q["o"][i] for i in order],
            "a": order.index(q["a"]),   # índice correcto tras barajar (solo servidor)
            "e": q["e"],
        })

    practice = bool(data.get("practice"))

    exam_id = uuid.uuid4().hex
    ACTIVE_EXAMS[exam_id] = {"questions": exam_questions, "practice": practice}
    if len(ACTIVE_EXAMS) > 200:  # evita crecimiento sin límite en sesiones largas
        for key in list(ACTIVE_EXAMS)[:-100]:
            ACTIVE_EXAMS.pop(key, None)

    return jsonify({
        "exam_id": exam_id,
        "domain": domain,           # None => examen general
        "practice": practice,       # True => modo práctica (feedback inmediato)
        "time_limit": len(exam_questions) * SECONDS_PER_QUESTION,
        "questions": [
            {"d": q["d"], "q": q["q"], "o": q["o"]} for q in exam_questions
        ],
    })


@app.route("/api/exam/check", methods=["POST"])
def check_answer():
    """Feedback inmediato de una pregunta. Solo disponible en modo práctica,
    para no filtrar respuestas durante un examen cronometrado."""
    data = request.get_json(silent=True) or {}
    exam = ACTIVE_EXAMS.get(data.get("exam_id"))
    if exam is None or not exam.get("practice"):
        return jsonify({"error": "No disponible."}), 404

    qs = exam["questions"]
    index = data.get("index")
    if not isinstance(index, int) or not (0 <= index < len(qs)):
        return jsonify({"error": "Índice inválido."}), 400

    q = qs[index]
    answer = data.get("answer")
    given = answer if isinstance(answer, int) and 0 <= answer < len(q["o"]) else None
    return jsonify({"ok": given == q["a"], "correct": q["a"], "e": q["e"]})


@app.route("/api/exam/submit", methods=["POST"])
def submit_exam():
    data = request.get_json(silent=True) or {}
    exam_id = data.get("exam_id")
    answers = data.get("answers", [])  # lista de índices (o null) por pregunta
    player = (data.get("player") or "ANON").strip()[:12].upper() or "ANON"

    session = ACTIVE_EXAMS.pop(exam_id, None)
    if session is None:
        return jsonify({"error": "Examen no encontrado o ya enviado."}), 404
    exam = session["questions"]
    practice = session.get("practice", False)

    review = []
    domain_stats = {d: {"correct": 0, "total": 0} for d in DOMAINS}
    correct_count = 0

    for i, q in enumerate(exam):
        given = answers[i] if i < len(answers) else None
        if not isinstance(given, int) or not (0 <= given < len(q["o"])):
            given = None
        ok = given == q["a"]
        if ok:
            correct_count += 1
        stats = domain_stats.setdefault(q["d"], {"correct": 0, "total": 0})
        stats["total"] += 1
        stats["correct"] += 1 if ok else 0
        review.append({
            "d": q["d"], "q": q["q"], "o": q["o"],
            "given": given, "correct": q["a"], "ok": ok, "e": q["e"],
        })

    total = len(exam)
    pct = round(100.0 * correct_count / total, 1) if total else 0.0
    scaled = int(round(pct * 10))  # escala tipo Cisco 0-1000
    passed = pct >= PASSING_PCT

    domains = [
        {"domain": d, "correct": s["correct"], "total": s["total"],
         "pct": round(100.0 * s["correct"] / s["total"], 1) if s["total"] else None}
        for d, s in domain_stats.items() if s["total"] > 0
    ]

    # El modo práctica no puntúa en el ranking global.
    if not practice:
        store.add_score({
            "player": player,
            "date": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "correct": correct_count,
            "total": total,
            "pct": pct,
            "scaled": scaled,
            "passed": passed,
        })

    return jsonify({
        "player": player,
        "practice": practice,
        "correct": correct_count,
        "total": total,
        "pct": pct,
        "scaled": scaled,
        "passed": passed,
        "passing_pct": PASSING_PCT,
        "domains": domains,
        "review": review,
    })


@app.route("/api/scores")
def scores():
    all_scores = store.load_scores()
    # Mejores 10 por porcentaje (desempate: más preguntas, más reciente).
    top = sorted(all_scores, key=lambda s: (-s["pct"], -s["total"], s["date"]))[:10]
    recent = sorted(all_scores, key=lambda s: s["date"], reverse=True)[:10]
    players = len({s.get("player", "ANON") for s in all_scores})
    passed = sum(1 for s in all_scores if s.get("passed"))
    return jsonify({
        "top": top,
        "recent": recent,
        "attempts": len(all_scores),
        "players": players,
        "passed": passed,
    })


if __name__ == "__main__":
    # Ejecución local. En producción (Render) arranca gunicorn con 'app:app'.
    # host/puerto configurables por entorno; PORT lo inyecta el hosting.
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    app.run(host=host, port=port, debug=debug)
