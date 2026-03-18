import { useEffect } from 'react'

interface ShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
}

const shortcuts = [
  { category: 'Navigation' },
  { key: 'Scroll', action: 'Zoom in / out' },
  { key: 'Click + drag', action: 'Pan the view' },
  { category: 'Editor' },
  { key: 'E', action: 'Toggle edit mode' },
  { key: 'R', action: 'Rotate selected furniture' },
  { key: 'Delete / Backspace', action: 'Delete selected item' },
  { key: 'Ctrl + Z', action: 'Undo' },
  { key: 'Ctrl + Y / Ctrl + Shift + Z', action: 'Redo' },
  { key: 'Escape', action: 'Cancel placement / deselect' },
]

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '4px 10px',
  gap: 24,
}

const keyStyle: React.CSSProperties = {
  fontSize: '20px',
  color: 'rgba(255, 255, 255, 0.55)',
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.18)',
  padding: '1px 6px',
  whiteSpace: 'nowrap',
}

const actionStyle: React.CSSProperties = {
  fontSize: '20px',
  color: 'rgba(255, 255, 255, 0.85)',
  textAlign: 'right',
}

const categoryStyle: React.CSSProperties = {
  fontSize: '18px',
  color: 'rgba(255, 255, 255, 0.35)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  padding: '8px 10px 2px',
}

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.55)',
          zIndex: 49,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 50,
          background: 'var(--pixel-bg)',
          border: '2px solid var(--pixel-border)',
          padding: '4px',
          boxShadow: 'var(--pixel-shadow)',
          minWidth: 280,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 10px',
            borderBottom: '1px solid var(--pixel-border)',
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: '24px', color: 'rgba(255, 255, 255, 0.9)' }}>Keyboard Shortcuts</span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            X
          </button>
        </div>
        {shortcuts.map((s, i) =>
          'category' in s ? (
            <div key={i} style={categoryStyle}>{s.category}</div>
          ) : (
            <div key={i} style={rowStyle}>
              <span style={keyStyle}>{s.key}</span>
              <span style={actionStyle}>{s.action}</span>
            </div>
          )
        )}
        <div style={{ padding: '8px 10px 4px', fontSize: '18px', color: 'rgba(255,255,255,0.28)', textAlign: 'center' }}>
          Press <b>?</b> or Escape to close
        </div>
      </div>
    </>
  )
}
