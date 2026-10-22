import { useState } from 'react'
import { CardView, CounterPanel, PointsBar, StackCol, seatColor } from './Table'
import CardImg from './CardImg'
import { Icon, IconBtn, Sheet, useLongPress } from './ui'
import {
  COUNTERS, STATUSES, kindOf, findInst, targetsFor, canTap, canAim, canGive, canHide, canMark, canReveal,
  toggleFlag, moveCard, clearTargets, detachCard, changePeek, giveCard, attachCard, untapAll, stackEntries,
} from './game'

// ───────── Hilfen ─────────
const chipsOf = (inst) => {
  const out = []
  if (inst.tapped) out.push('getappt')
  if (inst.faceDown) out.push('verdeckt')
  const c = inst.counters || {}
  COUNTERS.forEach((d) => { if (c[d.key]) out.push(`${d.label} ${d.signed && c[d.key] > 0 ? '+' : ''}${c[d.key]}`) })
  const st = inst.status || {}
  STATUSES.forEach((d) => { if (st[d.key]) out.push(d.label) })
  if (inst.token) out.push('Token')
  return out
}

// Alle Karten im Spiel nach Besitzer und Zone sortiert (Battlefields mit ihren Einheiten, dann Base, Champion, Legend, Stack je Spieler)
export function boardSections(P) {
  const { players, cards, bfSeats, mySeat } = P
  const bfInst = (key) => {
    if (typeof key === 'number') return players.find((p) => p.seat === key)?.state?.zones.battlefield[0]
    return players.flatMap((p) => p.state?.zones.bfExtra || []).find((i) => 'x' + i.id === key)
  }
  const secs = []
  for (const key of bfSeats) {
    const b = bfInst(key)
    if (!b) continue
    const items = [{ inst: b, owner: null, zone: 'battlefield', label: 'Battlefield' }]
    for (const pl of players) for (const u of pl.state?.zones.bfUnits || []) if (String(u.at) === String(key)) items.push({ inst: u, owner: pl, zone: 'bfUnits', label: 'Battlefield' })
    secs.push({ key: 'bf' + key, title: cards[b.cardId]?.name || 'Battlefield', icon: 'flag', items })
  }
  const order = [...players].sort((a, b) => (a.seat === mySeat ? -1 : b.seat === mySeat ? 1 : a.seat - b.seat))
  for (const pl of order) {
    if (!pl.state) continue
    const z = pl.state.zones
    for (const [zone, label, icon] of [['base', 'Base', 'base'], ['champion', 'Champion', 'champion'], ['legend', 'Legend', 'legend']]) {
      if (z[zone]?.length) secs.push({ key: pl.seat + zone, title: `${pl.name} · ${label}`, icon, seat: pl.seat, items: z[zone].map((inst) => ({ inst, owner: pl, zone, label })) })
    }
    for (const x of (z.bfExtra || [])) secs.push({ key: pl.seat + 'x' + x.id, title: `${pl.name} · Zusatz`, icon: 'flag', seat: pl.seat, items: [{ inst: x, owner: pl, zone: 'bfExtra', label: 'Zusatz' }] })
  }
  const st = stackEntries(players).filter((e) => e.inst)
  if (st.length) secs.push({ key: 'stack', title: 'Stack', icon: 'stack', items: st.map((e) => ({ inst: e.inst, owner: players.find((p) => p.seat === e.seat), zone: 'stack', label: 'Stack' })) })
  return secs
}

export function TargetList({ P, excludeId, onPick, selected, onlyOwn, noteOwn }) {
  const secs = boardSections(P).map((s) => ({ ...s, items: s.items.filter((x) => x.inst.id !== excludeId && (!onlyOwn || (x.owner && x.owner.seat === P.mySeat && ['base', 'bfUnits'].includes(x.zone)))) })).filter((s) => s.items.length)
  if (!secs.length) return <p className="muted pad">Keine Karten im Spiel.</p>
  return (
    <div className="tlist">
      {secs.map((sec) => (
        <div key={sec.key} className="tsec">
          <h4 style={sec.seat ? { color: seatColor(sec.seat) } : undefined}><Icon n={sec.icon} size={15} /> {sec.title}</h4>
          <div className="ttiles">
            {sec.items.map(({ inst, owner, zone }) => {
              const card = P.cards[inst.cardId]
              const hidden = !card || (inst.faceDown && owner && owner.seat !== P.mySeat)
              const chips = chipsOf(inst)
              return (
                <button key={inst.id} className={'ttile' + (inst.tapped ? ' tapped' : '') + (selected === inst.id ? ' sel' : '')} onClick={() => onPick(inst, owner, zone)} data-aimtarget={inst.id}>
                  <span className="timg" style={owner ? { '--oc': seatColor(owner.seat) } : undefined}>{hidden ? <span className="back" /> : <CardImg src={card.image_url} alt={card.name} battlefield={kindOf(card) === 'battlefield'} />}</span>
                  <b>{hidden ? 'Verdeckt' : card.name}</b>
                  {owner && <span className="tmeta">{owner.name}</span>}
                  {chips.length > 0 && <span className="tchips">{chips.map((c) => <i key={c}>{c}</i>)}</span>}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

const ownerOf = (P, id) => P.players.find((p) => p.state && Object.values(p.state.zones).some((l) => l.some((i) => i.id === id)))?.seat ?? P.mySeat

function Cost({ aff }) {
  if (!aff?.known) return <span className="cost muted">Kosten ?</span>
  const c = aff.cost
  return (
    <span className={'cost' + (aff.ok ? '' : ' bad')} title={aff.ok ? 'Bezahlbar' : 'Nicht genug passende Runen'}>
      <Icon n="zap" size={14} />{c.energy}
      {c.power > 0 && <><Icon n="rune" size={14} />{c.power}<small>{c.colors.join('/')}</small></>}
      {aff.saved && <small className="legendsave">Legend −{[aff.saved.energy && `${aff.saved.energy}E`, aff.saved.power && `${aff.saved.power}P`].filter(Boolean).join(' ')}</small>}
    </span>
  )
}

// ───────── Karte aus Hand oder Championzone spielen: Platzieren | Targeten | Beides ─────────
function PlaySheet({ P, inst, zone, onClose, move, onDetail }) {
  const [tab, setTab] = useState('place')
  const [dest, setDest] = useState(null)
  const [tgt, setTgt] = useState(null)
  const [host, setHost] = useState(false)
  const card = P.cards[inst.cardId]
  const aff = P.afford(inst.id)
  const hostIds = ['base', 'bfUnits'].flatMap((z) => (P.mine.zones[z] || []).filter((i) => !i.att).map((i) => i.id))
  const allowed = targetsFor(card, zone, P.bfSeats, inst, hostIds)
  const bfName = (key) => {
    const k = /^\d+$/.test(key) ? Number(key) : key
    const b = typeof k === 'number' ? P.players.find((p) => p.seat === k)?.state?.zones.battlefield[0] : P.players.flatMap((p) => p.state?.zones.bfExtra || []).find((i) => 'x' + i.id === k)
    return P.cards[b?.cardId]?.name || 'Battlefield'
  }
  const dests = [
    allowed.includes('base') && { key: 'base', icon: 'base', label: 'Base' },
    ...allowed.filter((t) => t.startsWith('bf:')).map((t) => ({ key: t, icon: 'flag', label: bfName(t.slice(3)) })),
    allowed.includes('stack') && { key: 'stack', icon: 'stack', label: 'Stack' },
    ...(move ? [['hand', 'hand', 'Hand'], ['champion', 'champion', 'Champion'], ['trash', 'trash', 'Trash'], ['banish', 'banish', 'Banish'], ['deck', 'top', 'Deck oben']]
      .filter(([k]) => allowed.includes(k)).map(([key, icon, label]) => ({ key, icon, label })) : []),
  ].filter(Boolean)
  const hasHosts = allowed.some((t) => t.startsWith('card:'))
  const go = (fn) => { fn(); onClose() }
  const DestChips = ({ noStack }) => (
    <div className="dests">
      {dests.filter((d) => !(noStack && d.key === 'stack')).map((d) => (
        <button key={d.key} className={'dest' + (dest === d.key ? ' sel' : '')} onClick={() => (tab === 'place' ? go(() => P.place(inst.id, d.key)) : setDest(d.key))} aria-label={d.label}>
          <Icon n={d.icon} size={30} /><span>{d.label}</span>
        </button>
      ))}
      {hasHosts && <button className={'dest' + (host ? ' sel' : '')} onClick={() => setHost(!host)} aria-label="An Einheit anhängen"><Icon n="detach" size={30} /><span>Anhängen</span></button>}
    </div>
  )
  const confirm = () => go(() => P.both(inst.id, dest, tgt))
  return (
    <Sheet title={card?.name || 'Karte'} onClose={onClose} head={<>{!move && <Cost aff={aff} />}{move && onDetail && <IconBtn n="edit" label="Details und Werte" className="sm" onClick={onDetail} />}{canHide(card, zone) && <IconBtn n={inst.faceDown ? 'eyeoff' : 'eye'} label="Verdeckt spielen" on={inst.faceDown} className="sm" onClick={() => P.act((p) => toggleFlag(p, inst.id, 'faceDown'))} />}</>}>
      {!move && <div className="tabs3" role="tablist">
        {[['place', 'place', 'Platzieren'], ['target', 'aim', 'Targeten'], ['both', 'both', 'Beides']].map(([k, ic, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} aria-label={l}><Icon n={ic} size={28} /></button>
        ))}
      </div>}
      {tab === 'place' && (<>
        <DestChips />
        {host && <><p className="muted small hint">An welche Einheit?</p><TargetList P={P} excludeId={inst.id} onlyOwn onPick={(h) => go(() => P.attach(inst.id, h.id))} /></>}
      </>)}
      {tab === 'target' && (<>
        <button className="wide" onClick={() => go(() => P.targetPlay(inst.id, null))}><Icon n="stack" size={22} /> <span>Ohne Ziel auf den Stack</span></button>
        <TargetList P={P} excludeId={inst.id} onPick={(t) => go(() => P.targetPlay(inst.id, t.id))} />
      </>)}
      {tab === 'both' && (<>
        <DestChips noStack />
        <TargetList P={P} excludeId={inst.id} selected={tgt} onPick={(t) => setTgt(t.id)} />
        <button className="primary confirm" disabled={!dest || !tgt} onClick={confirm} aria-label="Bestätigen"><Icon n="check" size={30} /></button>
      </>)}
    </Sheet>
  )
}

// ───────── Einzelne Karte: groß, Zähler/Status bearbeiten, Aktionen als Symbole ─────────
function DetailSheet({ P, seat, id, onClose }) {
  const [sub, setSub] = useState(null) // 'arrow' | 'fx'
  const own = seat === P.mySeat
  const pl = P.players.find((p) => p.seat === seat)
  const cur = own ? findInst(P.mine, id) : pl?.state && findInst(pl.state, id)
  if (!cur) return <Sheet title="Karte" onClose={onClose}><p className="muted pad">Die Karte ist nicht mehr da.</p></Sheet>
  const { inst, zone } = cur
  const card = P.cards[inst.cardId]
  const isBf = kindOf(card) === 'battlefield'
  const hide = inst.faceDown && !own
  const act = (fn, close) => () => { P.act(fn); if (close) onClose() }
  const A = []
  if (own) {
    if (canReveal(inst, zone)) A.push(['eye', 'Aufdecken', act((p) => toggleFlag(p, id, 'faceDown'))])
    if (canHide(card, zone)) A.push([inst.faceDown ? 'eyeoff' : 'eye', 'Verdeckt spielen', act((p) => toggleFlag(p, id, 'faceDown')), inst.faceDown])
    if (canTap(card, zone)) A.push(['tap', inst.tapped ? 'Enttappen' : 'Tappen', act((p) => toggleFlag(p, id, 'tapped'))])
    if (canAim(zone)) A.push(['aim', 'Pfeil auf ein Ziel', () => setSub('arrow')])
    if (['base', 'bfUnits', 'champion', 'legend'].includes(zone)) A.push(['fx', 'Effekt auf den Stack', () => setSub('fx')])
    if (inst.targets?.length) A.push(['close', 'Pfeile entfernen', act((p) => clearTargets(p, id))])
    if (inst.att) A.push(['detach', 'Von der Karte lösen', act((p) => detachCard(p, id))])
    if (canGive(card, zone)) for (const o of P.players) if (o.seat !== P.mySeat) A.push(['give', `An ${o.name} geben`, act((p) => giveCard(p, id, o.seat), true)])
    const isRune = kindOf(card) === 'rune'
    if (inst.floating || zone === 'bfExtra') A.push(['trash', inst.floating ? 'Floating Energy entfernen' : 'Entfernen', act((p) => moveCard(p, id, 'trash'), true)])
    else if (isRune) {
      A.push(['top', 'Oben aufs Runendeck', act((p) => moveCard(p, id, 'runeDeckTop'), true)])
      A.push(['bottom', 'Unter das Runendeck', act((p) => moveCard(p, id, 'runeDeckBottom'), true)])
    } else if (!['legend', 'battlefield'].includes(kindOf(card))) {
      if (zone !== 'hand') A.push(['hand', 'Auf die Hand', act((p) => moveCard(p, id, 'hand'), true)])
      if (zone !== 'trash') A.push(['trash', 'In den Trash', act((p) => moveCard(p, id, 'trash'), true)])
      if (zone !== 'banish') A.push(['banish', 'Verbannen', act((p) => moveCard(p, id, 'banish'), true)])
      A.push(['top', 'Oben aufs Deck', act((p) => moveCard(p, id, 'deckTop'), true)])
      A.push(['bottom', 'Unter das Deck', act((p) => moveCard(p, id, 'deckBottom'), true)])
    }
  }
  if (sub) {
    return (
      <Sheet title={sub === 'arrow' ? 'Pfeil: Ziel wählen' : 'Effekt: Ziel wählen'} onClose={() => setSub(null)} head={<IconBtn n="back" label="Zurück" className="sm" onClick={() => setSub(null)} />}>
        {sub === 'fx' && <button className="wide" onClick={() => { P.fx(id, null); onClose() }}><Icon n="fx" size={22} /> <span>Ohne Ziel</span></button>}
        <TargetList P={P} excludeId={id} onPick={(t) => { sub === 'arrow' ? P.arrow(id, t.id) : P.fx(id, t.id); onClose() }} />
      </Sheet>
    )
  }
  return (
    <Sheet title={hide ? 'Verdeckte Karte' : card?.name || 'Karte'} onClose={onClose} tall>
      <div className={'bigimg' + (isBf ? ' bf' : '')}>
        {hide ? <div className="back" /> : card && <CardImg className="big" src={card.image_url} alt={card.name} battlefield={isBf} />}
      </div>
      {!own && chipsOf(inst).length > 0 && <div className="tchips center">{chipsOf(inst).map((c) => <i key={c}>{c}</i>)}</div>}
      {own && canMark(card, zone) && <CounterPanel inst={inst} {...P.markFns(id)} />}
      {own && inst.att && (
        <div className="acts"><IconBtn n="plus" label="Mehr davon sichtbar" onClick={() => P.act((p) => changePeek(p, id, 0.04))} /><IconBtn n="minus" label="Weniger davon sichtbar" onClick={() => P.act((p) => changePeek(p, id, -0.04))} /></div>
      )}
      {A.length > 0 && (
        <div className="acts">
          {A.map(([ic, label, run, on]) => (
            <button key={label} className={'act' + (on ? ' on' : '')} onClick={run} aria-label={label}><Icon n={ic} size={26} /><span>{label}</span></button>
          ))}
        </div>
      )}
    </Sheet>
  )
}

function ZoneSheet({ P, seat, zone, onClose, open }) {
  const own = seat === P.mySeat
  const pl = P.players.find((p) => p.seat === seat)
  const list = pl?.state?.zones[zone] || []
  return (
    <Sheet title={`${zone === 'trash' ? 'Trash' : 'Banish'} · ${own ? 'meiner' : pl?.name} · ${list.length}`} onClose={onClose} tall>
      <div className="thumbs">
        {[...list].reverse().map((inst) => (
          <button key={inst.id} className="thumb2" onClick={() => open(seat, inst.id)} aria-label={P.cards[inst.cardId]?.name}>
            <CardImg src={P.cards[inst.cardId]?.image_url} alt={P.cards[inst.cardId]?.name} battlefield={kindOf(P.cards[inst.cardId]) === 'battlefield'} />
          </button>
        ))}
        {!list.length && <p className="muted pad">Leer.</p>}
      </div>
      {list.length > 0 && <p className="muted small hint">Neueste Karte zuerst. Antippen für Optionen.</p>}
    </Sheet>
  )
}

function RuneSheet({ P, onClose, open }) {
  const runes = P.mine.zones.runes
  const ready = runes.filter((r) => !r.tapped).length
  return (
    <Sheet title={`Runen · ${ready}/${runes.length} bereit`} onClose={onClose} tall
      head={<><IconBtn n="rune" label="Rune ziehen" className="sm" onClick={() => P.drawRune()} /><IconBtn n="untap" label="Alle Runen enttappen" className="sm" onClick={() => P.act((p) => ({ ...p, zones: { ...p.zones, runes: p.zones.runes.map((r) => ({ ...r, tapped: false })) } }))} /></>}>
      <div className="thumbs">
        {runes.map((inst) => <RuneTile key={inst.id} P={P} inst={inst} open={open} />)}
        {!runes.length && <p className="muted pad">Keine Runen gezogen.</p>}
      </div>
      <p className="muted small hint">Antippen tappt oder enttappt. Gedrückt halten: oben oder unten aufs Runendeck.</p>
    </Sheet>
  )
}
function RuneTile({ P, inst, open }) {
  const lp = useLongPress(() => P.act((p) => toggleFlag(p, inst.id, 'tapped')), () => open(P.mySeat, inst.id))
  const card = P.cards[inst.cardId]
  return (
    <div className={'thumb2 rune' + (inst.tapped ? ' tapped' : '')} {...lp} role="button" tabIndex={0} aria-label={card?.name}>
      <CardImg src={card?.image_url} alt={card?.name} />
    </div>
  )
}

// ───────── Hauptansicht ─────────
function HandCard({ P, inst, zone = 'hand', onTap, onLong }) {
  const lp = useLongPress(onTap, onLong)
  const card = P.cards[inst.cardId]
  const stop = (e) => e.stopPropagation()
  return (
    <div className={'hcard' + (inst.tapped ? ' tapped' : '')} {...lp} role="button" tabIndex={0} aria-label={card?.name || 'Karte'} data-hand={inst.id}>
      {card ? <CardImg src={card.image_url} alt={card.name} battlefield={kindOf(card) === 'battlefield'} /> : <div className="back" />}
      {zone === 'hand' && card && canHide(card, 'hand') && (
        <button type="button" className={'hhide' + (inst.faceDown ? ' on' : '')} aria-label="Verdeckt spielen" onPointerDown={stop} onPointerUp={stop} onClick={(e) => { e.stopPropagation(); P.act((p) => toggleFlag(p, inst.id, 'faceDown')) }}>
          <Icon n={inst.faceDown ? 'eyeoff' : 'eye'} size={20} />
        </button>
      )}
      {zone !== 'hand' && inst.faceDown && <span className="hbadge"><Icon n="eyeoff" size={16} /></span>}
    </div>
  )
}

function bfInstOf(P, key) {
  if (typeof key === 'number') return P.players.find((p) => p.seat === key)?.state?.zones.battlefield[0]
  return P.players.flatMap((p) => p.state?.zones.bfExtra || []).find((i) => 'x' + i.id === key)
}

// Nur ansehen (Base des Gegners): große Karte, sonst nichts
function ViewSheet({ P, seat, id, onClose }) {
  const pl = P.players.find((p) => p.seat === seat)
  const f = pl?.state && findInst(pl.state, id)
  const card = f && P.cards[f.inst.cardId]
  const hidden = !card || f?.inst.faceDown
  return (
    <Sheet title={hidden ? 'Verdeckt' : card.name} onClose={onClose}>
      <div className="bigimg">{hidden ? <div className="back" style={{ width: 200, aspectRatio: '5/7' }} /> : <CardImg src={card.image_url} alt={card.name} battlefield={kindOf(card) === 'battlefield'} />}</div>
      {f && chipsOf(f.inst).length > 0 && <div className="tchips center">{chipsOf(f.inst).map((c) => <i key={c}>{c}</i>)}</div>}
    </Sheet>
  )
}

function OppBase({ P, seat, onView }) {
  const pl = P.players.find((p) => p.seat === seat)
  const list = pl?.state?.zones.base || []
  return (
    <>
      <h4 className="opph" style={{ color: seatColor(seat) }}><span className="dot" style={{ background: seatColor(seat) }} /> {pl?.name}</h4>
      {list.length === 0 && <p className="muted center pad"><Icon n="base" size={28} /></p>}
      <div className="hgrid">
        {list.map((inst) => {
          const c = P.cards[inst.cardId]
          const hidden = !c || inst.faceDown
          return (
            <button key={inst.id} className={'hcard plain' + (inst.tapped ? ' tapped' : '')} onClick={() => onView(seat, inst.id)} aria-label={hidden ? 'Verdeckt' : c.name}>
              {hidden ? <div className="back" /> : <CardImg src={c.image_url} alt={c.name} />}
            </button>
          )
        })}
      </div>
    </>
  )
}

// Eine Zone als Reiter: eigene Karten groß (Tippen = verschieben, lang = Details), Karten der Gegner klein darunter
function ZoneView({ P, tab, open, openMove }) {
  const mine = P.mine.zones
  let own = [], others = [], bf = null
  if (tab === 'base') {
    own = mine.base
  } else {
    bf = bfInstOf(P, tab)
    const at = (z) => (z.bfUnits || []).filter((i) => String(i.at) === String(tab))
    own = at(mine)
    others = P.players.filter((p) => p.seat !== P.mySeat && p.state).map((p) => ({ p, list: at(p.state.zones) }))
  }
  const bfCard = bf && P.cards[bf.cardId]
  return (
    <>
      {bfCard && (
        <button className="bfstrip" onClick={() => open(ownerOf(P, bf.id), bf.id)} aria-label={bfCard.name}>
          <CardImg src={bfCard.image_url} alt={bfCard.name} battlefield />
        </button>
      )}
      {own.length === 0 && <p className="muted center pad"><Icon n={tab === 'base' ? 'base' : 'flag'} size={28} /></p>}
      <div className="hgrid">
        {own.map((inst) => (
          <HandCard key={inst.id} P={P} inst={inst} zone={tab === 'base' ? 'base' : 'bfUnits'} onTap={() => openMove(inst.id)} onLong={() => open(P.mySeat, inst.id)} />
        ))}
      </div>
      {others.filter((o) => o.list.length).map(({ p, list }) => (
        <div key={p.seat} className="oppzone">
          <h4 style={{ color: seatColor(p.seat) }}><span className="dot" style={{ background: seatColor(p.seat) }} /> {p.name}</h4>
          <div className="thumbs">
            {list.map((inst) => {
              const c = P.cards[inst.cardId]
              const hidden = !c || inst.faceDown
              return (
                <button key={inst.id} className={'thumb2' + (inst.tapped ? ' tapped' : '')} onClick={() => open(p.seat, inst.id)} aria-label={hidden ? 'Verdeckt' : c.name}>
                  {hidden ? <div className="back" /> : <CardImg src={c.image_url} alt={c.name} />}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}

export default function PhoneApp({ P, onLeave }) {
  const [sheet, setSheet] = useState(null)
  const [tab, setTab] = useState('hand')
  const close = () => setSheet(null)
  const hand = P.mine.zones.hand
  const stackN = stackEntries(P.players).length
  const lpRune = useLongPress(() => P.drawRune(), (e) => P.pileMenu('runeDeck', e))
  const lpDeck = useLongPress(() => P.drawCard(), (e) => P.pileMenu('deck', e))
  const openDetail = (seat, id) => setSheet({ t: 'detail', seat, id })
  // Der übergeordnete Code kann ebenfalls Blätter öffnen (z. B. Pfeil-Chip im Stack)
  P.ui.current = { open: (x) => (x?.t === 'stack' ? (setSheet(null), setTab('stack')) : setSheet(x)), detail: openDetail }
  const champs = P.mine.zones.champion
  const opps = P.players.filter((p) => p.seat !== P.mySeat && p.state)
  const legend = P.mine.zones.legend[0]
  const menuItems = [
    ['cards', 'Karten im Spiel ansehen', () => setSheet({ t: 'inplay' })],
    legend && ['legend', legend.tapped ? 'Legend enttappen' : 'Legend tappen', () => { P.act((p) => toggleFlag(p, legend.id, 'tapped')); close() }],
    ['token', 'Token auswählen', () => { close(); P.openModal('tokens') }],
    ['stack', 'Ganzer Tisch ansehen', () => { close(); P.showTable() }],
    ['rune', 'Runen bearbeiten', () => setSheet({ t: 'runes' })],
    ['trash', 'Trash und Banish ansehen', () => setSheet({ t: 'zones' })],
    ['deck', 'Deck: oberste Karten ansehen', () => { close(); P.openModal('look', 'deck') }],
    ['rune', 'Runendeck: oberste Karten ansehen', () => { close(); P.openModal('look', 'runeDeck') }],
    ['swap', 'Deck mischen', () => { P.act((p) => P.shuffle(p, 'deck')); close() }],
    ['gear', 'Einstellungen', () => setSheet({ t: 'settings' })],
    P.mine.outbox?.length > 0 && ['give', `Übergabe zurücknehmen (${P.mine.outbox.length})`, () => { P.takeBack(); close() }],
    ['banish', 'Neues Deck wählen', () => { close(); P.newDeck() }],
    P.isHost && ['gear', 'Session-Optionen', () => { close(); P.openModal('settings') }],
    ['back', 'Session verlassen', onLeave],
  ].filter(Boolean)
  return (
    <div className="ph">
      <header className="ph-top">
        <PointsBar player={P.players.find((p) => p.seat === P.mySeat)} />
        <div className="ph-btns">
          <IconBtn n="rune" label="Rune ziehen" badge={P.mine.zones.runeDeck.length} className="big" {...lpRune} />
          <IconBtn n="deck" label="Karte ziehen" badge={P.mine.zones.deck.length} className="big" {...lpDeck} />
          <IconBtn n="untap" label="Alles enttappen" className="big" onClick={() => P.act(untapAll)} />
          <IconBtn n="menu" label="Menü" className="big" onClick={() => setSheet({ t: 'menu' })} />
        </div>
      </header>
      <nav className="ph-tabs" role="tablist">
        {[['hand', 'hand', hand.length + champs.length, null, null],
          ['base', 'base', P.mine.zones.base.length, null, null],
          ...opps.map((p) => ['ob' + p.seat, 'base', p.state.zones.base.length, null, seatColor(p.seat)]),
          ...P.bfSeats.map((k, i) => [k, 'flag', P.players.flatMap((p) => (p.state?.zones.bfUnits || []).filter((u) => String(u.at) === String(k))).length, i + 1, null]),
          ['stack', 'stack', stackN, null, null]].map(([k, ic, n, num, col]) => (
          <button key={String(k)} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} aria-label={String(k)} style={col ? { boxShadow: `inset 0 -4px 0 ${col}` } : undefined}>
            <Icon n={ic} size={24} />{num != null && <b>{num}</b>}{n > 0 && <span className="ibadge">{n}</span>}
          </button>
        ))}
      </nav>
      <main className="ph-hand">
        {tab === 'hand' ? (
          <>
            {hand.length === 0 && champs.length === 0 && <p className="muted center pad">Keine Handkarten. Tippe auf das Deck-Symbol, um zu ziehen.</p>}
            <div className="hgrid">
              {hand.map((inst) => (
                <HandCard key={inst.id} P={P} inst={inst} onTap={() => setSheet({ t: 'play', id: inst.id, zone: 'hand' })} onLong={() => openDetail(P.mySeat, inst.id)} />
              ))}
            </div>
            {champs.length > 0 && (
              <div className="oppzone">
                <h4><Icon n="champion" size={16} /> Championzone</h4>
                <div className="hgrid">
                  {champs.map((inst) => (
                    <HandCard key={inst.id} P={P} inst={inst} zone="champion" onTap={() => setSheet({ t: 'play', id: inst.id, zone: 'champion' })} onLong={() => openDetail(P.mySeat, inst.id)} />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : tab === 'stack' ? <div className="stackwrap"><StackCol /></div>
          : typeof tab === 'string' && tab.startsWith('ob') ? <OppBase P={P} seat={Number(tab.slice(2))} onView={(seat, id) => setSheet({ t: 'view', seat, id })} />
          : <ZoneView P={P} tab={tab} open={openDetail} openMove={(id) => setSheet({ t: 'play', id, zone: 'move' })} />}
      </main>

      {sheet?.t === 'play' && (() => { const f = findInst(P.mine, sheet.id); return f ? <PlaySheet key={sheet.id} P={P} inst={f.inst} zone={f.zone} onClose={close} move={!['hand', 'champion'].includes(f.zone)} onDetail={() => openDetail(P.mySeat, f.inst.id)} /> : null })()}
      {sheet?.t === 'view' && <ViewSheet P={P} seat={sheet.seat} id={sheet.id} onClose={close} />}
      {sheet?.t === 'detail' && <DetailSheet key={sheet.id} P={P} seat={sheet.seat} id={sheet.id} onClose={close} />}
      {sheet?.t === 'inplay' && (
        <Sheet title="Karten im Spiel" onClose={close} tall>
          <TargetList P={P} onPick={(inst) => openDetail(ownerOf(P, inst.id), inst.id)} />
        </Sheet>
      )}
      {sheet?.t === 'stack' && <Sheet title="Stack" onClose={close} tall><div className="stackwrap"><StackCol /></div></Sheet>}
      {sheet?.t === 'runes' && <RuneSheet P={P} onClose={close} open={openDetail} />}
      {sheet?.t === 'zones' && (
        <Sheet title="Trash und Banish" onClose={close}>
          <div className="zpick">
            {P.players.filter((p) => p.state).map((p) => (
              <div key={p.seat} className="zrow" style={{ '--sc': seatColor(p.seat) }}>
                <b><span className="dot" style={{ background: seatColor(p.seat) }} /> {p.seat === P.mySeat ? 'Ich' : p.name}</b>
                <button onClick={() => setSheet({ t: 'zone', seat: p.seat, zone: 'trash' })} disabled={p.seat !== P.mySeat && !P.settings.trashInspect} aria-label="Trash"><Icon n="trash" size={26} /><span>{p.state.zones.trash.length}</span></button>
                <button onClick={() => setSheet({ t: 'zone', seat: p.seat, zone: 'banish' })} aria-label="Banish"><Icon n="banish" size={26} /><span>{p.state.zones.banish.length}</span></button>
              </div>
            ))}
          </div>
        </Sheet>
      )}
      {sheet?.t === 'zone' && <ZoneSheet P={P} seat={sheet.seat} zone={sheet.zone} onClose={() => setSheet({ t: 'zones' })} open={openDetail} />}
      {sheet?.t === 'settings' && (
        <Sheet title="Einstellungen" onClose={close}>
          <div className="stack pad">
            <label className="check"><input type="checkbox" checked={!!P.auto.pay} onChange={(e) => P.setAuto({ pay: e.target.checked })} /> Runen automatisch bezahlen (und unbezahlbare Karten sperren)</label>
            <label className="check"><input type="checkbox" checked={P.auto.legend !== false} onChange={(e) => P.setAuto({ legend: e.target.checked })} /> Legend-Rabatt anwenden</label>
            <label className="check"><input type="checkbox" checked={!!P.auto.exhaust} onChange={(e) => P.setAuto({ exhaust: e.target.checked })} /> Einheiten automatisch tappen</label>
          </div>
        </Sheet>
      )}
      {sheet?.t === 'menu' && (
        <Sheet title="Menü" onClose={close}>
          <div className="menulist">
            {menuItems.map(([ic, label, run]) => (
              <button key={label} onClick={run}><Icon n={ic} size={22} /><span>{label}</span></button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  )
}
