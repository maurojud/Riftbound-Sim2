// Kartendaten aus einer CSV (z. B. TCGplayer/tcgcsv "…ProductsAndPrices.csv") lesen und lokal im Browser merken.
// Dient als Quelle, wenn die Online-Datenbank ein neues Set noch nicht kennt. Passende Karten werden über Set-Kürzel + Nummer gefunden.
const KEY = 'rt:csvcards:v1'

export function parseCsv(text) {
  const rows = []
  let row = [], cur = '', q = false
  const s = String(text || '').replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(cur); cur = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(cur); cur = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else cur += ch
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows
}

const nz = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : Number(v))

// Liefert { 'rad-136': {…Riftcodex-ähnlicher Eintrag…}, … }
export function buildIndex(text, set) {
  const [head, ...rest] = parseCsv(text)
  if (!head) return {}
  const col = Object.fromEntries(head.map((h, i) => [h.trim(), i]))
  if (col.extNumber === undefined || col.name === undefined) throw new Error('Das ist keine Kartenliste mit Spalten „name“ und „extNumber“.')
  const g = (r, k) => (col[k] === undefined ? '' : (r[col[k]] || '').trim())
  const out = {}
  const prio = {}
  const s = set.toLowerCase()
  for (const r of rest) {
    const number = g(r, 'extNumber')
    const m = number.match(/^(\d{1,3})([a-z*]*)\/\d+$/i) || number.match(/^(SP|T)(\d{1,3})\/\d+$/i)
    if (!m) continue
    const isSpecial = /^(SP|T)$/i.test(m[1])
    const num = isSpecial ? m[1].toLowerCase() + Number(m[2]) : m[1].padStart(3, '0')
    const plain = !isSpecial && m[2] === ''
    const key = `${s}-${num}`
    const name = g(r, 'name')
    if (prio[key] && prio[key] >= (plain ? 2 : 1)) continue
    prio[key] = plain ? 2 : 1
    const t = g(r, 'extCardType')
    const sig = /signature/i.test(t)
    const champ = /champion/i.test(t)
    const type = t.replace(/signature|champion/gi, '').trim() || (champ ? 'Unit' : t)
    const domains = g(r, 'extDomain').split(';').map((d) => d.trim()).filter((d) => d && !/^(none|colorless)$/i.test(d))
    const plainKind = /unit/i.test(type) || champ
    const noStats = /^(legend|battlefield|rune)$/i.test(type)
    out[key] = {
      name: name.replace(/\s*\([^)]*\)\s*$/, '').trim(),
      riftbound_id: `${key}-csv`,
      classification: { type, supertype: champ ? 'Champion' : '', domain: domains },
      metadata: { signature: sig },
      attributes: {
        energy: noStats ? null : nz(g(r, 'extEnergyCost')),
        power: noStats ? null : nz(g(r, 'extPowerCost')),
        might: plainKind ? nz(g(r, 'extMight')) : null,
      },
    }
  }
  return out
}

export function loadStore() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} }
}
export function saveStore(st) {
  try { localStorage.setItem(KEY, JSON.stringify(st)) } catch { /* Speicher voll oder gesperrt: nur für diese Sitzung */ }
}
export function lookupLocal(set, num) {
  const st = loadStore()
  return st[`${String(set).toLowerCase()}-${String(num).toLowerCase()}`] || null
}
export function storeSummary() {
  const st = loadStore()
  const sets = {}
  for (const k of Object.keys(st)) { const s = k.split('-')[0].toUpperCase(); sets[s] = (sets[s] || 0) + 1 }
  return sets
}
