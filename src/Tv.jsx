import { useEffect, useState } from 'react'
import { CardView, CardList, StackCol, extraBattlefields, seatColor, useG } from './Table'
import { stackEntries } from './game'

// Fernseher / Zuschauer: der Bildschirm wird in gleich hohe Reihen geteilt.
//   Reihe pro Spieler:  Stapel | Runen (bis 12, leicht versetzt) | Base | Legend + Champion
//   Reihe pro Battlefield: links Einheiten des einen Spielers, in der Mitte die Battlefield-Karte, rechts die des anderen
// Alle Größen werden in Pixeln berechnet (läuft dadurch auch auf älteren Fernseher-Browsern).

function useViewport() {
  const [s, set] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const f = () => set({ w: window.innerWidth, h: window.innerHeight })
    addEventListener('resize', f)
    return () => removeEventListener('resize', f)
  }, [])
  return s
}

const GAP = 6
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// Karten einer Zone in einer Zeile: passen sie nicht nebeneinander, überlappen sie sich leicht
function Flow({ list, width, cw, children, className = '' }) {
  const tops = list.filter((i, _k, all) => !i.att || !all.some((o) => o.id === i.att))
  const natural = tops.reduce((s, i) => s + (i.tapped ? cw * 1.4 : cw), 0) + GAP * Math.max(0, tops.length - 1)
  const ovl = tops.length > 1 && natural > width ? Math.ceil((natural - width) / (tops.length - 1)) : 0
  return <div className={'ovflow ' + className} style={{ '--ovl': ovl }}>{children}</div>
}

function Zone({ title, count, className = '', style, children }) {
  return (
    <div className={'z2 ' + className} style={style}>
      <div className="z2t">{title}{count != null && <span className="muted"> · {count}</span>}</div>
      <div className="z2c">{children}</div>
    </div>
  )
}

const RUNE_COL = { Fury: '#ff4d3d', Calm: '#2fd6a0', Mind: '#4da3ff', Body: '#ff9a2e', Chaos: '#b86bff', Order: '#ffd93b' }

// Runen am Fernseher als Punkte: bereit = in Runenfarbe gefüllt, getappt = leerer Kreis
function RuneDots({ list, d }) {
  const g = useG()
  return (
    <div className="rdots" style={{ '--d': d + 'px' }}>
      {list.map((r) => {
        const col = r.floating ? '#ffffff' : RUNE_COL[g.cards[r.cardId]?.color] || '#cfd8e6'
        return <i key={r.id} className={'rdot' + (r.tapped ? ' off' : ' on')} style={{ '--rc': col }} />
      })}
    </div>
  )
}

function Points({ pts }) {
  const slots = Math.max(9, pts + 1)
  return <span className="ptrack" aria-label={`${pts} Punkte`}>{Array.from({ length: slots }, (_, i) => <i key={i} className={i < pts ? 'lit' : ''} />)}</span>
}

function PlayerRow({ player, cw, W, color, rowH }) {
  const g = useG()
  if (!player.state) {
    return <div className="prow wait" style={{ '--sc': color }}><span className="muted">{player.name}: wählt noch ein Deck…</span></div>
  }
  const z = player.state.zones
  const d = clamp(Math.floor((rowH - 56) / 3), 20, 56)
  const rw = d * 4 + 3 * 8 + 18
  const lw = cw * 2 + GAP + 14
  const bw = Math.max(cw, W - rw - lw - 2 * 8 - 16)
  const ready = z.runes.filter((r) => !r.tapped).length
  const pts = player.state.points || 0
  const showHand = g.settings.handCount || player.seat === g.mySeat
  return (
    <div className="prow" style={{ '--sc': color, gridTemplateColumns: `${rw}px ${bw}px ${lw}px` }}>
      <Zone title={<span className="bignum"><span className="muted">Runen</span> <b>{ready}</b><span className="muted">/{z.runes.length}</span></span>} className="runes"><RuneDots list={z.runes} d={d} /></Zone>
      <Zone title={<><span className="dot" style={{ background: color }} /><b className="pname">{player.name}</b>
        <span className="bigpts" title="Punkte">{pts}</span><Points pts={pts} />
        {showHand && <span className="bignum"><span className="muted">Hand</span> <b>{z.hand.length}</b></span>}</>} className="base">
        {z.base.length
          ? <Flow list={z.base} width={bw - 12} cw={cw}><CardList seat={player.seat} zone="base" list={z.base} /></Flow>
          : <span className="muted small">Base leer</span>}
      </Zone>
      <Zone title="Legend · Champion" className="lc">
        <div className="lcrow"><CardList seat={player.seat} zone="legend" list={z.legend} /><CardList seat={player.seat} zone="champion" list={z.champion} /></div>
      </Zone>
    </div>
  )
}

function Band({ bf, players, cw, W }) {
  const g = useG()
  const card = bf.inst
  const bfw = Math.round(cw * 1.4)
  const n = Math.max(1, players.length)
  const hw = Math.floor((W - bfw - 2 * 8 - 16) / n)
  const overs = g.players.flatMap((p) => (p.state?.zones.bfExtra || []).filter((i) => i.ovr === String(bf.key)).map((inst) => ({ seat: p.seat, inst })))
  const half = (p) => {
    const list = (p.state?.zones.bfUnits || []).filter((i) => String(i.at) === String(bf.key))
    return (
      <div key={p.seat} className="half" style={{ '--sc': seatColor(p.seat), width: hw }}>
        <div className="halft"><span className="dot" style={{ background: seatColor(p.seat) }} />{p.name}</div>
        {list.length ? <Flow list={list} width={hw - 14} cw={cw}><CardList seat={p.seat} zone="bfUnits" list={list} /></Flow> : <span className="muted small halfe">–</span>}
      </div>
    )
  }
  const center = (
    <div key="bf" className="bfmid2" style={{ width: bfw }}>
      <div className="bf2t"><span className="dot" style={{ background: seatColor(bf.owner.seat) }} />{bf.extra ? 'Zusatz' : bf.owner.name}</div>
      <div className="bfcard">
        <CardView card={g.cards[card.cardId]} inst={card} handlers={g.bindCard(bf.owner.seat, bf.extra ? 'bfExtra' : 'battlefield', card)} />
        {overs.map((o, i) => <div key={o.inst.id} className="bfover" style={{ '--n': i }}><CardView card={g.cards[o.inst.cardId]} inst={o.inst} owner={o.seat} handlers={g.bindCard(o.seat, 'bfExtra', o.inst)} /></div>)}
      </div>
    </div>
  )
  const parts = players.map(half)
  const order = players.length === 2 ? [parts[0], center, parts[1]] : [center, ...parts]
  return <div className="band">{order}</div>
}

// Zwei Spieler: Battlefields stehen nebeneinander in der Mitte. Oben die Einheiten des oberen Spielers, unten die des unteren; die Karte liegt dazwischen.
function MidBoard({ bfs, players, cw, W, rowH }) {
  const g = useG()
  const n = Math.max(1, bfs.length)
  const colW = Math.floor((W - (n - 1) * 8) / n)
  const bfw = Math.min(Math.round(cw * 1.7), colW - 12)
  const bfh = Math.round(bfw / 1.4)
  const half = (p, key, pos) => {
    const list = (p.state?.zones.bfUnits || []).filter((i) => String(i.at) === String(key))
    return (
      <div className={'bfhalf ' + pos} style={{ '--sc': seatColor(p.seat), height: rowH }}>
        <div className="halft"><span className="dot" style={{ background: seatColor(p.seat) }} />{p.name}</div>
        {list.length > 0 && <Flow list={list} width={colW - 14} cw={cw}><CardList seat={p.seat} zone="bfUnits" list={list} /></Flow>}
      </div>
    )
  }
  return (
    <>
      {bfs.map((bf) => {
        const overs = g.players.flatMap((p) => (p.state?.zones.bfExtra || []).filter((i) => i.ovr === String(bf.key)).map((inst) => ({ seat: p.seat, inst })))
        return (
          <div key={bf.key} className="bfcol" style={{ width: colW, height: rowH * 2 + 4 }}>
            {half(players[0], bf.key, 'top')}
            <div className="bfcenter" style={{ top: rowH + 2 - bfh / 2, width: bfw, height: bfh, marginLeft: -bfw / 2 }}>
              <div className="bfcard2" style={{ '--cw': Math.round(bfw / 1.4) + 'px' }}>
                <CardView card={g.cards[bf.inst.cardId]} inst={bf.inst} handlers={g.bindCard(bf.owner.seat, bf.extra ? 'bfExtra' : 'battlefield', bf.inst)} />
                {overs.map((o, i) => <div key={o.inst.id} className="bfover" style={{ '--n': i }}><CardView card={g.cards[o.inst.cardId]} inst={o.inst} owner={o.seat} handlers={g.bindCard(o.seat, 'bfExtra', o.inst)} /></div>)}
              </div>
            </div>
            {half(players[1], bf.key, 'bot')}
          </div>
        )
      })}
    </>
  )
}

export function TvTable({ players, headH = 56 }) {
  const { w, h } = useViewport()
  const bfs = [
    ...players.filter((p) => p.state?.zones.battlefield.length).map((p) => ({ key: p.seat, owner: p, inst: p.state.zones.battlefield[0] })),
    ...extraBattlefields(players).map((x) => ({ key: 'x' + x.inst.id, owner: x.owner, inst: x.inst, extra: true })),
  ]
  const nTop = Math.floor(players.length / 2)
  const two = players.length === 2
  const rows = two ? 4 : Math.max(1, players.length) + Math.max(1, bfs.length)
  const H = h - headH - 10
  const rowH = Math.floor((H - GAP * (rows - 1)) / rows)
  const cw0 = Math.floor((rowH - 54) / 1.4)
  // Breite begrenzt die Kartengröße zusätzlich (Stack rechts + 4 Spalten)
  const cw = clamp(Math.min(cw0, Math.floor((w - 80) / 9.6)), 34, 210)
  // Stack: schmal, solange er leer ist; mit Karten passt sich die Breite an die Kartengröße an, sodass kein Scrollen nötig ist
  const nSt = stackEntries(players).length
  const midH = two ? rowH * 2 + 4 : Math.max(1, bfs.length) * (rowH + 4)
  const availH = midH - 130
  const swMax = Math.round(cw * 1.6)
  let sw = Math.min(swMax, Math.floor((availH - Math.max(0, nSt - 1) * 8) / Math.max(1, nSt) / 1.4))
  let sov = 0
  if (sw < 46) { sw = 46; sov = nSt > 1 ? Math.max(-Math.round(46 * 1.4 * 0.8), Math.floor((availH - nSt * 64.4) / (nSt - 1)) - 8) : 0 }
  const stw = nSt ? Math.min(sw + 34, Math.floor(w * 0.25)) : 66
  const Wc = w - stw - 22
  const Wf = w - 14
  const topP = players.slice(0, nTop)
  const botP = players.slice(nTop)
  const prow = (p) => <PlayerRow key={p.seat} player={p} cw={cw} W={Wf} color={seatColor(p.seat)} rowH={rowH} />
  return (
    <div className="tv2" style={{ '--cw': cw + 'px', '--rowh': rowH + 'px', '--stw': stw + 'px', height: h - headH }}>
      {topP.map(prow)}
      <div className="tv2-mid">
        <div className={'tv2-main' + (two && bfs.length ? ' two' : '')} style={{ width: Wc }}>
          {two && bfs.length ? <MidBoard bfs={bfs} players={players} cw={cw} W={Wc} rowH={rowH} /> : bfs.length
            ? bfs.map((b) => <Band key={b.key} bf={b} players={players} cw={cw} W={Wc} />)
            : <div className="band empty"><span className="muted">Battlefields werden gewählt…</span></div>}
        </div>
        <div className={'tv2-stack' + (nSt ? '' : ' empty')} style={{ width: stw, '--sw': sw + 'px', '--sov': sov + 'px' }}><StackCol /></div>
      </div>
      {botP.map(prow)}
    </div>
  )
}
