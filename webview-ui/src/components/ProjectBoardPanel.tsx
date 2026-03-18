import { useMemo, useState } from 'react'
import type { OfficeState } from '../office/engine/officeState.js'
import { PALETTE_COLORS } from '../constants.js'
import { LaunchAgentModal } from './LaunchAgentModal.js'
import type { WorkspaceFolder } from '../hooks/useExtensionMessages.js'

interface ProjectBoardPanelProps {
  agents: number[]
  agentNames: Record<number, string>
  agentFolderNames: Record<number, string>
  officeState: OfficeState
  workspaceFolders: WorkspaceFolder[]
  onClose: () => void
  onFocusAgent: (id: number) => void
  onLayoffAgent: (id: number) => void
}

function MiniAvatar({ palette, isActive }: { palette: number; isActive: boolean }) {
  const color = PALETTE_COLORS[palette % PALETTE_COLORS.length]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, width: 12, flexShrink: 0 }}>
      <div style={{ width: 10, height: 10, background: color, outline: '1px solid rgba(0,0,0,0.5)' }} />
      <div style={{ width: 12, height: 8, background: isActive ? color : '#334', outline: '1px solid rgba(0,0,0,0.5)' }} />
      <div style={{ display: 'flex', gap: 2 }}>
        <div style={{ width: 4, height: 5, background: '#223' }} />
        <div style={{ width: 4, height: 5, background: '#223' }} />
      </div>
    </div>
  )
}

export function ProjectBoardPanel({
  agents,
  agentNames,
  agentFolderNames,
  officeState,
  workspaceFolders,
  onClose,
  onFocusAgent,
  onLayoffAgent,
}: ProjectBoardPanelProps) {
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false)

  const projects = useMemo(() => {
    const map: Record<string, number[]> = {}
    for (const id of agents) {
      const folder = agentFolderNames[id] || 'Unknown Project'
      if (!map[folder]) map[folder] = []
      map[folder].push(id)
    }
    return map
  }, [agents, agentFolderNames])

  const borderStyle = '1px solid #1a2e1a'
  const bg = '#080e08'
  const panelBg = '#050b05'

  return (
    <div
      style={{
        position: 'absolute',
        top: '10%',
        left: '10%',
        right: '10%',
        bottom: '10%',
        background: bg,
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
        color: '#99cc99',
        border: '2px solid #3a7a3a',
        boxShadow: '0 0 20px rgba(0,0,0,0.8)',
        fontFamily: "'FS Pixel Sans', monospace",
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: borderStyle, background: '#030803' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: '#ccffcc', fontSize: '24px', letterSpacing: 2 }}>PROJECT MANAGEMENT BOARD</span>
          <button
            onClick={() => setIsLaunchModalOpen(true)}
            style={{
              padding: '4px 12px',
              fontSize: '18px',
              background: '#0d1f0d',
              color: '#aaffaa',
              border: '2px solid #3a7a3a',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            + NEW PROJECT
          </button>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#334433', cursor: 'pointer', fontSize: '28px', lineHeight: 1 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#cc4444' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#334433' }}
        >
          ✕
        </button>
      </div>

      {/* Grid of Projects */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {Object.entries(projects).map(([folder, agentIds]) => {
          // Get the color for this project (based on first agent)
          const firstCh = officeState.characters.get(agentIds[0])
          const palette = firstCh?.palette ?? 0
          const projectColor = PALETTE_COLORS[palette % PALETTE_COLORS.length]

          return (
            <div
              key={folder}
              style={{
                background: panelBg,
                border: `1px solid ${projectColor}88`,
                display: 'flex',
                flexDirection: 'column',
                boxShadow: `0 4px 8px rgba(0,0,0,0.4)`,
              }}
            >
              <div style={{ background: `${projectColor}33`, padding: '6px 12px', borderBottom: `1px solid ${projectColor}55`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 12, height: 12, background: projectColor, border: '1px solid #000' }} />
                <span style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {folder.toUpperCase()}
                </span>
              </div>
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {agentIds.map((id) => {
                  const ch = officeState.characters.get(id)
                  const name = agentNames[id] || `Agent #${id}`
                  return (
                    <div
                      key={id}
                      onClick={() => onFocusAgent(id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '4px 8px',
                        cursor: 'pointer',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid transparent',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = projectColor; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
                    >
                      <MiniAvatar palette={ch?.palette ?? 0} isActive={ch?.isActive ?? false} />
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                        <span style={{ color: '#ccffcc', fontSize: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                        <span style={{ color: '#557755', fontSize: '12px' }}>ID: {id} {ch?.isActive ? '• ACTIVE' : ''}</span>
                      </div>
                      <button
                        onClick={(event) => {
                          event.stopPropagation()
                          const confirmed = window.confirm(`Lay off ${name}? This removes the agent from the office without stopping the underlying session.`)
                          if (confirmed) {
                            onClose()
                            onLayoffAgent(id)
                          }
                        }}
                        style={{
                          background: '#2a0d0d',
                          color: '#ff9b9b',
                          border: '1px solid #7a3a3a',
                          cursor: 'pointer',
                          padding: '4px 8px',
                          fontFamily: 'inherit',
                          fontSize: '12px',
                          flexShrink: 0,
                        }}
                        title="Remove this agent from the office without terminating its session"
                      >
                        LAY OFF
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        {Object.keys(projects).length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: '#2a5a2a', fontSize: '20px' }}>
            NO ACTIVE PROJECTS
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 16px', borderTop: borderStyle, background: '#030803', fontSize: '14px', color: '#2a5a2a', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span>TOTAL PROJECTS: {Object.keys(projects).length} | TOTAL AGENTS: {agents.length}</span>
        <span>Layoff removes an agent from this office view only.</span>
      </div>

      <LaunchAgentModal
        isOpen={isLaunchModalOpen}
        onClose={() => setIsLaunchModalOpen(false)}
        workspaceFolders={workspaceFolders}
      />
    </div>
  )
}
