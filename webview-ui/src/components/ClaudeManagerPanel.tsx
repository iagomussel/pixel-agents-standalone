import { useState, useRef, useEffect, useCallback } from 'react'
import type { ToolActivity } from '../office/types.js'
import type { AgentConversationEntry, AgentMessage } from '../hooks/useExtensionMessages.js'
import type { OfficeState } from '../office/engine/officeState.js'
import { vscode } from '../vscodeApi.js'
import { PALETTE_COLORS } from '../constants.js'

interface ClaudeManagerPanelProps {
  agents: number[]
  agentTools: Record<number, ToolActivity[]>
  agentStatuses: Record<number, string>
  agentMessages: Record<number, AgentMessage[]>
  agentConversations: Record<number, AgentConversationEntry[]>
  agentNames: Record<number, string>
  officeState: OfficeState
  onClose: () => void
  onFocusAgent: (id: number) => void
  onCloseAgent: (id: number) => void
  onSendMessage: (agentId: number, text: string) => void
  onPermissionAction: (agentId: number, action: 'approve' | 'deny') => void
  onLayoffAgent: (id: number) => void
}

const CODING_TOOLS = new Set(['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const READING_TOOLS_SET = new Set(['Read', 'Grep', 'Glob'])
const RESEARCH_TOOLS = new Set(['WebFetch', 'WebSearch'])

function getAgentRole(tools: ToolActivity[]): string {
  const active = [...tools].reverse().find((t) => !t.done) ?? tools[tools.length - 1]
  if (!active) return 'AGENT'
  const id = active.toolId
  if (CODING_TOOLS.has(id)) return 'CODING'
  if (READING_TOOLS_SET.has(id)) return 'READING'
  if (RESEARCH_TOOLS.has(id)) return 'RESEARCH'
  if (id === 'Task' || id === 'Agent') return 'COMMAND'
  return 'ANALYSIS'
}

function getDisplayStatus(status: string, isActive: boolean, tools: ToolActivity[]): string {
  if (tools.some((t) => t.permissionWait && !t.done)) return 'APPROVAL'
  if (status === 'waiting') return 'WAITING'
  if (isActive && tools.some((t) => !t.done)) return 'ACTIVE'
  if (isActive) return 'PROCESSING'
  return 'IDLE'
}

function statusColor(s: string): string {
  switch (s) {
    case 'ACTIVE': return '#39ff14'
    case 'PROCESSING': return '#4fc3f7'
    case 'WAITING': return '#fff176'
    case 'APPROVAL': return '#ffb74d'
    default: return '#556655'
  }
}

function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

function getContextSnapshot(conversation: AgentConversationEntry[]): { objective: string | null; latestReply: string | null } {
  let objective: string | null = null
  let latestReply: string | null = null
  for (let i = conversation.length - 1; i >= 0; i -= 1) {
    const entry = conversation[i]
    if (!latestReply && entry.role === 'assistant') latestReply = truncateText(entry.text, 140)
    if (!objective && entry.role === 'user') objective = truncateText(entry.text, 140)
    if (objective && latestReply) break
  }
  return { objective, latestReply }
}

function MiniAvatar({ palette, isActive }: { palette: number; isActive: boolean }) {
  const color = PALETTE_COLORS[palette % PALETTE_COLORS.length]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, width: 8, flexShrink: 0 }}>
      <div style={{ width: 6, height: 6, background: color, outline: '1px solid rgba(0,0,0,0.5)' }} />
      <div style={{ width: 8, height: 5, background: isActive ? color : '#334', outline: '1px solid rgba(0,0,0,0.5)' }} />
      <div style={{ display: 'flex', gap: 2 }}>
        <div style={{ width: 2, height: 3, background: '#223' }} />
        <div style={{ width: 2, height: 3, background: '#223' }} />
      </div>
    </div>
  )
}

/** Large pixel-art avatar for the "commander" permission dialog */
function CommanderAvatar({ palette }: { palette: number }) {
  const color = PALETTE_COLORS[palette % PALETTE_COLORS.length]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, imageRendering: 'pixelated' }}>
      {/* head */}
      <div style={{ width: 28, height: 28, background: color, border: '2px solid rgba(0,0,0,0.6)', borderRadius: 2 }} />
      {/* body */}
      <div style={{ width: 36, height: 22, background: color, filter: 'brightness(0.75)', border: '2px solid rgba(0,0,0,0.6)' }} />
      {/* legs */}
      <div style={{ display: 'flex', gap: 4 }}>
        <div style={{ width: 12, height: 14, background: '#334' }} />
        <div style={{ width: 12, height: 14, background: '#334' }} />
      </div>
    </div>
  )
}

const TAB_STYLE: React.CSSProperties = {
  padding: '2px 10px',
  fontSize: '18px',
  color: '#445544',
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  cursor: 'pointer',
  letterSpacing: 1,
}

const TAB_ACTIVE: React.CSSProperties = {
  ...TAB_STYLE,
  color: '#ccffcc',
  border: '1px solid #2a5a2a',
  borderBottom: '1px solid #0a1a0a',
  background: '#0a1a0a',
}

const RETRO_BTN: React.CSSProperties = {
  padding: '6px 16px',
  fontSize: '18px',
  background: '#0d1f0d',
  color: '#aaffaa',
  border: '2px solid #3a7a3a',
  borderRadius: 0,
  cursor: 'pointer',
  letterSpacing: 2,
  fontFamily: 'inherit',
}

const TERM_STYLE: React.CSSProperties = {
  fontFamily: "'FS Pixel Sans', monospace",
  fontSize: '16px',
  lineHeight: '1.6',
}

type Tab = 'AGENTS' | 'LOGS' | 'MISSIONS' | 'SYSTEM'

export function ClaudeManagerPanel({
  agents,
  agentTools,
  agentStatuses,
  agentMessages,
  agentConversations,
  agentNames,
  officeState,
  onClose,
  onFocusAgent,
  onCloseAgent,
  onSendMessage,
  onPermissionAction,
}: ClaudeManagerPanelProps) {
  const [tab, setTab] = useState<Tab>('AGENTS')
  const [selectedId, setSelectedId] = useState<number | null>(agents[0] ?? null)
  const [cmd, setCmd] = useState('')
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep selection valid and auto-select first agent
  useEffect(() => {
    if (selectedId !== null && !agents.includes(selectedId)) {
      setSelectedId(agents[0] ?? null)
    } else if (selectedId === null && agents.length > 0) {
      setSelectedId(agents[0])
    }
  }, [agents, selectedId])

  // Auto-select agents that need approval
  useEffect(() => {
    const urgent = agents.find((id) => {
      const tools = agentTools[id] ?? []
      return tools.some((t) => t.permissionWait && !t.done)
    })
    if (urgent !== undefined) setSelectedId(urgent)
  }, [agents, agentTools])

  // Auto-scroll terminal log
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [agentMessages, selectedId])

  // Focus input when switching to waiting/approval state
  const selTools = selectedId !== null ? (agentTools[selectedId] ?? []) : []
  const selStatus = selectedId !== null ? (agentStatuses[selectedId] ?? '') : ''
  const selCh = selectedId !== null ? officeState.characters.get(selectedId) : undefined
  const needsApproval = selTools.some((t) => t.permissionWait && !t.done)
  const isWaiting = selStatus === 'waiting'

  useEffect(() => {
    if (isWaiting && !needsApproval) {
      inputRef.current?.focus()
    }
  }, [isWaiting, needsApproval, selectedId])

  const handleRowClick = useCallback((id: number) => {
    setSelectedId(id)
  }, [])

  const handleSendMessage = useCallback(() => {
    if (!cmd.trim() || selectedId === null) return
    onSendMessage(selectedId, cmd.trim())
    setCmd('')
  }, [cmd, selectedId, onSendMessage])

  const handleCmdSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (!cmd.trim()) return

    if (isWaiting && !needsApproval && selectedId !== null) {
      // Send as chat message to waiting agent
      handleSendMessage()
      return
    }

    // Parse manager commands
    const parts = cmd.trim().split(/\s+/)
    const command = parts[0].toLowerCase()
    const argId = parts[1] ? parseInt(parts[1], 10) : selectedId

    switch (command) {
      case 'focus':
        if (argId !== null) onFocusAgent(argId)
        break
      case 'close':
        if (argId !== null) onCloseAgent(argId)
        break
      case 'approve':
        if (argId !== null) onPermissionAction(argId, 'approve')
        break
      case 'deny':
        if (argId !== null) onPermissionAction(argId, 'deny')
        break
      case 'select':
        if (argId !== null && agents.includes(argId)) setSelectedId(argId)
        break
      default:
        // Unknown command — focus the terminal for manual interaction
        if (selectedId !== null) vscode.postMessage({ type: 'focusAgent', id: selectedId })
    }
    setCmd('')
  }, [cmd, selectedId, isWaiting, needsApproval, agents, onFocusAgent, onCloseAgent, onPermissionAction, handleSendMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Y / N shortcuts when approval is needed
    if (needsApproval && selectedId !== null) {
      if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); onPermissionAction(selectedId, 'approve') }
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); onPermissionAction(selectedId, 'deny') }
    }
  }, [needsApproval, selectedId, onPermissionAction])

  const termMessages = selectedId !== null ? (agentMessages[selectedId] ?? []).slice(-40) : []
  const selectedConversation = selectedId !== null ? (agentConversations[selectedId] ?? []) : []
  const { objective, latestReply } = getContextSnapshot(selectedConversation)
  const allMessages = tab === 'LOGS'
    ? agents.flatMap((id) =>
        (agentMessages[id] ?? []).map((m) => ({ ...m, agentId: id, agentName: agentNames[id] || `Agent #${id}` }))
      ).sort((a, b) => a.timestamp - b.timestamp).slice(-60)
    : []

  const borderStyle = '1px solid #1a2e1a'
  const bg = '#080e08'
  const panelBg = '#050b05'

  // Pending tool name for approval dialog
  const pendingTool = selTools.find((t) => t.permissionWait && !t.done)

  return (
    <div
      style={{ position: 'absolute', inset: 0, background: bg, zIndex: 200, display: 'flex', flexDirection: 'column', color: '#99cc99', ...TERM_STYLE }}
      onKeyDown={handleKeyDown}
    >
      {/* ── Title bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 12px 3px', borderBottom: borderStyle, background: '#030803', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#ccffcc', fontSize: '20px', letterSpacing: 2 }}>CLAUDE MANAGER v1.2</span>
          <span style={{ color: '#2a5a2a', fontSize: '14px', letterSpacing: 1 }}>
            AGENTS ONLINE: {agents.length}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#334433', cursor: 'pointer', fontSize: '22px', lineHeight: 1, padding: '0 4px' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#cc4444' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#334433' }}
        >
          ✕
        </button>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', borderBottom: borderStyle, background: '#030803', flexShrink: 0, paddingTop: 3 }}>
        {(['AGENTS', 'MISSIONS', 'LOGS', 'SYSTEM'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={tab === t ? TAB_ACTIVE : TAB_STYLE}>{t}</button>
        ))}
      </div>

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Left panel ── */}
        <div style={{ flex: '1 1 58%', display: 'flex', flexDirection: 'column', borderRight: borderStyle, overflow: 'hidden' }}>

          {tab === 'AGENTS' && (
            <>
              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr 86px 88px 1fr', padding: '3px 10px', borderBottom: borderStyle, color: '#2a5a2a', fontSize: '14px', letterSpacing: 1, flexShrink: 0 }}>
                <span />
                <span>AGENT</span>
                <span>ROLE</span>
                <span>STATUS</span>
                <span>TASK</span>
              </div>

              {/* Agent rows */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {agents.length === 0 && (
                  <div style={{ padding: '20px 12px', color: '#1a3a1a', fontStyle: 'italic', textAlign: 'center' }}>
                    NO AGENTS ONLINE<br />
                    <span style={{ fontSize: '14px' }}>Click &quot;+ Agent&quot; to deploy one</span>
                  </div>
                )}
                {agents.map((id) => {
                  const ch = officeState.characters.get(id)
                  const tools = agentTools[id] ?? []
                  const status = agentStatuses[id] ?? ''
                  const isActive = ch?.isActive ?? false
                  const role = getAgentRole(tools)
                  const displayStatus = getDisplayStatus(status, isActive, tools)
                  const activeToolText = [...tools].reverse().find((t) => !t.done)?.status ?? ''
                  const name = agentNames[id] || `Agent #${id}`
                  const isSelected = selectedId === id
                  const palette = ch?.palette ?? 0
                  const hasApproval = tools.some((t) => t.permissionWait && !t.done)

                  return (
                    <div
                      key={id}
                      onClick={() => handleRowClick(id)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '26px 1fr 86px 88px 1fr',
                        alignItems: 'center',
                        padding: '5px 10px',
                        borderBottom: '1px solid #0d180d',
                        background: isSelected ? '#0c1e0c' : hasApproval ? 'rgba(80,50,0,0.25)' : 'transparent',
                        cursor: 'pointer',
                        outline: hasApproval ? '1px solid #3a2a00' : undefined,
                      }}
                      onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#091409' }}
                      onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = hasApproval ? 'rgba(80,50,0,0.25)' : 'transparent' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <MiniAvatar palette={palette} isActive={isActive} />
                      </div>
                      <span style={{ color: isSelected ? '#ccffcc' : '#779977', fontSize: '16px', letterSpacing: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 4 }} title={name}>
                        {name.toUpperCase()}
                      </span>
                      <span style={{ color: '#2a5a2a', fontSize: '14px', letterSpacing: 1 }}>{role}</span>
                      <span style={{ color: statusColor(displayStatus), fontSize: '14px', letterSpacing: 1 }}>
                        {displayStatus === 'ACTIVE' && <span className="pixel-agents-pulse" style={{ display: 'inline-block' }}>█ </span>}
                        {displayStatus === 'APPROVAL' && <span className="pixel-agents-pulse" style={{ display: 'inline-block' }}>⚠ </span>}
                        {displayStatus}
                      </span>
                      <span style={{ color: '#224422', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 4 }} title={activeToolText}>
                        {activeToolText}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Action bar for selected agent */}
              {selectedId !== null && (
                <div style={{ borderTop: borderStyle, padding: '4px 10px', display: 'flex', gap: 6, flexShrink: 0, background: panelBg, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => onFocusAgent(selectedId)}
                    style={{ ...RETRO_BTN, fontSize: '15px', padding: '3px 10px' }}
                    title="Open agent terminal in VS Code"
                  >
                    [ FOCUS ]
                  </button>
                  <button
                    onClick={() => onCloseAgent(selectedId)}
                    style={{ ...RETRO_BTN, fontSize: '15px', padding: '3px 10px', color: '#cc6666', borderColor: '#5a2a2a' }}
                    title="Terminate this agent"
                  >
                    [ CLOSE ]
                  </button>
                  {needsApproval && (
                    <>
                      <button
                        onClick={() => onPermissionAction(selectedId, 'approve')}
                        style={{ ...RETRO_BTN, fontSize: '15px', padding: '3px 10px', color: '#aaffaa', borderColor: '#3a8a3a', background: '#0a280a' }}
                        title="Approve tool permission (Y)"
                      >
                        [ YES ]
                      </button>
                      <button
                        onClick={() => onPermissionAction(selectedId, 'deny')}
                        style={{ ...RETRO_BTN, fontSize: '15px', padding: '3px 10px', color: '#ffaaaa', borderColor: '#8a3a3a', background: '#280a0a' }}
                        title="Deny tool permission (N)"
                      >
                        [ NO ]
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {tab === 'LOGS' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
              {allMessages.length === 0 && (
                <div style={{ padding: '16px', color: '#1a3a1a', fontStyle: 'italic', textAlign: 'center' }}>NO LOG ENTRIES</div>
              )}
              {allMessages.map((m) => {
                const pfxColor = m.kind === 'permission' ? '#cc8800' : m.kind === 'status' ? '#44aa44' : '#336633'
                return (
                  <div key={m.id} style={{ padding: '1px 10px', display: 'flex', gap: 6, opacity: m.done ? 0.45 : 1 }}>
                    <span style={{ color: pfxColor, flexShrink: 0, fontSize: '13px', whiteSpace: 'nowrap' }}>[{m.agentName.slice(0, 9).toUpperCase()}]</span>
                    <span style={{ color: '#557755', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.text}</span>
                  </div>
                )
              })}
            </div>
          )}

          {(tab === 'MISSIONS' || tab === 'SYSTEM') && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a3a1a', fontStyle: 'italic', fontSize: '15px', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: '24px' }}>[ {tab} ]</span>
              <span>— coming soon —</span>
            </div>
          )}
        </div>

        {/* ── Right: terminal + interaction ── */}
        <div style={{ flex: '1 1 42%', display: 'flex', flexDirection: 'column', background: panelBg, overflow: 'hidden' }}>

          {/* Terminal header */}
          <div style={{ padding: '3px 10px', borderBottom: borderStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ color: '#2a5a2a', fontSize: '13px', letterSpacing: 1 }}>
              AGENT TERMINAL
            </span>
            {selectedId !== null && (
              <span style={{ color: statusColor(getDisplayStatus(selStatus, selCh?.isActive ?? false, selTools)), fontSize: '13px', letterSpacing: 1 }}>
                {(agentNames[selectedId] || `AGENT #${selectedId}`).toUpperCase()}
              </span>
            )}
          </div>

          {/* Permission approval dialog — shown prominently when approval needed */}
          {needsApproval && selectedId !== null && pendingTool && (
            <div style={{ borderBottom: borderStyle, background: '#0d1800', padding: '10px 12px', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <CommanderAvatar palette={selCh?.palette ?? 0} />
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#ffcc44', fontSize: '13px', letterSpacing: 1, marginBottom: 4 }}>⚠ NEEDS APPROVAL</div>
                  {/* Speech bubble */}
                  <div style={{
                    background: '#ccffcc',
                    color: '#0a1a0a',
                    padding: '6px 10px',
                    fontSize: '15px',
                    lineHeight: '1.4',
                    position: 'relative',
                    border: '2px solid #3a6a3a',
                  }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 2 }}>
                      {(agentNames[selectedId] || `AGENT #${selectedId}`).toUpperCase()}, REQUESTING:
                    </div>
                    <div style={{ fontSize: '13px', wordBreak: 'break-all' }}>{pendingTool.status}</div>
                  </div>
                  {/* Buttons */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      onClick={() => onPermissionAction(selectedId, 'approve')}
                      style={{ ...RETRO_BTN, padding: '5px 14px', color: '#aaffaa', borderColor: '#3a8a3a', background: '#091c09' }}
                      title="Approve (Y)"
                    >
                      [ YES ]
                    </button>
                    <button
                      onClick={() => onPermissionAction(selectedId, 'deny')}
                      style={{ ...RETRO_BTN, padding: '5px 14px', color: '#ffaaaa', borderColor: '#8a3a3a', background: '#1c0909' }}
                      title="Deny (N)"
                    >
                      [ NO ]
                    </button>
                    <span style={{ color: '#2a4a2a', fontSize: '13px', alignSelf: 'center' }}>  Y / N</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Message log */}
          <div ref={logRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {selectedId !== null && (objective || latestReply) && (
              <div style={{ margin: '8px 10px 10px', border: borderStyle, background: '#071107', padding: '8px 10px' }}>
                <div style={{ color: '#2a5a2a', fontSize: '12px', letterSpacing: 1, marginBottom: 6 }}>CONTEXT SNAPSHOT</div>
                {objective && (
                  <div style={{ marginBottom: latestReply ? 8 : 0 }}>
                    <span style={{ color: '#88bb88', fontSize: '12px' }}>OBJECTIVE: </span>
                    <span style={{ color: '#779977', fontSize: '13px' }}>{objective}</span>
                  </div>
                )}
                {latestReply && (
                  <div>
                    <span style={{ color: '#88bb88', fontSize: '12px' }}>LAST REPLY: </span>
                    <span style={{ color: '#779977', fontSize: '13px' }}>{latestReply}</span>
                  </div>
                )}
              </div>
            )}
            {termMessages.length === 0 && (
              <div style={{ padding: '12px 10px', color: '#1a3a1a', fontStyle: 'italic' }}>
                {selectedId === null ? '> Select an agent from the table.' : selectedConversation.length > 0 ? '> No new ops events. Context loaded above.' : '> No activity yet.'}
              </div>
            )}
            {termMessages.map((m) => {
              const agentName = selectedId !== null ? (agentNames[selectedId] || `Agent #${selectedId}`) : ''
              let prefix: string
              let prefixColor: string
              if (m.kind === 'permission') {
                prefix = 'SYSTEM:'
                prefixColor = '#cc8800'
              } else if (m.kind === 'status') {
                prefix = 'MGR >'
                prefixColor = '#aaffaa'
              } else if (m.kind === 'info') {
                prefix = 'INFO:'
                prefixColor = '#4499aa'
              } else {
                prefix = `${agentName.slice(0, 10).toUpperCase()} [LLM]:`
                prefixColor = '#44aa44'
              }
              return (
                <div key={m.id} style={{ padding: '1px 10px', opacity: m.done ? 0.5 : 1 }}>
                  <span style={{ color: prefixColor, fontSize: '14px' }}>{prefix} </span>
                  <span style={{ color: '#668866', fontSize: '14px' }}>{m.text}</span>
                </div>
              )
            })}
            {isWaiting && !needsApproval && (
              <div style={{ padding: '2px 10px' }}>
                <span style={{ color: '#aaffaa', fontSize: '14px' }}>MGR &gt; </span>
                <span className="pixel-agents-pulse" style={{ display: 'inline-block', color: '#39ff14' }}>_</span>
              </div>
            )}
          </div>

          {/* Message input — shown when agent is waiting */}
          {isWaiting && !needsApproval && selectedId !== null && (
            <div style={{ borderTop: borderStyle, padding: '6px 10px', background: '#0a180a', flexShrink: 0 }}>
              <div style={{ color: '#4a8a4a', fontSize: '13px', marginBottom: 4, letterSpacing: 1 }}>
                AGENT WAITING — SEND REPLY:
              </div>
              <form onSubmit={handleCmdSubmit} style={{ display: 'flex', gap: 6 }}>
                <input
                  ref={inputRef}
                  value={cmd}
                  onChange={(e) => setCmd(e.target.value)}
                  style={{ flex: 1, background: '#060c06', border: '1px solid #2a5a2a', outline: 'none', color: '#ccffcc', fontSize: '15px', fontFamily: 'inherit', padding: '4px 8px', caretColor: '#39ff14' }}
                  placeholder="Type your reply..."
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="submit"
                  style={{ ...RETRO_BTN, fontSize: '14px', padding: '4px 12px', flexShrink: 0 }}
                >
                  SEND
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* ── Command bar ── */}
      <form
        onSubmit={handleCmdSubmit}
        style={{ borderTop: borderStyle, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6, background: panelBg, flexShrink: 0 }}
      >
        <span style={{ color: '#2a5a2a', fontSize: '15px', whiteSpace: 'nowrap' }}>
          {isWaiting && !needsApproval ? `> msg #${selectedId}:` : needsApproval ? `> [Y]es / [N]o:` : '> cmd:'}
        </span>
        <input
          value={isWaiting && !needsApproval ? '' : cmd}
          onChange={(e) => { if (!isWaiting || needsApproval) setCmd(e.target.value) }}
          readOnly={isWaiting && !needsApproval}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: isWaiting && !needsApproval ? '#334' : '#aaccaa', fontSize: '15px', fontFamily: 'inherit', caretColor: '#39ff14', opacity: isWaiting && !needsApproval ? 0.3 : 1 }}
          placeholder={needsApproval ? 'Y / N' : isWaiting ? '(use reply box above)' : 'focus <id> | close <id> | approve | deny'}
          autoComplete="off"
          spellCheck={false}
        />
        <span className="pixel-agents-pulse" style={{ color: '#39ff14', display: 'inline-block', fontSize: '15px' }}>_</span>
      </form>
    </div>
  )
}
