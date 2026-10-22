import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { CardView, CounterPanel, seatColor } from './Table'
import CardImg from './CardImg'
import { ZONES, moveCard, showCards, analyzeDeck, findInst } from './game'

const TOKEN_ORDER = ['Unit', 'Gear', 'Spell', 'Battlefield', 'Other']

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-bg top" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{title}</h3><button onClick={onClose}>Schließen</button></div>
        {children}
      </div>
    </div>
  )
}

// Kleines Menü: Mehr, Karten-Optionen (Rechtsklick/langes Drücken), Deck-Optionen und die Frage oben/unten nach dem Ablegen auf ein Deck
export function PopMenu({ menu, onClose }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ left: menu.x, top: menu.y })
  useLayoutEffect(() => {
    const r = ref.current.getBoundingClientRect()
    setPos({
      left: Math.max(6, Math.min(menu.x, window.innerWidth - r.width - 6)),
      top: Math.max(6, Math.min(menu.y, window.innerHeight - r.height - 6)),
    })
  }, [menu])
  return (
    <div className="ctx-bg" onPointerDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }}>
      <div className="ctxmenu" ref={ref} style={pos} onPointerDown={(e) => e.stopPropagation()}>
        {menu.title && <div className="t strong">{menu.title}</div>}
        {menu.items.map((it, i) => (
          <button key={i} disabled={it.disabled} onClick={() => { onClose(); it.run() }}>{it.label}</button>
        ))}
      </div>
    </div>
  )
}

// Zielpfeile zwischen Karten (SVG über dem ganzen Tisch). Eigene Pfeile lassen sich per Klick entfernen.
export function ArrowLayer({ players, mySeat, onRemove }) {
  const [, setTick] = useState(0)
  const arrows = []
  for (const pl of players) {
    for (const list of Object.values(pl.state?.zones || {})) {
      for (const inst of list) for (const t of inst.targets || []) arrows.push({ from: inst.id, to: t, seat: pl.seat })
    }
    for (const fx of pl.state?.fx || []) for (const t of fx.targets || []) arrows.push({ from: fx.id, to: t, seat: pl.seat })
  }
  const key = arrows.map((a) => a.from + '>' + a.to).join('|')
  useEffect(() => {
    if (!key) return undefined
    const f = () => setTick((t) => t + 1)
    const i = setInterval(f, 250)
    addEventListener('resize', f)
    addEventListener('scroll', f, true)
    return () => { clearInterval(i); removeEventListener('resize', f); removeEventListener('scroll', f, true) }
  }, [key])
  if (!arrows.length) return null
  const rectOf = (id) => {
    const el = [...document.querySelectorAll(`[data-iid="${id}"]`)].find((e) => e.offsetParent !== null || e.getClientRects().length)
    return el ? el.getBoundingClientRect() : null
  }
  const edge = (r, dx, dy) => {
    const sx = dx ? r.width / 2 / Math.abs(dx) : Infinity
    const sy = dy ? r.height / 2 / Math.abs(dy) : Infinity
    return Math.min(sx, sy)
  }
  return (
    <svg className="arrows" width="100%" height="100%">
      {arrows.map((a) => {
        const ra = rectOf(a.from)
        const rb = rectOf(a.to)
        if (!ra || !rb) return null
        const ca = { x: ra.left + ra.width / 2, y: ra.top + ra.height / 2 }
        const cb = { x: rb.left + rb.width / 2, y: rb.top + rb.height / 2 }
        const dx = cb.x - ca.x
        const dy = cb.y - ca.y
        if (!dx && !dy) return null
        const sa = Math.min(1, edge(ra, dx, dy))
        const sb = Math.min(1, edge(rb, dx, dy))
        const p1 = { x: ca.x + dx * sa, y: ca.y + dy * sa }
        const p2 = { x: cb.x - dx * sb, y: cb.y - dy * sb }
        const len = Math.hypot(p2.x - p1.x, p2.y - p1.y)
        if (len < 4) return null
        const ux = (p2.x - p1.x) / len
        const uy = (p2.y - p1.y) / len
        const hs = 13
        const b1 = { x: p2.x - ux * hs + uy * hs * 0.5, y: p2.y - uy * hs - ux * hs * 0.5 }
        const b2 = { x: p2.x - ux * hs - uy * hs * 0.5, y: p2.y - uy * hs + ux * hs * 0.5 }
        const col = seatColor(a.seat)
        const mine = a.seat === mySeat
        return (
          <g key={a.from + '>' + a.to} className={'arrow' + (mine ? ' mine' : '')} onClick={mine ? () => onRemove(a.from, a.to) : undefined}>
            <title>{mine ? 'Klicken, um den Pfeil zu entfernen' : 'Zielpfeil'}</title>
            <line x1={p1.x} y1={p1.y} x2={p2.x - ux * 4} y2={p2.y - uy * 4} stroke="#000" strokeOpacity=".45" strokeWidth="7" strokeLinecap="round" />
            <line x1={p1.x} y1={p1.y} x2={p2.x - ux * 4} y2={p2.y - uy * 4} stroke={col} strokeWidth="4" strokeLinecap="round" />
            <polygon points={`${p2.x},${p2.y} ${b1.x},${b1.y} ${b2.x},${b2.y}`} fill={col} stroke="#000" strokeOpacity=".45" strokeWidth="1.5" />
            {mine && <line className="hit" x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth="22" />}
          </g>
        )
      })}
    </svg>
  )
}

// Oberste Karten von Deck oder Runendeck ansehen: pro Karte oben/unten legen, in die Hand nehmen oder kurz allen zeigen
export function LookModal({ zone, mine, cards, act, onClose }) {
  const list = mine.zones[zone]
  const [n, setN] = useState(Math.min(3, list.length) || 1)
  const [ids, setIds] = useState(() => list.slice(0, n).map((i) => i.id))
  const [done, setDone] = useState([])
  const change = (d) => {
    const nn = Math.max(1, Math.min(list.length || 1, n + d))
    setN(nn); setIds(list.slice(0, nn).map((i) => i.id)); setDone([])
  }
  const cur = ids.filter((id) => !done.includes(id)).map((id) => list.find((i) => i.id === id)).filter(Boolean)
  const rune = zone === 'runeDeck'
  const mv = (id, to) => { act((p) => moveCard(p, id, to)); setDone((d) => [...d, id]) }
  return (
    <Modal title={`${rune ? 'Runendeck' : 'Deck'}: oberste Karten`} onClose={onClose}>
      <div className="row look-n">
        <span>Anzahl</span>
        <button onClick={() => change(-1)} aria-label="weniger">−</button><b>{n}</b><button onClick={() => change(1)} aria-label="mehr">+</button>
        <span className="muted small">{list.length} Karten im Stapel</span>
      </div>
      {cur.length === 0 && <p className="muted">Keine Karten mehr in dieser Auswahl.</p>}
      <div className="look-list">
        {cur.map((inst, i) => (
          <div key={inst.id} className="look-item">
            <span className="muted small">{i === 0 ? 'oberste' : `${i + 1}.`}</span>
            <CardView card={cards[inst.cardId]} inst={inst} small />
            <div className="look-btns">
              <button onClick={() => mv(inst.id, rune ? 'runeDeckTop' : 'deckTop')}>Oben</button>
              <button onClick={() => mv(inst.id, rune ? 'runeDeckBottom' : 'deckBottom')}>Unten</button>
              <button onClick={() => mv(inst.id, rune ? 'runes' : 'hand')}>{rune ? 'Runenzone' : 'Hand'}</button>
              {!rune && <button onClick={() => mv(inst.id, 'trash')}>Trash</button>}
              <button className="ghostbtn" onClick={() => act((p) => showCards(p, [inst.cardId]))}>Allen zeigen</button>
            </div>
          </div>
        ))}
      </div>
      <p className="muted small">„Oben“ legt die Karte zurück auf den Stapel. Die zuletzt gelegte Karte liegt ganz oben.</p>
    </Modal>
  )
}

export function DeckPicker({ cards, onPick }) {
  const [decks, setDecks] = useState(null)
  useEffect(() => { supabase.from('decks').select('*').order('created_at', { ascending: false }).then(({ data }) => setDecks(data || [])) }, [])
  return (
    <div className="stack">
      <h3>Deck wählen</h3>
      {decks === null && <p className="muted">Lade…</p>}
      {decks?.length === 0 && <p className="muted">Du hast noch kein Deck. Erstelle eines unter „Decks“.</p>}
      {decks?.map((d) => {
        const qty = Object.fromEntries((d.cards || []).map((e) => [e.card_id, e.qty]))
        const a = analyzeDeck(qty, cards)
        return (
          <button key={d.id} className="deckrow" onClick={() => onPick(d)}>
            <span>{d.name}{!a.valid && <span className="warn"> · unvollständig</span>}</span>
            <span className="muted">{a.main}+{a.rune} Karten</span>
          </button>
        )
      })}
    </div>
  )
}

export function Setup({ mine, cards, onBattlefield, onChampion }) {
  const z = mine.zones
  if (mine.setup?.battlefield) {
    return (
      <div className="panel narrow">
        <h3>Wähle dein Battlefield</h3>
        <div className="zone-grid">
          {z.bfPool.map((i) => <CardView key={i.id} card={cards[i.cardId]} inst={i} onClick={() => onBattlefield(i.id)} />)}
        </div>
      </div>
    )
  }
  const seen = new Set()
  const unique = z.deck.filter((i) => (seen.has(i.cardId) ? false : seen.add(i.cardId)))
  return (
    <div className="panel narrow">
      <h3>Wähle deinen Champion</h3>
      <p className="muted">Eine Karte aus deinem Deck kommt in die Champion-Zone.</p>
      <div className="zone-grid">
        {unique.map((i) => <CardView key={i.id} small card={cards[i.cardId]} inst={i} onClick={() => onChampion(i.id)} />)}
      </div>
      <button onClick={() => onChampion(null)}>Ohne Champion starten</button>
    </div>
  )
}

// Handkarten als Fächer. Jede Karte hat einen "Hide"-Schalter: verdeckt gespielte Karten sieht der Gegner nicht.
// Rückfrage bei Karten mit zwei Power-Farben: welche Runen sollen recycelt werden?
export function PayModal({ ask, cards, mine, onCancel, onFree, onPay }) {
  const [picked, setPicked] = useState([])
  const runes = ask.choice.candidates.map((id) => mine.zones.runes.find((r) => r.id === id)).filter(Boolean)
  const toggle = (id) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < ask.choice.n ? [...cur, id] : cur))
  return (
    <Modal title={`„${ask.name}“ bezahlen`} onClose={onCancel}>
      <p>Wähle {ask.choice.n} {ask.choice.n === 1 ? 'Rune' : 'Runen'} ({ask.cost.colors.join(' oder ')}) zum Recyceln. Sie kommen unter das Runendeck.
        {ask.cost.energy > 0 && ` Zusätzlich werden ${ask.cost.energy} Runen für die Energy getappt.`}</p>
      <div className="zone-grid paygrid">
        {runes.map((r) => (
          <button key={r.id} className={'paypick' + (picked.includes(r.id) ? ' on' : '')} aria-pressed={picked.includes(r.id)} onClick={() => toggle(r.id)}>
            <CardImg src={cards[r.cardId]?.image_url} alt={cards[r.cardId]?.name} />
            <span>{cards[r.cardId]?.color}{r.tapped ? ' · getappt' : ''}</span>
          </button>
        ))}
      </div>
      <div className="row">
        <button className="primary" disabled={picked.length !== ask.choice.n} onClick={() => onPay(picked)}>Bezahlen und spielen ({picked.length}/{ask.choice.n})</button>
        <button onClick={onFree}>Ohne Bezahlen spielen</button>
        <button onClick={onCancel}>Abbrechen</button>
      </div>
    </Modal>
  )
}

export function TokenModal({ tokens, onSpawn, onClose }) {
  const [n, setN] = useState({})
  const cnt = (id) => n[id] || 1
  const typeOf = (c) => TOKEN_ORDER.find((t) => t.toLowerCase() === String(c.token_type || '').toLowerCase()) || 'Ohne Typ'
  const groups = [...TOKEN_ORDER, 'Ohne Typ'].map((t) => [t, tokens.filter((c) => typeOf(c) === t)]).filter(([, l]) => l.length)
  return (
    <Modal title="Tokens spielen" onClose={onClose} top>
      {tokens.length === 0 && <p className="muted">Noch keine Token-Karten vorhanden. Im Karten-Verwalter die Art „Token“ setzen.</p>}
      {groups.map(([type, list]) => (
        <section key={type}>
          <h4 className="grouptitle">{type === 'Unit' ? 'Units' : type === 'Gear' ? 'Gear' : type === 'Spell' ? 'Spells' : type === 'Battlefield' ? 'Battlefields' : type}</h4>
          <div className="tokengrid">
            {list.map((c) => (
              <div key={c.id} className="tokentile">
                <button className="tokenimg" title="Klick spielt 1 Token" onClick={() => onSpawn(c, 1)}>
                  <CardImg src={c.image_url} alt={c.name} battlefield={type === 'Battlefield'} />
                </button>
                <b title={c.name}>{c.name}</b>
                <div className="row tokenctl">
                  <button aria-label="weniger" onClick={() => setN((cur) => ({ ...cur, [c.id]: Math.max(1, (cur[c.id] || 1) - 1) }))}>−</button>
                  <span>{cnt(c.id)}</span>
                  <button aria-label="mehr" onClick={() => setN((cur) => ({ ...cur, [c.id]: Math.min(20, (cur[c.id] || 1) + 1) }))}>+</button>
                  <button className="primary" onClick={() => onSpawn(c, cnt(c.id))}>{cnt(c.id)}× spielen</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <p className="muted small">Tokens landen im Base und verhalten sich wie normale Karten. Verlassen sie das Spielfeld, verschwinden sie. Battlefield-Token mit dem Modus „überlegen“ ziehst du auf das gewünschte Battlefield.</p>
    </Modal>
  )
}
