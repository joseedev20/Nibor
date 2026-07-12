import assert from 'node:assert/strict'
import test from 'node:test'

import {
  computeSnapshot,
  getMonthBounds,
  isValidDate,
  isValidDateTime,
  isValidTime,
} from '../server/db.js'

test('isValidDate acepta fechas reales y años bisiestos', () => {
  assert.equal(isValidDate('2024-02-29'), true)
  assert.equal(isValidDate('2026-07-12'), true)
  assert.equal(isValidDate('2200-12-31'), true)
})

test('isValidDate rechaza fechas imposibles, formatos ambiguos y años fuera de rango', () => {
  for (const value of [
    '2023-02-29',
    '2026-02-30',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-01-00',
    '26-07-12',
    '2026-7-12',
    '1899-12-31',
    '2201-01-01',
    '',
    null,
  ]) {
    assert.equal(isValidDate(value), false, `Debía rechazar ${String(value)}`)
  }
})

test('isValidTime e isValidDateTime validan rangos completos', () => {
  assert.equal(isValidTime('00:00'), true)
  assert.equal(isValidTime('23:59'), true)
  assert.equal(isValidTime('24:00'), false)
  assert.equal(isValidTime('12:60'), false)

  assert.equal(isValidDateTime('2024-02-29T23:59'), true)
  assert.equal(isValidDateTime('2023-02-29T10:00'), false)
  assert.equal(isValidDateTime('2026-07-12T24:00'), false)
})

test('computeSnapshot conserva las fórmulas financieras del backend', () => {
  const snapshot = computeSnapshot({
    saldo_inicial: 1_000,
    aporte: 200,
    retiros: 50,
    saldo_final: 1_350,
  })

  assert.equal(snapshot.saldo_total_inicial, 1_200)
  assert.equal(snapshot.ganancia, 200)
  assert.equal(snapshot.rentabilidad, 1 / 6)
  assert.equal(snapshot.pendiente, false)

  const pending = computeSnapshot({ saldo_inicial: 1_000, aporte: 0, retiros: 0, saldo_final: null })
  assert.equal(pending.ganancia, null)
  assert.equal(pending.rentabilidad, null)
  assert.equal(pending.pendiente, true)
})

test('getMonthBounds calcula correctamente meses normales y bisiestos', () => {
  assert.deepEqual(getMonthBounds(2024, 2), {
    start: '2024-02-01',
    end: '2024-02-29',
    lastDay: 29,
  })
  assert.equal(getMonthBounds(2026, 2).end, '2026-02-28')
})
