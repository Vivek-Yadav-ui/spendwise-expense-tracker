"""
Spendwise — Flask backend
Requires: Python 3.13.6 · Flask 3.1.x · psycopg2-binary 2.9.x
"""

from __future__ import annotations

import os
import tomllib
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras
from flask import Flask, Response, jsonify, render_template, request

# ── App ────────────────────────────────────────────────────────────────────────

app = Flask(__name__)


# ── Config ────────────────────────────────────────────────────────────────────

_CONFIG_FILE = Path(__file__).parent / "config.toml"

def _load_config() -> dict[str, Any]:
    if _CONFIG_FILE.exists():                   # local dev — reads config.toml
        with _CONFIG_FILE.open("rb") as f:
            return tomllib.load(f)
    return {                                    # on Render — reads env vars
        "database": {
            "host":     os.environ["DB_HOST"],
            "port":     os.environ["DB_PORT"],
            "name":     os.environ["DB_NAME"],
            "user":     os.environ["DB_USER"],
            "password": os.environ["DB_PASSWORD"],
        }
    }

_cfg = _load_config()
_DB  = _cfg["database"]


# ── Database ──────────────────────────────────────────────────────────────────

def _db_params() -> dict[str, Any]:
    return {
        "host":     _DB["host"],
        "port":     int(_DB["port"]),
        "dbname":   _DB["name"],
        "user":     _DB["user"],
        "password": _DB["password"],
    }


@contextmanager
def get_db():
    """Context-manager that yields a connection and always closes it."""
    conn = psycopg2.connect(**_db_params())
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _row(conn, query: str, params: tuple = ()) -> dict[str, Any]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(query, params)
        return dict(cur.fetchone())


def _rows(conn, query: str, params: tuple = ()) -> list[dict[str, Any]]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(query, params)
        return [dict(r) for r in cur.fetchall()]


def _scalar(conn, query: str, params: tuple = ()) -> Any:
    with conn.cursor() as cur:
        cur.execute(query, params)
        return cur.fetchone()[0]


def _exec(conn, query: str, params: tuple = ()) -> None:
    with conn.cursor() as cur:
        cur.execute(query, params)


def _execmany(conn, query: str, seq) -> None:
    with conn.cursor() as cur:
        cur.executemany(query, seq)


# ── CORS helper ───────────────────────────────────────────────────────────────

def _cors(response: Response) -> Response:
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
    return response

app.after_request(_cors)

@app.route("/api/<path:_>", methods=["OPTIONS"])
def _options(_: str) -> Response:
    return _cors(app.make_default_options_response())


# ── DB Init ───────────────────────────────────────────────────────────────────

_DEFAULT_CATEGORIES: list[tuple[str, str, str]] = [
    ("Food & Dining",     "#f59e0b", "🍔"),
    ("Transport",         "#3b82f6", "🚗"),
    ("Shopping",          "#ec4899", "🛍️"),
    ("Entertainment",     "#8b5cf6", "🎬"),
    ("Health",            "#10b981", "💊"),
    ("Bills & Utilities", "#ef4444", "⚡"),
    ("Travel",            "#06b6d4", "✈️"),
    ("Other",             "#6b7280", "📦"),
]

def init_db() -> None:
    with get_db() as conn:
        _exec(conn, """
            CREATE TABLE IF NOT EXISTS categories (
                id         SERIAL PRIMARY KEY,
                name       VARCHAR(100) NOT NULL UNIQUE,
                color      VARCHAR(7)   NOT NULL DEFAULT '#6366f1',
                icon       VARCHAR(10)  NOT NULL DEFAULT '📦',
                created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
            )
        """)
        _exec(conn, """
            CREATE TABLE IF NOT EXISTS expenses (
                id          SERIAL PRIMARY KEY,
                title       VARCHAR(255)   NOT NULL,
                amount      NUMERIC(12, 2) NOT NULL,
                category_id INTEGER        REFERENCES categories(id) ON DELETE SET NULL,
                date        DATE           NOT NULL DEFAULT CURRENT_DATE,
                notes       TEXT,
                created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
            )
        """)
        if _scalar(conn, "SELECT COUNT(*) FROM categories") == 0:
            _execmany(
                conn,
                "INSERT INTO categories (name, color, icon) VALUES (%s, %s, %s)",
                _DEFAULT_CATEGORIES,
            )
    print("✔  Database ready")


# ── Serialisation helpers ─────────────────────────────────────────────────────

def _ser_expense(row: dict[str, Any]) -> dict[str, Any]:
    row["date"]   = row["date"].isoformat() if isinstance(row["date"], date) else row["date"]
    row["amount"] = float(row["amount"])
    return row


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def index() -> str:
    return render_template("index.html")


# ── Categories ────────────────────────────────────────────────────────────────

@app.get("/api/categories")
def get_categories() -> Response:
    with get_db() as conn:
        rows = _rows(conn, "SELECT * FROM categories ORDER BY name")
    return jsonify(rows)


@app.post("/api/categories")
def create_category() -> tuple[Response, int]:
    data  = request.get_json(force=True)
    name  = data.get("name", "").strip()
    color = data.get("color", "#6366f1")
    icon  = data.get("icon",  "📦")
    if not name:
        return jsonify({"error": "name is required"}), 400
    with get_db() as conn:
        row = _row(
            conn,
            "INSERT INTO categories (name, color, icon) VALUES (%s, %s, %s) RETURNING *",
            (name, color, icon),
        )
    return jsonify(row), 201


@app.delete("/api/categories/<int:cat_id>")
def delete_category(cat_id: int) -> Response:
    with get_db() as conn:
        _exec(conn, "DELETE FROM categories WHERE id = %s", (cat_id,))
    return jsonify({"success": True})


# ── Expenses ──────────────────────────────────────────────────────────────────

@app.get("/api/expenses")
def get_expenses() -> Response:
    cat_id     = request.args.get("category_id")
    start_date = request.args.get("start_date")
    end_date   = request.args.get("end_date")
    search     = request.args.get("search", "").strip()

    clauses: list[str] = []
    params:  list[Any] = []

    if cat_id:
        clauses.append("e.category_id = %s"); params.append(cat_id)
    if start_date:
        clauses.append("e.date >= %s");       params.append(start_date)
    if end_date:
        clauses.append("e.date <= %s");       params.append(end_date)
    if search:
        clauses.append("(e.title ILIKE %s OR e.notes ILIKE %s)")
        params += [f"%{search}%", f"%{search}%"]

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    query = f"""
        SELECT e.*, c.name  AS category_name,
                    c.color AS category_color,
                    c.icon  AS category_icon
        FROM expenses e
        LEFT JOIN categories c ON e.category_id = c.id
        {where}
        ORDER BY e.date DESC, e.created_at DESC
    """
    with get_db() as conn:
        rows = _rows(conn, query, tuple(params))
    return jsonify([_ser_expense(r) for r in rows])


@app.post("/api/expenses")
def create_expense() -> tuple[Response, int]:
    data = request.get_json(force=True)
    title  = data.get("title", "").strip()
    amount = data.get("amount")
    if not title or amount is None:
        return jsonify({"error": "title and amount are required"}), 400
    today = datetime.now().date().isoformat()
    with get_db() as conn:
        row = _row(
            conn,
            """INSERT INTO expenses (title, amount, category_id, date, notes)
               VALUES (%s, %s, %s, %s, %s) RETURNING *""",
            (title, amount, data.get("category_id"), data.get("date", today), data.get("notes")),
        )
    return jsonify(_ser_expense(row)), 201


@app.put("/api/expenses/<int:exp_id>")
def update_expense(exp_id: int) -> Response:
    data = request.get_json(force=True)
    with get_db() as conn:
        row = _row(
            conn,
            """UPDATE expenses
               SET title=%s, amount=%s, category_id=%s, date=%s, notes=%s
               WHERE id=%s RETURNING *""",
            (
                data.get("title"), data.get("amount"), data.get("category_id"),
                data.get("date"),  data.get("notes"),  exp_id,
            ),
        )
    return jsonify(_ser_expense(row))


@app.delete("/api/expenses/<int:exp_id>")
def delete_expense(exp_id: int) -> Response:
    with get_db() as conn:
        _exec(conn, "DELETE FROM expenses WHERE id = %s", (exp_id,))
    return jsonify({"success": True})


# ── Summary / Analytics ───────────────────────────────────────────────────────

@app.get("/api/summary")
def get_summary() -> Response:
    with get_db() as conn:
        month_total = float(_scalar(conn, """
            SELECT COALESCE(SUM(amount), 0)
            FROM expenses
            WHERE DATE_TRUNC('month', date) = DATE_TRUNC('month', CURRENT_DATE)
        """))
        today_total = float(_scalar(conn,
            "SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE date = CURRENT_DATE"
        ))
        month_count = _scalar(conn, """
            SELECT COUNT(*) FROM expenses
            WHERE DATE_TRUNC('month', date) = DATE_TRUNC('month', CURRENT_DATE)
        """)
        by_cat = _rows(conn, """
            SELECT c.name, c.color, c.icon, COALESCE(SUM(e.amount), 0) AS total
            FROM categories c
            LEFT JOIN expenses e
                   ON e.category_id = c.id
                  AND DATE_TRUNC('month', e.date) = DATE_TRUNC('month', CURRENT_DATE)
            GROUP BY c.id, c.name, c.color, c.icon
            ORDER BY total DESC
        """)
        for r in by_cat:
            r["total"] = float(r["total"])

        trend = _rows(conn, """
            SELECT TO_CHAR(DATE_TRUNC('month', date), 'Mon YYYY') AS month,
                   SUM(amount) AS total
            FROM expenses
            WHERE date >= CURRENT_DATE - INTERVAL '6 months'
            GROUP BY DATE_TRUNC('month', date)
            ORDER BY DATE_TRUNC('month', date)
        """)
        for r in trend:
            r["total"] = float(r["total"])

    return jsonify({
        "month_total": month_total,
        "today_total": today_total,
        "month_count": month_count,
        "by_category": by_cat,
        "trend":       trend,
    })


# ── Entry point ───────────────────────────────────────────────────────────────
init_db()
if __name__ == "__main__":
    
    app.run(debug=True, port=5000)