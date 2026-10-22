import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, loadCards } from './supabase'
import { go } from './nav'
import { GameCtx, seatColor, StackCol } from './Table'
import CardImg, { applyBfRotation, setBfRotation } from './CardImg'
import { Modal, PopMenu, ArrowLayer, LookModal, DeckPicker, Setup, PayModal, TokenModal } from './Parts'
import { TvTable } from './Tv'
import PhoneApp from './Phone'
import { Icon, IconBtn } from './ui'
import {
  DEFAULT_SETTINGS, buildPlayer, moveCard, toggleFlag, draw, drawRune, shuffleZone, untapAll, addPoints,
  pickBattlefield, pickChampion, fixState, findInst, kindOf, toggleTarget, removeTarget, giveCard, acceptGift, dropGift, takeBackGifts,
  changeCounter, toggleStatus, clearMarks, setApproval, resolveEntry, playToStack, addFx, attachCard,
  syncBuffs, FLOAT_CARD, legendDiscount, exhaust, costOf, planPayment, applyPayment, moveAuto, spawnTokens, setPoints, drawBottom, drawRuneBottom,
} from './game'

export const SETTING_LABELS = {
  trashTop: 'Oberste Trash-Karte der anderen sichtbar',
  trashInspect: 'Andere dürfen den ganzen Trash ansehen',
  handCount: 'Anzahl der Handkarten der anderen sichtbar',
  battlefieldRandom: 'Battlefield zufällig zuweisen (gilt für neue Deckwahl)',
}

const newest = (a, b) => (!a ? b : !b ? a : (a.ts || 0) >= (b.ts || 0) ? a : b)

export default function Session({ id, view, user }) {
  const [row, setRow] = useState(null)
  const [members, setMembers] = useState([])
  const [cards, setCards] = useState({})
  const [live, setLive] = useState({})            // per Broadcast empfangene Spielerzustände
  const [mine, setMine] = useState(undefined)     // undefined = lädt, null = noch kein Deck
  const mineRef = useRef(undefined)
  const chRef = useRef(null)
  const ui = useRef({})                           // Brücke zur Handy-Ansicht (Blätter öffnen)
  const [modal, setModal] = useState(null)
  const [menu, setMenu] = useState(null)
  const [showing, setShowing] = useState(null)    // kurz gezeigte Karten eines Mitspielers
  const seenShown = useRef({})
  const [rot, setRot] = useState(() => applyBfRotation())
  const [err, setErr] = useState('')
  const [showTable, setShowTable] = useState(false)
  const [auto, setAutoState] = useState(() => { try { return { pay: true, exhaust: true, ...JSON.parse(localStorage.getItem('rt:auto')) } } catch { return { pay: true, exhaust: true } } })
  const setAuto = (patch) => setAutoState((a) => { const n = { ...a, ...patch }; try { localStorage.setItem('rt:auto', JSON.stringify(n)) } catch { /* egal */ } return n })
  const [payAsk, setPayAsk] = useState(null)      // Rückfrage: welche Runen sollen für Power recycelt werden?
  const [notice, setNotice] = useState('')
  const noticeT = useRef(null)
  const say = (t) => { setNotice(t); clearTimeout(noticeT.current); noticeT.current = setTimeout(() => setNotice(''), 5500) }

  const me = members.find((m) => m.user_id === user.id)
  const mySeat = me?.seat ?? null
  const isHost = row?.host_id === user.id
  const settings = { ...DEFAULT_SETTINGS, ...(row?.settings || {}) }
  const loadRow = useCallback(async () => {
    const { data, error } = await supabase.from('sessions').select('*').eq('id', id).maybeSingle()
    if (error) setErr(error.message)
    else if (data) setRow(data)
    else setErr('Session nicht gefunden oder kein Zugriff.')
  }, [id])

  const loadMembers = useCallback(async () => {
    const { data } = await supabase.from('session_members').select('*, profiles(username)').eq('session_id', id)
    setMembers(data || [])
  }, [id])

  useEffect(() => {
    loadRow(); loadMembers()
    const put = (list) => setCards({ ...Object.fromEntries((list || []).map((c) => [c.id, c])), [FLOAT_CARD.id]: FLOAT_CARD })
    let dead = false
    loadCards((list) => { if (!dead) put(list) }).then(({ cached }) => { if (cached && !dead) put(cached) })
    let connected = false
    const ch = supabase
      .channel(`table-${id}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'seat' }, ({ payload }) => setLive((l) => ({ ...l, [payload.seat]: payload.state })))
      .on('broadcast', { event: 'settings' }, ({ payload }) => setRow((r) => r && { ...r, settings: payload }))
      .on('broadcast', { event: 'ping' }, () => { loadRow(); loadMembers() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${id}` }, (p) => p.new && setRow((r) => ({ ...(r || {}), ...p.new })))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_members', filter: `session_id=eq.${id}` }, loadMembers)
      .subscribe((status) => {
        connected = status === 'SUBSCRIBED'
        if (connected) ch.send({ type: 'broadcast', event: 'ping', payload: {} })
      })
    chRef.current = ch
    // Notfall-Auffrischung: ohne Live-Verbindung alle 3 s, mit Live-Verbindung nur alle 15 s; im Hintergrund-Tab gar nicht
    let n = 0
    const t = setInterval(() => { n++; if (!document.hidden && (!connected || n % 5 === 0)) { loadRow(); loadMembers() } }, 3000)
    return () => { dead = true; clearInterval(t); chRef.current = null; supabase.removeChannel(ch) }
  }, [id, loadRow, loadMembers])

  useEffect(() => {
    if (mySeat && row && mineRef.current === undefined) {
      mineRef.current = fixState(row.state?.players?.[mySeat])
      setMine(mineRef.current)
    }
  }, [mySeat, row])

  async function commit(next) {
    const ts = Date.now()
    const payload = next ? { ...next, ts } : { ts }
    mineRef.current = next ? payload : null
    setMine(mineRef.current)
    chRef.current?.send({ type: 'broadcast', event: 'seat', payload: { seat: mySeat, state: payload } })
    const { error } = await supabase.rpc('set_seat_state', { p_session: id, p_state: payload })
    if (error) setErr(error.message)
  }
  const act = (fn) => mineRef.current && commit(fn(mineRef.current))
  // Buff-Tokens auf Einheiten zählen automatisch den Buff-Zähler mit
  useEffect(() => {
    if (!mineRef.current || !Object.keys(cards).length) return
    const n = syncBuffs(mineRef.current, cards)
    if (n !== mineRef.current) commit(n)
  }, [mine, cards]) // eslint-disable-line

  const players = members
    .filter((m) => m.seat)
    .sort((a, b) => a.seat - b.seat)
    .map((m) => {
      const s = m.seat === mySeat ? mine : newest(live[m.seat], row?.state?.players?.[m.seat])
      return { seat: m.seat, name: m.profiles?.username || 'Spieler', state: fixState(s) }
    })
  const nameOf = (seat) => players.find((p) => p.seat === seat)?.name || '?'
  const stateOf = (seat) => players.find((p) => p.seat === seat)?.state
  const bfSeats = [
    ...players.filter((p) => p.state?.zones.battlefield.length).map((p) => p.seat),
    ...players.flatMap((p) => (p.state?.zones.bfExtra || []).filter((i) => !i.ovr).map((i) => 'x' + i.id)),
  ]

  // ───────── Übergaben: Karten, die Mitspieler mir gegeben haben, übernehmen; eigene erledigte Übergaben aufräumen ─────────
  const giftKey = players.map((p) => p.seat + ':' + (p.state?.outbox || []).map((g) => `${g.inst.id}>${g.to}`).join(',')).join(';')
    + '|' + (mine?.outbox || []).map((g) => g.inst.id + (stateOf(g.to) && findInst(stateOf(g.to), g.inst.id) ? '+' : '-')).join(',')
  useEffect(() => {
    if (!mySeat || !mineRef.current) return
    let next = mineRef.current
    let changed = false
    for (const pl of players) {
      if (pl.seat === mySeat) continue
      for (const g of pl.state?.outbox || []) {
        if (g.to === mySeat && !findInst(next, g.inst.id)) { next = acceptGift(next, g); changed = true }
      }
    }
    for (const g of next.outbox || []) {
      const rs = stateOf(g.to)
      if (rs && findInst(rs, g.inst.id)) { next = dropGift(next, g.inst.id); changed = true }
    }
    if (changed) commit(next)
  }, [giftKey]) // eslint-disable-line

  // ───────── Aufräumen: Einheiten auf einem verschwundenen Zusatz-Battlefield kehren ins Base zurück, Overlays ohne Battlefield verschwinden ─────────
  const bfKeyNow = bfSeats.map(String)
  const orphans = mine ? [
    ...mine.zones.bfUnits.filter((i) => typeof i.at === 'string' && !bfKeyNow.includes(i.at)).map((i) => ['u', i.id]),
    ...(mine.zones.bfExtra || []).filter((i) => i.ovr && !bfKeyNow.includes(i.ovr)).map((i) => ['o', i.id]),
  ] : []
  const orphanKey = players.every((p) => p.state) ? orphans.map((o) => o.join(':')).join(',') : ''
  useEffect(() => {
    if (!orphanKey || !mineRef.current) return
    let next = mineRef.current
    for (const [kind, id] of orphans) next = moveCard(next, id, kind === 'u' ? 'base' : 'trash')
    commit(next)
  }, [orphanKey]) // eslint-disable-line

  // ───────── Kurz gezeigte Karten (z. B. beim Ansehen der obersten Deckkarten) ─────────
  useEffect(() => {
    for (const pl of players) {
      const sh = pl.state?.shown
      if (!sh || seenShown.current[pl.seat] === sh.at) continue
      const first = seenShown.current[pl.seat] === undefined
      seenShown.current[pl.seat] = sh.at
      if (first && Date.now() - sh.at > 15000) continue
      if (pl.seat === mySeat) continue
      setShowing({ name: pl.name, cardIds: sh.cardIds, at: sh.at })
      const t = setTimeout(() => setShowing((cur) => (cur && cur.at === sh.at ? null : cur)), 6000)
      return () => clearTimeout(t)
    }
    return undefined
  }, [players.map((p) => p.state?.shown?.at || 0).join(',')]) // eslint-disable-line

  // ───────── Spielaktionen ─────────
  const markFns = (iid) => ({
    onCounter: (k, d) => act((p) => changeCounter(p, iid, k, d)),
    onStatus: (k) => act((p) => toggleStatus(p, iid, k)),
    onClear: () => act((p) => clearMarks(p, iid)),
  })

  // Kann die Karte bezahlt werden? Berücksichtigt Legend-Rabatt und Runenfarben. known=false: keine Kosten hinterlegt.
  function afford(instId) {
    const cur = findInst(mineRef.current, instId)
    const card = cur && cards[cur.inst.cardId]
    let cost = card && costOf(card)
    if (!cost) return { known: false, ok: true }
    let saved = null
    let legendId = null
    if (auto.legend !== false) {
      const legendInst = mineRef.current.zones.legend[0]
      const d = legendDiscount(cards[legendInst?.cardId], card, cost)
      if (d.saved && !(d.saved.tap && legendInst.tapped)) { cost = d.cost; saved = d.saved; legendId = legendInst.id }
    }
    let plan = planPayment(mineRef.current, cost, cards)
    if (plan.choice) plan = planPayment(mineRef.current, cost, cards, plan.choice.candidates.slice(0, plan.choice.n))
    const ok = plan.missingEnergy <= 0 && plan.missingPower <= 0
    return { known: true, ok, cost, saved: saved && { ...saved, legendId }, plan, missing: { energy: Math.max(0, plan.missingEnergy), power: Math.max(0, plan.missingPower) } }
  }
  const missingText = (m) => [m.energy && `${m.energy} Energy`, m.power && `${m.power} Power`].filter(Boolean).join(' und ')

  // Karte aus Hand/Champion-Zone ins Spiel: Kosten prüfen und automatisch mit Runen bezahlen (Energy = tappen, Power = recyceln), dann die Aktion ausführen.
  // Fehlen passende Runen, wird die Karte nicht gespielt.
  function payThen(instId, to, run) {
    const cur = findInst(mineRef.current, instId)
    const card = cur && cards[cur.inst.cardId]
    const play = !!cur && ['hand', 'champion'].includes(cur.zone) && (to === 'stack' || to === 'base' || to.startsWith('bf:')) && !cur.inst.faceDown && !cur.inst.token
    if (!play || !auto.pay) return act(run)
    const aff = afford(instId)
    if (!aff.known) {
      if (card && !['rune', 'legend', 'battlefield'].includes(kindOf(card))) say(`Kosten von „${card.name}“ sind nicht hinterlegt, deshalb nicht automatisch bezahlt.`)
      return act(run)
    }
    if (!aff.ok) { say(`„${card.name}“ kann nicht gespielt werden: Es fehlen ${missingText(aff.missing)}. (Unter Einstellungen lässt sich das automatische Bezahlen ausschalten.)`); return undefined }
    const saved = aff.saved
    const plan = planPayment(mineRef.current, aff.cost, cards)
    if (plan.choice) return setPayAsk({ cost: aff.cost, choice: plan.choice, run, name: card.name, saved })
    return finishPay(plan, run, card.name, saved)
  }
  function finishPay(plan, run, name, saved) {
    act((p) => { const n = run(applyPayment(p, plan)); return saved?.tap && saved.legendId ? exhaust(n, saved.legendId) : n })
    const msgs = []
    if (saved) msgs.push(`Die Legend übernimmt ${[saved.energy && `${saved.energy} Energy`, saved.power && `${saved.power} Power`].filter(Boolean).join(' und ')}${saved.tap ? ' und wird getappt' : ''}.`)
    if (plan.floats > 0) msgs.push(`Zu wenige getappte Runen der richtigen Farbe: ${plan.floats} bereite Rune${plan.floats > 1 ? 'n' : ''} recycelt, dafür liegt ${plan.floats} Floating Energy bei deinen Runen.`)
    if (plan.floatUsed > 0) msgs.push(`${plan.floatUsed} Floating Energy hat gleich Energy bezahlt.`)
    if (msgs.length) say(`„${name}“: ${msgs.join(' ')}`)
  }

  const place = (instId, dest, targetId) => payThen(instId, dest, dest === 'stack'
    ? (p) => playToStack(p, instId, null, cards, auto)
    : (p) => { const n = moveAuto(p, instId, dest, cards, auto); return targetId ? toggleTarget(n, instId, targetId) : n })
  const targetPlay = (instId, targetId) => payThen(instId, 'stack', (p) => playToStack(p, instId, targetId, cards, auto))
  const attach = (instId, hostId) => payThen(instId, 'base', (p) => attachCard(moveAuto(p, instId, 'base', cards, auto), instId, hostId))

  function pileMenu(zone, e) {
    const items = zone === 'deck'
      ? [
        { label: 'Mischen', run: () => act((p) => shuffleZone(p, 'deck')) },
        { label: 'Oberste Karten ansehen…', run: () => setModal({ type: 'look', zone: 'deck' }) },
        { label: 'Unterste Karte ziehen', run: () => act((p) => drawBottom(p)) },
        { label: '4 Karten ziehen', run: () => act((p) => draw(p, 4)) },
      ]
      : [
        { label: 'Mischen', run: () => act((p) => shuffleZone(p, 'runeDeck')) },
        { label: 'Oberste Karten ansehen…', run: () => setModal({ type: 'look', zone: 'runeDeck' }) },
        { label: 'Unterste Rune ziehen', run: () => act((p) => drawRuneBottom(p)) },
        { label: '4 Runen ziehen', run: () => act((p) => drawRune(p, 4)) },
      ]
    setMenu({ x: Math.min(e?.clientX ?? 20, window.innerWidth - 220), y: Math.min((e?.clientY ?? 80) + 8, window.innerHeight - 200), items, title: zone === 'deck' ? 'Deck' : 'Runendeck' })
  }

  if (err && !row) return <div className="center"><p className="error">{err}</p><button onClick={() => go('/')}>Zurück</button></div>
  if (!row) return <div className="center">Lade Session…</div>

  const pw = sessionStorage.getItem('pw:' + id)
  const joinUrl = `${location.origin}${location.pathname}#/join/${row.code}`
  const isTv = view === 'tv' || view === 'watch'
  const ctx = {
    cards, settings, mySeat: isTv ? null : mySeat, players, drag: null, aim: null,
    // Karten antippen: in der Handy-Ansicht öffnet das die Karte, am Fernseher passiert nichts
    bindCard: (seat, zone, inst) => (isTv || !inst ? {} : { onClick: () => ui.current.detail?.(seat ?? mySeat, inst.id) }),
    bindPile: () => ({}),
    onAim: isTv ? undefined : (iid) => ui.current.detail?.(mySeat, iid),
    previewCard: () => {},
    onApprove: (sig, on) => act((p) => setApproval(p, sig, on)),
    onResolve: (entry) => act((p) => resolveEntry(p, entry)),
    onRemoveFx: (fxId) => act((p) => resolveEntry(p, { fx: { id: fxId } })),
    onPoints: (d) => act((p) => addPoints(p, d)),
    onSetPoints: (n) => act((p) => setPoints(p, n)),
    onTokens: null,
  }
  const playing = !!mine && !mine.setup?.battlefield && !mine.setup?.champion

  const overlays = (
    <>
      {modal?.type === 'look' && mine && <LookModal zone={modal.zone} mine={mine} cards={cards} act={act} onClose={() => setModal(null)} />}
      {modal?.type === 'settings' && (
        <Modal title="Optionen" onClose={() => setModal(null)}>
          <div className="stack">
            {Object.entries(SETTING_LABELS).map(([k, label]) => (
              <label key={k} className="check">
                <input type="checkbox" checked={!!settings[k]} onChange={async (e) => {
                  const next = { ...settings, [k]: e.target.checked }
                  setRow({ ...row, settings: next })
                  chRef.current?.send({ type: 'broadcast', event: 'settings', payload: next })
                  await supabase.rpc('update_settings', { p_session: id, p_settings: next })
                }} />
                {label}
              </label>
            ))}
            <label className="check">
              <input type="checkbox" checked={rot === '-90'} onChange={(e) => setRot(setBfRotation(e.target.checked ? '-90' : '90'))} />
              Battlefield-Bilder andersherum drehen
            </label>
          </div>
        </Modal>
      )}
      {modal?.type === 'tokens' && (
        <TokenModal tokens={Object.values(cards).filter((c) => kindOf(c) === 'token').sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name))}
          onSpawn={(c, n) => { act((p) => spawnTokens(p, c, n, auto)); say(`${n}× ${c.name} gespielt.`) }} onClose={() => setModal(null)} />
      )}
      {payAsk && (
        <PayModal ask={payAsk} cards={cards} mine={mine}
          onCancel={() => setPayAsk(null)}
          onFree={() => { const a = payAsk; setPayAsk(null); act(a.run) }}
          onPay={(ids) => {
            const a = payAsk
            const plan = planPayment(mineRef.current, a.cost, cards, ids)
            if (plan.missingEnergy > 0 || plan.missingPower > 0) { say(`„${a.name}“ kann nicht gespielt werden: Es fehlen ${missingText({ energy: Math.max(0, plan.missingEnergy), power: Math.max(0, plan.missingPower) })}.`); setPayAsk(null); return }
            setPayAsk(null); finishPay(plan, a.run, a.name, a.saved)
          }} />
      )}
      {notice && <div className="toast" role="status" onClick={() => setNotice('')}>{notice}</div>}
      <ArrowLayer players={players} mySeat={mySeat} onRemove={(from, to) => act((p) => removeTarget(p, from, to))} />
      {showing && (
        <div className="modal-bg preview-bg" onClick={() => setShowing(null)}>
          <div className="pv">
            <h3>{showing.name} zeigt:</h3>
            <div className="row" style={{ justifyContent: 'center' }}>
              {showing.cardIds.map((cid, i) => cards[cid] && <CardImg key={i} className="big" src={cards[cid].image_url} alt={cards[cid].name} battlefield={kindOf(cards[cid]) === 'battlefield'} />)}
            </div>
          </div>
        </div>
      )}
      {menu && <PopMenu menu={menu} onClose={() => setMenu(null)} />}
    </>
  )

  // ───────── Fernseher, Zuschauer (und „Ganzer Tisch“ auf dem Handy) ─────────
  if (isTv || showTable) {
    return (
      <GameCtx.Provider value={ctx}>
        <div className="tv tv2root">
          <div className={'tv2bar' + (players.length < 2 ? ' wait' : '')}>
            {showTable ? <IconBtn n="back" label="Zurück" onClick={() => setShowTable(false)} />
              : view === 'tv' ? (
                <>
                  <div><span className="muted">Code</span> <strong className="bigcode">{row.code}</strong></div>
                  {pw && <div><span className="muted">Passwort</span> <strong>{pw}</strong></div>}
                  {players.length < 2 && <div className="muted joinurl">{joinUrl}</div>}
                </>
              ) : <strong>Zuschauer · Code {row.code}</strong>}
            <span className="spacer" />
            {isHost && <IconBtn n="gear" label="Optionen" onClick={() => setModal({ type: 'settings' })} />}
            {!showTable && <IconBtn n="back" label="Verlassen" onClick={() => go('/')} />}
          </div>
          {err && <p className="error pad">{err}</p>}
          <TvTable players={players} />
          {overlays}
        </div>
      </GameCtx.Provider>
    )
  }

  // ───────── Spieler auf dem Handy ─────────
  if (!mySeat) {
    return (
      <div className="center stack">
        <p>Du hast in dieser Session keinen Spielerplatz.</p>
        <button onClick={() => go(`/s/${id}/watch`)}>Zuschauen</button>
        <button onClick={() => go('/')}>Zurück</button>
      </div>
    )
  }
  const P = {
    cards, mine, players, mySeat, bfSeats, settings, auto, setAuto, isHost, act, say, ui,
    afford, place, targetPlay, attach, both: (id, dest, tgt) => place(id, dest, tgt),
    markFns,
    arrow: (id, tid) => act((p) => toggleTarget(p, id, tid)),
    fx: (id, tid) => act((p) => addFx(p, id, tid)),
    drawCard: () => act((p) => draw(p, 1)),
    drawRune: () => act((p) => drawRune(p, 1)),
    shuffle: shuffleZone,
    pileMenu,
    takeBack: () => act(takeBackGifts),
    newDeck: () => { if (window.confirm('Neues Deck wählen? Dein Spielstand wird zurückgesetzt.')) commit(null) },
    openModal: (type, zone) => setModal({ type, zone }),
    showTable: () => setShowTable(true),
  }
  return (
    <GameCtx.Provider value={ctx}>
      <div className="player ph-root">
        {err && <p className="error pad">{err}</p>}
        {mine === undefined ? <div className="center">Lade…</div>
          : mine === null ? <div className="panel narrow ph-setup"><DeckPicker cards={cards} onPick={(d) => commit(buildPlayer(d, cards, settings))} /><button onClick={() => go('/')}>Zurück</button></div>
          : !playing ? (
            <div className="ph-setup">
              <Setup mine={mine} cards={cards}
                onBattlefield={(iid) => act((p) => pickBattlefield(p, iid))}
                onChampion={(iid) => act((p) => pickChampion(p, iid))} />
            </div>
          ) : <PhoneApp P={P} onLeave={() => go('/')} />}
        {overlays}
      </div>
    </GameCtx.Provider>
  )
}
