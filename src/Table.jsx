import { createContext, useContext } from 'react'
import { kindOf, isBfToken, canAim, COUNTERS, STATUSES, stackEntries, stackSig, approvedBy } from './game'
import CardImg from './CardImg'

// Alles, was die Tisch-Bausteine von der Session brauchen (Karten, Regeln, Spieler, Drag-Zustand, Klick-Handler)
export const GameCtx = createContext(null)
export const useG = () => useContext(GameCtx)

export const SEAT_COLORS = ['#6cb8ff', '#ff9a6c', '#8fd7a4', '#d79cff']
export const seatColor = (seat) => SEAT_COLORS[(((seat || 1) - 1) % 4 + 4) % 4]

const dropCls = (g, key) => {
  if (!key || !g.drag || !g.drag.allowed.includes(key)) return ''
  return g.drag.over === key ? ' dropok dropover' : ' dropok'
}

// Marken (Buff, Schaden, Might, Marker, Stunned) als kleine Chips unten auf der Karte
function Marks({ inst }) {
  const c = inst.counters || {}
  const st = inst.status || {}
  const chips = []
  COUNTERS.forEach((d) => {
    if (c[d.key]) chips.push([d.key, `${d.label} ${d.signed && c[d.key] > 0 ? '+' : ''}${c[d.key]}`])
  })
  STATUSES.forEach((d) => { if (st[d.key]) chips.push([d.key, d.label]) })
  if (!chips.length) return null
  return <div className="marks">{chips.map(([k, t]) => <span key={k} className={'mk ' + k}>{t}</span>)}</div>
}

export function CardView({ card, inst, reveal = true, small, xs, onClick, handlers, dim, owner, extra, aimFrom, iid, drop, onChip, chipTitle, chipAttr }) {
  const g = useContext(GameCtx)
  const hidden = !card || (inst?.faceDown && !reveal)
  const land = (kindOf(card) === 'battlefield' || isBfToken(card)) && !hidden
  const h = { ...(handlers || {}) }
  if (onClick) h.onClick = onClick
  const cls = ['card', inst?.tapped && 'tapped', small && 'small', xs && 'xs', land && 'land', dim && 'dim', owner && 'owned', aimFrom && 'aimfrom',
    (h.onClick || h.onPointerDown) && 'clickable', h.onPointerDown && 'draggable', g && dropCls(g, drop).trim()].filter(Boolean).join(' ')
  return (
    <div className={cls} style={owner ? { '--oc': seatColor(owner) } : undefined} data-iid={iid || inst?.id} data-drop={drop} {...h} title={card?.name}>
      {hidden ? <div className="back" /> : <CardImg src={card.image_url} alt={card.name} battlefield={land} />}
      {onChip && !hidden && !g?.aim && (
        <button className="aimchip" title={chipTitle || 'Pfeil auf ein Ziel setzen'} {...(chipAttr || { 'data-aim': inst?.id })}
          onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onChip() }}>➚</button>
      )}
      {inst?.faceDown && reveal && <span className="badge">verdeckt</span>}
      {!hidden && inst && <Marks inst={inst} />}
      {extra}
    </div>
  )
}

// Zähler- und Statusübersicht (beim Hovern über eine Karte im Spiel oder in der Vorschau)
export function CounterPanel({ inst, onCounter, onStatus, onClear }) {
  const c = inst.counters || {}
  const st = inst.status || {}
  return (
    <div className="cp">
      {COUNTERS.map((d) => (
        <div className="cp-row" key={d.key}>
          <span>{d.label}</span>
          <span className="cp-ctl">
            <button aria-label={d.label + ' weniger'} onClick={() => onCounter(d.key, -1)}>−</button>
            <b>{d.signed && (c[d.key] || 0) > 0 ? '+' : ''}{c[d.key] || 0}</b>
            <button aria-label={d.label + ' mehr'} onClick={() => onCounter(d.key, 1)}>+</button>
          </span>
        </div>
      ))}
      <div className="cp-chips">
        {STATUSES.map((d) => (
          <button key={d.key} className={st[d.key] ? 'on' : ''} onClick={() => onStatus(d.key)}>{d.label}</button>
        ))}
        <button onClick={onClear}>Zurücksetzen</button>
      </div>
    </div>
  )
}



// Liste von Karten einer Zone. Angehängte Karten (Equipment) werden mit ihrer Hauptkarte gruppiert: nur der untere Teil bleibt sichtbar.
export function CardList({ seat, zone, list, xs, outline }) {
  const g = useG()
  const own = seat === g.mySeat
  const ids = new Set(list.map((i) => i.id))
  const hostable = own && (zone === 'base' || zone === 'bfUnits')
  const one = (inst, extraProps = {}) => (
    <CardView key={inst.id} card={g.cards[inst.cardId]} inst={inst} reveal={own} xs={xs} owner={outline ? seat : undefined}
      handlers={g.bindCard(seat, zone, inst)} dim={g.drag?.id === inst.id} aimFrom={g.aim === inst.id}
      onChip={own && canAim(zone) && g.onAim ? () => g.onAim(inst.id) : undefined} {...extraProps} />
  )
  return list.filter((i) => !i.att || !ids.has(i.att)).map((host) => {
    const kids = list.filter((i) => i.att === host.id)
    const drop = hostable ? `card:${host.id}` : undefined
    if (!kids.length) return one(host, { drop })
    let cum = 0
    const stops = kids.map((k) => { cum += k.peek || 0.22; return cum })
    const total = cum
    return (
      <div key={host.id} className={'cgroup' + (host.tapped ? ' tapped' : '')}
        style={{ '--gw': xs ? 'calc(var(--cw) * var(--xs, .66))' : 'var(--cw)', '--pk': total }}>
        {kids.map((k, i) => (
          <div key={k.id} className="cg-kid" style={{ '--off': stops[i], zIndex: 10 - i }}>
            {one({ ...k, tapped: false })}
          </div>
        ))}
        <div className="cg-host" style={{ zIndex: 20 }}>{one({ ...host, tapped: false }, { drop })}</div>
      </div>
    )
  })
}

const Empty = ({ children }) => <span className="muted small">{children}</span>

export function Tag({ player }) {
  return (
    <div className="tag">
      <span className="dot" style={{ background: seatColor(player.seat) }} />
      <b>{player.name}</b>
      {player.state?.deckName && <span className="muted">{player.state.deckName}</span>}
      <span className="pts">{player.state?.points ?? 0} Punkte</span>
    </div>
  )
}

// Gemeinsamer Stack ganz rechts: oben liegt, was zuerst aufgelöst wird. Alle Spieler bestätigen mit OK, dann löst der Besitzer der obersten Karte auf.
export function StackCol() {
  const g = useG()
  const entries = stackEntries(g.players)
  const sig = stackSig(entries)
  const everyone = g.players.filter((p) => p.state)
  const approved = everyone.map((p) => ({ p, ok: approvedBy(p, sig) }))
  const allOk = entries.length > 0 && approved.every((a) => a.ok)
  const top = entries[entries.length - 1]
  const iOk = approved.some((a) => a.p.seat === g.mySeat && a.ok)
  const drop = g.mySeat != null ? 'stack' : undefined
  return (
    <aside className={'stackcol' + dropCls(g, drop)} data-drop={drop}>
      <div className="zt">Stack{entries.length ? ` · ${entries.length}` : ''}</div>
      <div className="stack-list">
        {entries.length === 0 && <span className="muted small stack-empty">Leer. Spells hierher ziehen oder mit ➚ spielen.</span>}
        {[...entries].reverse().map((e, i) => (
          <div key={e.key} className="st-item">
            <CardView xs card={g.cards[e.cardId]} owner={e.seat} iid={e.key}
              inst={e.inst || { id: e.key, cardId: e.cardId }}
              handlers={e.inst ? g.bindCard(e.seat, 'stack', e.inst) : { onClick: () => (g.aim ? g.pickTarget(e.key) : g.previewCard(e.cardId)) }}
              onChip={e.inst && e.seat === g.mySeat && g.onAim ? () => g.onAim(e.inst.id) : undefined}
              dim={g.drag?.id === e.key} aimFrom={g.aim === e.key}
              extra={<>
                {i === 0 && entries.length > 1 && <span className="topbadge">oben</span>}
                {e.fx && <span className="fxbadge">Effekt</span>}
              </>} />
            {e.fx && e.seat === g.mySeat && <button className="xbtn" title="Eintrag entfernen" onClick={() => g.onRemoveFx(e.fx.id)}>×</button>}
          </div>
        ))}
      </div>
      <div className="stack-ctl">
        {entries.length > 0 && (<>
          <span className="oks">
            {approved.map(({ p, ok }) => (
              <span key={p.seat} className={'okdot' + (ok ? ' on' : '')} style={{ '--oc': seatColor(p.seat) }} title={`${p.name}: ${ok ? 'OK' : 'wartet'}`} />
            ))}
          </span>
          {g.mySeat != null && <button className={iOk ? 'primary' : ''} onClick={() => g.onApprove(sig, !iOk)}>{iOk ? 'OK ✓' : 'OK'}</button>}
          {allOk && top.seat === g.mySeat && <button className="primary" onClick={() => g.onResolve(top)}>Auflösen</button>}
          {allOk && top.seat !== g.mySeat && <span className="muted small">{g.players.find((p) => p.seat === top.seat)?.name} löst auf</span>}
        </>)}
      </div>
      {g.onTokens && <button className="tokenbtn" onClick={g.onTokens} title="Token-Karten spielen">Tokens</button>}
    </aside>
  )
}


// Alle Zusatz-Battlefields (Tokens im Modus „3. Battlefield“) in Sitzreihenfolge
export const extraBattlefields = (players) => players.flatMap((pl) => (pl.state?.zones.bfExtra || []).filter((i) => !i.ovr).map((inst) => ({ owner: pl, inst })))

// Punkte: Reihe 0–8 zum Anwählen, − links und + rechts für mehr; bei fremden Spielern nur Anzeige
export function PointsBar({ player }) {
  const g = useG()
  const own = player.seat === g.mySeat
  const pts = player.state?.points || 0
  const slots = Math.max(9, pts + 1)
  return (
    <div className="pointsbar" style={{ '--sc': seatColor(player.seat) }}>
      <span className="pb-name"><span className="dot" style={{ background: seatColor(player.seat) }} />{player.name}</span>
      {own && <button className="pb-step" aria-label="Punkt abziehen" onClick={() => g.onPoints(-1)}>−</button>}
      <span className="pb-track" role="group" aria-label={`Punkte von ${player.name}`}>
        {Array.from({ length: slots }, (_, i) => {
          const cls = 'pb-n' + (i === pts ? ' on' : i < pts ? ' lit' : '')
          return own
            ? <button key={i} className={cls} aria-pressed={i === pts} onClick={() => g.onSetPoints(i)}>{i}</button>
            : <span key={i} className={cls}>{i}</span>
        })}
      </span>
      {own && <button className="pb-step" aria-label="Punkt dazu" onClick={() => g.onPoints(1)}>+</button>}
      <b className="pb-val">{pts} Punkte</b>
    </div>
  )
}




