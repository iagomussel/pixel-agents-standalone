import { useState, useEffect, useRef, useCallback } from 'react'

interface LogEntry {
  id: number
  timestamp: number
  category: string
  categoryColor: string
  message: string
  isPulsing?: boolean
}

interface SystemLogPanelProps {
  isOpen: boolean
  onClose: () => void
  agentNames: Record<number, string>
}

let entryId = 0

const CATEGORY_COLORS: Record<string, string> = {
  '[MISSION_STARTED]': '#4ade80',
  '[MISSION_COMPLETE]': '#60a5fa',
  '[LAYOFF]': '#f87171',
  '[EXPLORATION]': '#22d3ee',
  '[DATA]': '#fbbf24',
  '[SUBTASK]': '#a78bfa',
  '[APPROVAL_NEEDED]': '#f87171',
  '[STANDBY]': '#6b7280',
  '[SUBTASK_COMPLETE]': '#7c3aed',
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => n.toString().padStart(2, '0')).join(':')
}

export function SystemLogPanel({ isOpen, onClose, agentNames }: SystemLogPanelProps) {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const folderNamesRef = useRef<Record<number, string>>({})

  const getName = useCallback((id: number) =>
    agentNames[id] || folderNamesRef.current[id] || `Agent #${id}`, [agentNames])

  const addEntry = useCallback((category: string, message: string, pulsing?: boolean) => {
    setEntries((prev) => {
      const entry: LogEntry = {
        id: entryId++,
        timestamp: Date.now(),
        category,
        categoryColor: CATEGORY_COLORS[category] || '#9ca3af',
        message,
        isPulsing: pulsing,
      }
      const next = [...prev, entry]
      return next.length > 60 ? next.slice(-60) : next
    })
  }, [])

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data
      if (!msg?.type) return

      if (msg.type === 'agentCreated') {
        const id = msg.id as number
        const folder = msg.folderName as string | undefined
        if (folder) folderNamesRef.current[id] = folder
        addEntry('[MISSION_STARTED]', `${getName(id)} joined the grid`)
      } else if (msg.type === 'agentClosed') {
        const id = msg.id as number
        addEntry('[MISSION_COMPLETE]', `${getName(id)} logged out`)
        delete folderNamesRef.current[id]
      } else if (msg.type === 'agentLaidOff') {
        const id = msg.id as number
        addEntry('[LAYOFF]', `${getName(id)} was removed from the office`)
        delete folderNamesRef.current[id]
      } else if (msg.type === 'agentToolStart') {
        const id = msg.id as number
        const status = msg.status as string
        if (status.startsWith('Subtask:')) {
          const label = status.slice('Subtask:'.length).trim()
          addEntry('[SUBTASK]', `${getName(id)} spawned subtask: ${label}`)
        } else if (/^(Reading|Searching|Fetching)/i.test(status)) {
          addEntry('[EXPLORATION]', `${getName(id)} › ${status}`)
        } else {
          addEntry('[DATA]', `${getName(id)} › ${status}`)
        }
      } else if (msg.type === 'agentToolPermission') {
        const id = msg.id as number
        addEntry('[APPROVAL_NEEDED]', `${getName(id)} requires your approval`, true)
      } else if (msg.type === 'agentStatus' && msg.status === 'waiting') {
        const id = msg.id as number
        addEntry('[STANDBY]', `${getName(id)} is waiting for input`)
      } else if (msg.type === 'subagentClear') {
        const id = msg.id as number
        addEntry('[SUBTASK_COMPLETE]', `${getName(id)} subtask completed`)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [addEntry, getName])

  // Auto-scroll to bottom
  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [entries, isOpen])

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 300,
        background: 'var(--pixel-bg)',
        borderLeft: '2px solid var(--pixel-border)',
        zIndex: 'var(--pixel-controls-z)' as unknown as number,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 12px rgba(0,0,0,0.4)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          borderBottom: '2px solid var(--pixel-border)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '20px', color: 'var(--pixel-text-dim)', letterSpacing: 2 }}>
          ▶ SYSTEM LOG
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--pixel-text-dim)',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '2px 6px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Log entries */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 0',
        }}
      >
        {entries.length === 0 && (
          <div style={{ padding: '12px', color: 'var(--pixel-text-dim)', fontSize: '18px', opacity: 0.5 }}>
            Waiting for activity...
          </div>
        )}
        {entries.map((entry) => (
          <div
            key={entry.id}
            style={{
              padding: '3px 10px',
              borderBottom: '1px solid rgba(255,255,255,0.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '14px',
                  color: entry.categoryColor,
                  fontWeight: 'bold',
                  animation: entry.isPulsing ? 'pixel-agents-pulse 1.2s ease-in-out infinite' : undefined,
                  whiteSpace: 'nowrap',
                }}
              >
                {entry.category}
              </span>
              <span style={{ fontSize: '16px', color: 'var(--pixel-text-dim)', flex: 1, wordBreak: 'break-word' }}>
                {entry.message}
              </span>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--pixel-border)', opacity: 0.7 }}>
              {formatTime(entry.timestamp)}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
