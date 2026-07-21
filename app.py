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

# Prepara el backend de puntajes: crea la tabla si se usa PostgreSQL
# (DATABASE_URL); si no, se usará el archivo JSON local.
store.init()

# Sesiones de examen activas: exam_id -> lista de preguntas ya barajadas
# (guardamos el índice correcto post-barajado para calificar en el servidor).
ACTIVE_EXAMS = {}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/exam/start", methods=["POST"])
def start_exam():
    data = request.get_json(silent=True) or {}
    count = data.get("count", 25)
    if count not in (10, 25, 50, 100):
        count = 25

    picked = random.sample(QUESTIONS, min(count, len(QUESTIONS)))
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

    exam_id = uuid.uuid4().hex
    ACTIVE_EXAMS[exam_id] = exam_questions
    if len(ACTIVE_EXAMS) > 200:  # evita crecimiento sin límite en sesiones largas
        for key in list(ACTIVE_EXAMS)[:-100]:
            ACTIVE_EXAMS.pop(key, None)

    return jsonify({
        "exam_id": exam_id,
        "time_limit": len(exam_questions) * SECONDS_PER_QUESTION,
        "questions": [
            {"d": q["d"], "q": q["q"], "o": q["o"]} for q in exam_questions
        ],
    })


@app.route("/api/exam/submit", methods=["POST"])
def submit_exam():
    data = request.get_json(silent=True) or {}
    exam_id = data.get("exam_id")
    answers = data.get("answers", [])  # lista de índices (o null) por pregunta
    player = (data.get("player") or "ANON").strip()[:12].upper() or "ANON"

    exam = ACTIVE_EXAMS.pop(exam_id, None)
    if exam is None:
        return jsonify({"error": "Examen no encontrado o ya enviado."}), 404

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
    return jsonify({"top": top, "recent": recent, "attempts": len(all_scores)})


if __name__ == "__main__":
    # Ejecución local. En producción (Render) arranca gunicorn con 'app:app'.
    # host/puerto configurables por entorno; PORT lo inyecta el hosting.
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    app.run(host=host, port=port, debug=debug)
