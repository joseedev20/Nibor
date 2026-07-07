-- Migration number: 0001 	 2026-07-04
-- Esquema inicial Nibor Finanzas (ver docs/plan/PLAN.md §3)

CREATE TABLE platforms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  orden INTEGER NOT NULL DEFAULT 0,
  activa INTEGER NOT NULL DEFAULT 1
);

-- saldo_final NULL = mes pendiente (nunca tratarlo como 0)
CREATE TABLE snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_id INTEGER NOT NULL REFERENCES platforms(id),
  anio INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  saldo_inicial REAL NOT NULL DEFAULT 0 CHECK (saldo_inicial >= 0),
  aporte REAL NOT NULL DEFAULT 0 CHECK (aporte >= 0),
  retiros REAL NOT NULL DEFAULT 0 CHECK (retiros >= 0),
  saldo_final REAL CHECK (saldo_final IS NULL OR saldo_final >= 0),
  UNIQUE (platform_id, anio, mes)
);
CREATE INDEX idx_snapshots_periodo ON snapshots (anio, mes);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('gasto', 'ingreso')),
  icono TEXT,
  color TEXT
);

CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  monto REAL NOT NULL CHECK (monto >= 0),
  dia_cobro INTEGER NOT NULL DEFAULT 1 CHECK (dia_cobro BETWEEN 1 AND 31),
  categoria_id INTEGER REFERENCES categories(id),
  activa INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL, -- YYYY-MM-DD
  tipo TEXT NOT NULL CHECK (tipo IN ('gasto', 'ingreso')),
  categoria_id INTEGER REFERENCES categories(id),
  descripcion TEXT,
  monto REAL NOT NULL CHECK (monto >= 0),
  subscription_id INTEGER REFERENCES subscriptions(id)
);
CREATE INDEX idx_movements_fecha ON movements (fecha);

-- Seed: plataformas del usuario
INSERT INTO platforms (nombre, color, orden) VALUES
  ('Binance',   '#F0B90B', 1),
  ('Colfondos', '#E4002B', 2),
  ('Nubank',    '#820AD1', 3),
  ('Happi',     '#10B981', 4);

-- Seed: categorías básicas
INSERT INTO categories (nombre, tipo, icono) VALUES
  ('Arriendo',        'gasto',   '🏠'),
  ('Luz',             'gasto',   '💡'),
  ('Agua',            'gasto',   '🚿'),
  ('Internet',        'gasto',   '🌐'),
  ('Mercado',         'gasto',   '🛒'),
  ('Transporte',      'gasto',   '🚌'),
  ('Salud',           'gasto',   '⚕️'),
  ('Entretenimiento', 'gasto',   '🎬'),
  ('Suscripciones',   'gasto',   '🔁'),
  ('Otros gastos',    'gasto',   '📦'),
  ('Salario',         'ingreso', '💼'),
  ('Otros ingresos',  'ingreso', '💰');
