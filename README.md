# 💸 Spendwise — Expense Tracker

Full-stack expense tracker: **Flask 3.1 + PostgreSQL** backend, **vanilla HTML/CSS/JS** frontend.

## Stack

| Layer | Technology |
|---|---|
| Runtime | **Python 3.13.6** |
| Web framework | Flask 3.1.3 |
| Database driver | psycopg2-binary 2.9.10 |
| Config | `config.toml` via stdlib **tomllib** (no dotenv) |
| CORS | Handled in-app via `after_request` hook (no Flask-CORS) |
| Frontend | Vanilla HTML · CSS · JavaScript — zero npm |

## Quick Start

### 1. PostgreSQL

```bash
psql -U postgres -f schema.sql
```

Or skip — `app.py` calls `init_db()` automatically on startup.

### 2. Python environment

```bash
python3.13 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure

```bash
# Edit config.toml with your DB credentials (no .env needed — stdlib tomllib)
nano config.toml
```

### 4. Run

```bash
python app.py
# → http://localhost:5000
```

## Project Structure

```
expense-tracker/
├── app.py               ← Flask app (Python 3.13 style)
│                           - tomllib config, contextmanager DB, @app.get/post/put/delete
│                           - type hints throughout
├── config.toml          ← DB config (read by stdlib tomllib — no dotenv)
├── requirements.txt     ← Only 2 packages: Flask + psycopg2-binary
├── schema.sql           ← Optional manual DB setup
├── templates/
│   └── index.html
└── static/
    ├── css/style.css
    └── js/app.js
```

## Python 3.13 Features Used

| Feature | Usage |
|---|---|
| `tomllib` (stdlib) | Replaces python-dotenv for config |
| `@app.get/post/put/delete` | Flask 3.x HTTP method decorators |
| `contextmanager` | `get_db()` — auto commit/rollback/close |
| `from __future__ import annotations` | Deferred annotation evaluation |
| `type` hints everywhere | `dict[str, Any]`, `list[tuple[...]]`, etc. |
| `pathlib.Path` | File paths instead of `os.path` |
| f-string expressions | Used in dynamic SQL clause building |

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/expenses` | List (filters: `search`, `start_date`, `end_date`, `category_id`) |
| POST | `/api/expenses` | Create |
| PUT | `/api/expenses/<id>` | Update |
| DELETE | `/api/expenses/<id>` | Delete |
| GET | `/api/categories` | List |
| POST | `/api/categories` | Create |
| DELETE | `/api/categories/<id>` | Delete |
| GET | `/api/summary` | Dashboard stats + chart data |
