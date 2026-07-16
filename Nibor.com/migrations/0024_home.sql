-- Migration number: 0024    2026-07-15
-- Nibor Casa: administración mensual de una propiedad.
-- Una propiedad configurable hoy, preparado para varias en el futuro.
-- Nunca incluir direcciones, números de cuenta, valores ni documentos reales aquí.

CREATE TABLE IF NOT EXISTS home_properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  notas TEXT,
  activa INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Un registro único por propiedad y mes. Totales de conceptos y estado se
-- calculan SOLO en backend; aquí viven los datos de la cuenta de cobro,
-- el pago (separado) y el único PDF por periodo (cuenta + comprobante unidos).
CREATE TABLE IF NOT EXISTS home_administration_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES home_properties(id),
  anio INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  fecha_emision TEXT,
  numero_cuenta TEXT,
  fecha_limite_descuento TEXT,
  fecha_vencimiento TEXT,
  descuento_pct REAL,
  descuento_valor REAL,
  total_con_descuento REAL,
  fecha_pago TEXT,
  valor_pagado REAL,
  mora_cobrada REAL,
  notas TEXT,
  file_key TEXT,
  file_name TEXT,
  file_size INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (property_id, anio, mes)
);

CREATE INDEX IF NOT EXISTS idx_home_periods_property_anio
  ON home_administration_periods (property_id, anio, mes);

-- Conceptos dinámicos de la cuenta de cobro (Administración, Parqueadero,
-- Retroactivo, etc.). El descuento del periodo puede aplicar solo a algunos
-- conceptos: nunca recalcularlo como porcentaje del total.
CREATE TABLE IF NOT EXISTS home_administration_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id INTEGER NOT NULL REFERENCES home_administration_periods(id) ON DELETE CASCADE,
  concepto TEXT NOT NULL,
  saldo_anterior REAL NOT NULL DEFAULT 0,
  cuota_mes REAL NOT NULL DEFAULT 0,
  nuevo_saldo REAL NOT NULL DEFAULT 0,
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_home_items_period
  ON home_administration_items (period_id, orden);
