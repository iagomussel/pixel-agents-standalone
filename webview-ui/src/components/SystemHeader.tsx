import { useState, useEffect } from 'react'

interface SystemHeaderProps {
  agentCount: number
  agentTokens: Record<number, { input: number; output: number }>
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0')
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

export function SystemHeader({ agentCount, agentTokens }: SystemHeaderProps) {
  const [uptime, setUptime] = useState(0)

  useEffect(() => {
    const start = Date.now()
    const id = setInterval(() => setUptime(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  const totalTokens = Object.values(agentTokens).reduce((sum, entry) => sum + entry.input + entry.output, 0)

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        right: 8,
        zIndex: 'var(--pixel-controls-z)' as unknown as number,
        background: 'var(--pixel-bg)',
        border: '2px solid var(--pixel-border)',
        padding: '4px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        fontSize: '18px',
        color: 'var(--pixel-text-dim)',
        fontFamily: 'inherit',
        boxShadow: 'var(--pixel-shadow)',
        pointerEvents: 'none',
      }}
    >
      <span>SYSTEM HEALTH: <span style={{ color: agentCount > 0 ? '#4ade80' : '#6b7280' }}>{agentCount > 0 ? 'ONLINE' : 'IDLE'}</span></span>
      <span style={{ color: 'var(--pixel-border)' }}>|</span>
      <span>AGENTS: <span style={{ color: agentCount > 0 ? '#4ade80' : 'var(--pixel-text-dim)' }}>{agentCount}</span></span>
      <span style={{ color: 'var(--pixel-border)' }}>|</span>
      <span>UPTIME: <span style={{ color: 'var(--vscode-foreground)' }}>{formatUptime(uptime)}</span></span>
      <span style={{ color: 'var(--pixel-border)' }}>|</span>
      <span>TOKENS: <span style={{ color: '#a78bfa' }}>{formatTokens(totalTokens)}</span></span>
    </div>
  )
}
