-- Run this manually if you prefer to initialise the DB yourself
-- (app.py also calls init_db() automatically on startup)

CREATE DATABASE expense_tracker;

\c expense_tracker

CREATE TABLE IF NOT EXISTS categories (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(100) NOT NULL UNIQUE,
    color      VARCHAR(7)   NOT NULL DEFAULT '#6366f1',
    icon       VARCHAR(10)  NOT NULL DEFAULT '📦',
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
    id          SERIAL PRIMARY KEY,
    title       VARCHAR(255)   NOT NULL,
    amount      NUMERIC(12, 2) NOT NULL,
    category_id INTEGER        REFERENCES categories(id) ON DELETE SET NULL,
    date        DATE           NOT NULL DEFAULT CURRENT_DATE,
    notes       TEXT,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Default categories
INSERT INTO categories (name, color, icon) VALUES
  ('Food & Dining',     '#f59e0b', '🍔'),
  ('Transport',         '#3b82f6', '🚗'),
  ('Shopping',          '#ec4899', '🛍️'),
  ('Entertainment',     '#8b5cf6', '🎬'),
  ('Health',            '#10b981', '💊'),
  ('Bills & Utilities', '#ef4444', '⚡'),
  ('Travel',            '#06b6d4', '✈️'),
  ('Other',             '#6b7280', '📦')
ON CONFLICT (name) DO NOTHING;
