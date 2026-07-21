# -*- coding: utf-8 -*-
"""Capa de almacenamiento de puntajes.

Selecciona el backend según el entorno:
  * Si existe DATABASE_URL  -> PostgreSQL (persistente, para producción/Render).
  * Si no                   -> archivo JSON local (desarrollo, sin dependencias).

La interfaz pública es mínima y estable para el resto de la app:
    add_score(entry: dict) -> None
    load_scores()          -> list[dict]
Cada 'entry' tiene: player, date, correct, total, pct, scaled, passed.
"""
import json
import os
import threading

DATABASE_URL = os.environ.get("DATABASE_URL")

# Neon/Render a veces entregan el esquema como 'postgres://'; psycopg2 y libpq
# aceptan ambos, pero lo normalizamos por claridad.
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql://" + DATABASE_URL[len("postgres://"):]

_FIELDS = ("player", "date", "correct", "total", "pct", "scaled", "passed")

_json_lock = threading.Lock()
JSON_FILE = os.environ.get(
    "SCORES_FILE",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "scores.json"),
)


# --------------------------------------------------------------------------- #
# Backend PostgreSQL
# --------------------------------------------------------------------------- #
def _pg_connect():
    import psycopg2  # import perezoso: solo se necesita si hay DATABASE_URL
    # sslmode=require es lo habitual en Neon; si la URL ya lo trae, no molesta.
    return psycopg2.connect(DATABASE_URL, sslmode=os.environ.get("PGSSLMODE", "require"))


def _pg_init():
    conn = _pg_connect()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS scores (
                    id      SERIAL PRIMARY KEY,
                    player  TEXT        NOT NULL,
                    date    TIMESTAMPTZ NOT NULL,
                    correct INTEGER     NOT NULL,
                    total   INTEGER     NOT NULL,
                    pct     REAL        NOT NULL,
                    scaled  INTEGER     NOT NULL,
                    passed  BOOLEAN     NOT NULL
                );
                """
            )
    finally:
        conn.close()


def _pg_add(entry):
    conn = _pg_connect()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "INSERT INTO scores (player, date, correct, total, pct, scaled, passed) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                tuple(entry[f] for f in _FIELDS),
            )
    finally:
        conn.close()


def _pg_load():
    conn = _pg_connect()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "SELECT player, date, correct, total, pct, scaled, passed FROM scores"
            )
            rows = cur.fetchall()
    finally:
        conn.close()
    result = []
    for r in rows:
        item = dict(zip(_FIELDS, r))
        # el resto de la app espera 'date' como texto ISO
        item["date"] = item["date"].isoformat()
        item["pct"] = round(float(item["pct"]), 1)
        result.append(item)
    return result


# --------------------------------------------------------------------------- #
# Backend JSON (local)
# --------------------------------------------------------------------------- #
def _json_load():
    if os.path.exists(JSON_FILE):
        try:
            with open(JSON_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return []
    return []


def _json_add(entry):
    with _json_lock:
        scores = _json_load()
        scores.append(entry)
        with open(JSON_FILE, "w", encoding="utf-8") as f:
            json.dump(scores, f, ensure_ascii=False, indent=2)


# --------------------------------------------------------------------------- #
# Interfaz pública
# --------------------------------------------------------------------------- #
USING_POSTGRES = bool(DATABASE_URL)


def init():
    """Prepara el backend (crea la tabla en Postgres). Idempotente."""
    if USING_POSTGRES:
        _pg_init()


def add_score(entry):
    if USING_POSTGRES:
        _pg_add(entry)
    else:
        _json_add(entry)


def load_scores():
    return _pg_load() if USING_POSTGRES else _json_load()
