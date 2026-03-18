import { useState, useEffect } from 'react'
import { SettingsModal } from './SettingsModal.js'
import { ShortcutsModal } from './ShortcutsModal.js'
import { LaunchAgentModal } from './LaunchAgentModal.js'
import type { WorkspaceFolder } from '../hooks/useExtensionMessages.js'
import { onConnectionChange } from '../wsApi.js'

interface BottomToolbarProps {
  isEditMode: boolean
  onToggleEditMode: () => void
  isDebugMode: boolean
  onToggleDebugMode: () => void
  workspaceFolders: WorkspaceFolder[]
  isLogOpen: boolean
  onToggleLog: () => void
  isBoardOpen: boolean
  onToggleBoard: () => void
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 10,
  left: 10,
  zIndex: 'var(--pixel-controls-z)',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: 'var(--pixel-bg)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  padding: '4px 6px',
  boxShadow: 'var(--pixel-shadow)',
}

const btnBase: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: '24px',
  color: 'var(--pixel-text)',
  background: 'var(--pixel-btn-bg)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
}

const btnActive: React.CSSProperties = {
  ...btnBase,
  background: 'var(--pixel-active-bg)',
  border: '2px solid var(--pixel-accent)',
}


export function BottomToolbar({
  isEditMode,
  onToggleEditMode,
  isDebugMode,
  onToggleDebugMode,
  workspaceFolders,
  isLogOpen,
  onToggleLog,
  isBoardOpen,
  onToggleBoard,
}: BottomToolbarProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false)
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false)
  const [isConnected, setIsConnected] = useState(true)

  useEffect(() => onConnectionChange(setIsConnected), [])

  const handleAgentClick = () => {
    setIsLaunchModalOpen(true)
  }

  return (
    <div style={panelStyle}>
      <div style={{ position: 'relative' }}>
        <button
          onClick={handleAgentClick}
          onMouseEnter={() => setHovered('agent')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...btnBase,
            padding: '5px 12px',
            background:
              hovered === 'agent' || isLaunchModalOpen
                ? 'var(--pixel-agent-hover-bg)'
                : 'var(--pixel-agent-bg)',
            border: '2px solid var(--pixel-agent-border)',
            color: 'var(--pixel-agent-text)',
          }}
        >
          + Agent
        </button>
        <LaunchAgentModal
          isOpen={isLaunchModalOpen}
          onClose={() => setIsLaunchModalOpen(false)}
          workspaceFolders={workspaceFolders}
        />
      </div>
      <button
        onClick={onToggleEditMode}
        onMouseEnter={() => setHovered('edit')}
        onMouseLeave={() => setHovered(null)}
        style={
          isEditMode
            ? { ...btnActive }
            : {
                ...btnBase,
                background: hovered === 'edit' ? 'var(--pixel-btn-hover-bg)' : btnBase.background,
              }
        }
        title="Edit office layout"
      >
        Layout
      </button>
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setIsSettingsOpen((v) => !v)}
          onMouseEnter={() => setHovered('settings')}
          onMouseLeave={() => setHovered(null)}
          style={
            isSettingsOpen
              ? { ...btnActive }
              : {
                  ...btnBase,
                  background: hovered === 'settings' ? 'var(--pixel-btn-hover-bg)' : btnBase.background,
                }
          }
          title="Settings"
        >
          Settings
        </button>
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          isDebugMode={isDebugMode}
          onToggleDebugMode={onToggleDebugMode}
        />
      </div>
      <button
        onClick={() => setIsShortcutsOpen((v) => !v)}
        onMouseEnter={() => setHovered('shortcuts')}
        onMouseLeave={() => setHovered(null)}
        style={{
          ...btnBase,
          padding: '5px 10px',
          background: isShortcutsOpen
            ? 'var(--pixel-active-bg)'
            : hovered === 'shortcuts'
              ? 'var(--pixel-btn-hover-bg)'
              : btnBase.background,
          border: isShortcutsOpen ? '2px solid var(--pixel-accent)' : '2px solid transparent',
        }}
        title="Keyboard shortcuts (?)"
      >
        ?
      </button>
      <button
        onClick={onToggleLog}
        onMouseEnter={() => setHovered('log')}
        onMouseLeave={() => setHovered(null)}
        style={
          isLogOpen
            ? { ...btnActive }
            : { ...btnBase, background: hovered === 'log' ? 'var(--pixel-btn-hover-bg)' : btnBase.background }
        }
        title="System log"
      >
        Log
      </button>
      <button
        onClick={onToggleBoard}
        onMouseEnter={() => setHovered('board')}
        onMouseLeave={() => setHovered(null)}
        style={
          isBoardOpen
            ? { ...btnActive }
            : { ...btnBase, background: hovered === 'board' ? 'var(--pixel-btn-hover-bg)' : btnBase.background }
        }
        title="Project Management Board"
      >
        Board
      </button>
      <div style={{ width: 1, height: 20, background: 'var(--pixel-border)', margin: '0 4px' }} />
      <button
        style={{ ...btnBase, color: '#fbbf24', opacity: 0.8 }}
        title="Pause all agents (coming soon)"
        onClick={() => console.log('[Pixel Agents] Pause all - coming soon')}
      >
        ⏸ Pause All
      </button>
      <button
        style={{ ...btnBase, color: '#4ade80', opacity: 0.8 }}
        title="Resume all agents (coming soon)"
        onClick={() => console.log('[Pixel Agents] Resume all - coming soon')}
      >
        ▶ Resume All
      </button>
      {!isConnected && (
        <div
          title="Reconnecting to server..."
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#f87171',
            flexShrink: 0,
            boxShadow: '0 0 4px #f87171',
          }}
        />
      )}
      <ShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
    </div>
  )
}
