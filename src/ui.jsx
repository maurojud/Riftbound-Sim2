import { useRef } from 'react'

// Einfache Symbole (24×24, Linien). Sie ersetzen Text in der Handy-Ansicht.
const P = {
  rune: <path d="M12 2.5 20 8v8l-8 5.5L4 16V8z M12 7l4 2.7v4.6L12 17l-4-2.7V9.7z" />,
  deck: <><rect x="6" y="3.5" width="12" height="16" rx="2" /><path d="M8.5 21h8M4 6.5v12" /></>,
  untap: <><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 3.5V8h-4.5" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  stack: <><path d="M12 3 3 8l9 5 9-5z" /><path d="m3 12.5 9 5 9-5" /><path d="m3 16.5 9 5 9-5" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  eye: <><path d="M2 12s3.7-6.5 10-6.5S22 12 22 12s-3.7 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeoff: <><path d="M3 3l18 18" /><path d="M10.6 6A9.6 9.6 0 0 1 12 5.5C18.3 5.5 22 12 22 12a17 17 0 0 1-3.1 3.800M6.3 7.300A17 17 0 0 0 2 12s3.7 6.5 10 6.500c1.5 0 2.8-.4 4-.9" /></>,
  base: <path d="M3.5 11 12 4l8.5 7M6 9.500V20h12V9.500M10 20v-5h4v5" />,
  flag: <path d="M6 21V4m0 1h11l-2.5 4L17 13H6" />,
  aim: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 1.500v4M12 18.500v4M1.5 12h4M18.5 12h4" /></>,
  place: <><path d="M12 3v11m0 0-4-4m4 4 4-4" /><path d="M4 15v4a1.5 1.5 0 0 0 1.5 1.500h13A1.5 1.5 0 0 0 20 19v-4" /></>,
  both: <><path d="M8 3v8m0 0-3-3m3 3 3-3" /><circle cx="16.5" cy="15.5" r="4.5" /><circle cx="16.5" cy="15.5" r="1.2" /><path d="M3 15v4.500A1.5 1.5 0 0 0 4.5 21H9" /></>,
  trash: <><path d="M4 7h16M9.5 7V4h5v3M6.5 7l1 13h9l1-13" /><path d="M10 11v6M14 11v6" /></>,
  banish: <><circle cx="12" cy="12" r="8.5" /><path d="m6 6 12 12" /></>,
  top: <><path d="M12 12V3m0 0L8.5 6.500M12 3l3.5 3.5" /><rect x="5" y="14" width="14" height="7" rx="1.5" /></>,
  bottom: <><rect x="5" y="3" width="14" height="7" rx="1.5" /><path d="M12 12v9m0 0-3.5-3.500M12 21l3.5-3.5" /></>,
  hand: <path d="M8 12V5.500a1.5 1.5 0 0 1 3 0V11m0-1V4a1.5 1.5 0 0 1 3 0v7m0-5.500a1.5 1.5 0 0 1 3 0V13m0-4a1.5 1.5 0 0 1 3 0v6c0 3.5-2.5 6-6 6h-1.500c-2.5 0-3.7-1-5-3L4 14.500a1.5 1.5 0 0 1 2.4-1.800L8 14.5" />,
  tap: <><path d="M5 7h9a5 5 0 0 1 0 10H7" /><path d="m9 3-4 4 4 4" /></>,
  legend: <path d="M12 3 4.5 6v5.500c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.500V6z" />,
  token: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.500v9M7.5 12h9" /></>,
  champion: <path d="m3.5 18 1.5-10 4.5 4L12 5l2.5 7L19 8l1.5 10z M4 21h16" />,
  cards: <><rect x="3" y="6" width="10" height="14" rx="1.5" /><path d="M16 4.500l5 1.5-3.5 13" /></>,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.500l4 4" />,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.500v3M12 18.500v3M2.5 12h3M18.5 12h3M5.3 5.300l2.1 2.100M16.6 16.600l2.1 2.100M5.3 18.700l2.1-2.100M16.6 7.400l2.1-2.1" /></>,
  swap: <path d="M4 8h14m0 0-3.5-3.500M18 8l-3.5 3.500M20 16H6m0 0 3.5-3.500M6 16l3.5 3.5" />,
  give: <><path d="M3 12h12m0 0-4-4m4 4-4 4" /><circle cx="19" cy="12" r="2.5" /></>,
  fx: <path d="M13 2 4.5 13.500H11L10 22l8.5-11.500H12.500z" />,
  detach: <><path d="M10 14 6.5 17.500a3 3 0 0 1-4-4L6 10M14 10l3.5-3.500a3 3 0 0 1 4 4L18 14" /><path d="M8 3.5 9 6M3.5 8 6 9M16 20.5 15 18M20.5 16 18 15" /></>,
  back: <path d="M15 5 8 12l7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  nocost: <><path d="M13 2 4.5 13.500H11L10 22l8.5-11.500H12.500z" /><path d="M3 3l18 18" /></>,
  zap: <path d="M13 2 4.5 13.500H11L10 22l8.5-11.500H12.500z" />,
}
export function Icon({ n, size = 24, className = '' }) {
  return (
    <svg className={'ic ' + className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[n]}
    </svg>
  )
}

// Kreisrunder Symbol-Knopf (ohne Text); `label` erscheint nur als Tooltip bzw. für Screenreader.
export function IconBtn({ n, label, onClick, badge, on, disabled, size = 24, className = '', ...rest }) {
  return (
    <button type="button" className={'ibtn ' + className + (on ? ' on' : '')} onClick={onClick} disabled={disabled} title={label} aria-label={label} {...rest}>
      <Icon n={n} size={size} />
      {badge ? <span className="ibadge">{badge}</span> : null}
    </button>
  )
}

// Tippen und langes Drücken unterscheiden (Touch, Maus, Stift). Bewegt sich der Finger, gilt es als Scrollen.
export function useLongPress(onTap, onLong, ms = 460) {
  const st = useRef({})
  return {
    onPointerDown: (e) => {
      if (e.button > 0) return
      const s = st.current
      s.x = e.clientX; s.y = e.clientY; s.long = false; s.moved = false
      clearTimeout(s.t)
      s.t = setTimeout(() => { s.long = true; navigator.vibrate?.(20); onLong?.(e) }, ms)
    },
    onPointerMove: (e) => {
      const s = st.current
      if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) { s.moved = true; clearTimeout(s.t) }
    },
    onPointerUp: () => { clearTimeout(st.current.t) },
    // Tippen erst beim click auslösen: so landet der nachgelieferte Touch-click nicht auf dem neu geöffneten Fenster
    onClick: () => {
      const s = st.current
      if (s.long || s.moved) return
      onTap?.()
    },
    onPointerCancel: () => { clearTimeout(st.current.t); st.current.moved = true },
    onContextMenu: (e) => { e.preventDefault() },
  }
}

// Unterer Einschub (Handy): dunkler Hintergrund, Tippen daneben schließt
export function Sheet({ title, onClose, children, tall, head }) {
  const t0 = useRef(Date.now())
  return (
    <div className="sheet-bg" onClick={() => { if (Date.now() - t0.current > 400) onClose?.() }}>
      <div className={'sheet' + (tall ? ' tall' : '')} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="sheet-head">
          {onClose && <IconBtn n="close" label="Schließen" onClick={onClose} className="sm" />}
          <span className="sheet-title">{title}</span>
          {head}
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}
