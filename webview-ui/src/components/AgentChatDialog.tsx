import { useRef, useEffect, useState, useCallback } from 'react'
import type { AgentConversationEntry, AgentMessage } from '../hooks/useExtensionMessages.js'

interface AgentChatDialogProps {
  id: number
  isSub: boolean
  displayName: string
  activityText: string
  dotColor: string | null
  isActive: boolean
  messages: AgentMessage[]
  conversation: AgentConversationEntry[]
  onClose: () => void
  onRename: (name: string) => void
  onSendMessage?: (text: string) => void
  onPermissionAction?: (action: 'approve' | 'deny') => void
  source?: string
  workingDir?: string
  resumeCommand?: string
  canInteract?: boolean
  needsApproval?: boolean
  onLayoff?: () => void
}

type PanelTab = 'context' | 'events'

const PANEL_WIDTH = 430

function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

function getContextSnapshot(conversation: AgentConversationEntry[]): { objective: string | null; latestReply: string | null } {
  let objective: string | null = null
  let latestReply: string | null = null

  for (let i = conversation.length - 1; i >= 0; i -= 1) {
    const entry = conversation[i]
    if (!latestReply && entry.role === 'assistant') {
      latestReply = truncateText(entry.text, 160)
    }
    if (!objective && entry.role === 'user') {
      objective = truncateText(entry.text, 160)
    }
    if (objective && latestReply) break
  }

  return { objective, latestReply }
}

function formatRelativeTimestamp(timestamp: number): string {
  const diffMs = Math.max(0, Date.now() - timestamp)
  const diffMinutes = Math.floor(diffMs / 60_000)
  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '6px 8px',
        border: '1px solid var(--pixel-border)',
        background: active ? 'var(--pixel-agent-bg)' : 'rgba(0,0,0,0.18)',
        color: active ? 'var(--pixel-agent-text)' : 'var(--pixel-text-dim)',
        cursor: 'pointer',
        fontSize: '14px',
        textTransform: 'uppercase',
        letterSpacing: 1,
      }}
    >
      {label}
    </button>
  )
}

export function AgentChatDialog({
  id,
  isSub,
  displayName,
  activityText,
  dotColor,
  isActive,
  messages,
  conversation,
  onClose,
  onRename,
  onSendMessage,
  onPermissionAction,
  source,
  workingDir,
  resumeCommand,
  canInteract = true,
  needsApproval = false,
  onLayoff,
}: AgentChatDialogProps) {
  const contentEndRef = useRef<HTMLDivElement>(null)
  const copyResetTimeoutRef = useRef<number | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [editName, setEditName] = useState(displayName)
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<PanelTab>(isActive ? 'events' : 'context')
  const inputRef = useRef<HTMLInputElement>(null)
  const { objective, latestReply } = getContextSnapshot(conversation)

  useEffect(() => {
    contentEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, conversation.length, tab])

  useEffect(() => {
    if (isRenaming) {
      setEditName(displayName)
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isRenaming, displayName])

  useEffect(() => {
    setTab(!isActive && conversation.length > 0 ? 'context' : 'events')
  }, [id, isActive, conversation.length])

  useEffect(() => {
    setCopied(false)
  }, [resumeCommand, id])

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current)
      }
    }
  }, [])

  const startRename = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (isSub) return
    setIsRenaming(true)
  }, [isSub])

  const finishRename = useCallback(() => {
    setIsRenaming(false)
    onRename(editName)
  }, [editName, onRename])

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      finishRename()
    } else if (e.key === 'Escape') {
      setIsRenaming(false)
      setEditName(displayName)
    }
  }, [finishRename, displayName])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed || !onSendMessage) return
    onSendMessage(trimmed)
    setDraft('')
  }, [draft, onSendMessage])

  const handleCopyResumeCommand = useCallback(async () => {
    if (!resumeCommand || !navigator.clipboard) return
    await navigator.clipboard.writeText(resumeCommand)
    setCopied(true)
    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current)
    }
    copyResetTimeoutRef.current = window.setTimeout(() => {
      setCopied(false)
      copyResetTimeoutRef.current = null
    }, 1600)
  }, [resumeCommand])

  const handleLayoff = useCallback(() => {
    if (!onLayoff) return
    const confirmed = window.confirm(`Lay off ${displayName}?`)
    if (!confirmed) return
    onClose()
    onLayoff()
  }, [displayName, onClose, onLayoff])

  const visibleMessages = messages.slice(-14)
  const visibleConversation = conversation.slice(-14)
  const sourceLabel = source ? source.toUpperCase() : 'AGENT'
  const shortDir = workingDir
    ? workingDir.replace(/\\/g, '/').split('/').filter(Boolean).slice(-3).join('/')
    : null
  const defaultTabLabel = !isActive && conversation.length > 0 ? 'Context' : 'Ops'

  return (
    <div
      style={{
        position: 'absolute',
        right: 16,
        top: 16,
        bottom: 84,
        width: `min(${PANEL_WIDTH}px, calc(100vw - 32px))`,
        background: 'linear-gradient(180deg, rgba(10,16,18,0.96), rgba(7,10,12,0.98))',
        border: '2px solid var(--pixel-border-light)',
        boxShadow: 'var(--pixel-shadow)',
        pointerEvents: 'auto',
        zIndex: 'var(--pixel-overlay-selected-z)' as unknown as number,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          borderBottom: '1px solid var(--pixel-border)',
          background: 'rgba(255,255,255,0.03)',
        }}
      >
        {dotColor && (
          <span
            className={isActive && dotColor !== 'var(--pixel-status-permission)' ? 'pixel-agents-pulse' : undefined}
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: dotColor,
              flexShrink: 0,
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '18px',
              color: 'var(--vscode-foreground)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {activityText}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--pixel-text-dim)', marginTop: 2 }}>
            Default view: {defaultTabLabel}
          </div>
        </div>
        <span
          style={{
            fontSize: '12px',
            color: 'var(--pixel-text-dim)',
            border: '1px solid var(--pixel-border)',
            padding: '2px 6px',
            whiteSpace: 'nowrap',
          }}
        >
          {sourceLabel}
        </span>
        {!isSub && (
          <button
            onClick={(e) => { e.stopPropagation(); onClose() }}
            title="Close panel"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--pixel-close-text)',
              cursor: 'pointer',
              padding: '0 2px',
              fontSize: '24px',
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        )}
      </div>

      <div
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid var(--pixel-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: 'var(--pixel-text-dim)' }}>Status</span>
          <span style={{ fontSize: '14px', color: isActive ? 'var(--pixel-status-active)' : 'var(--pixel-text)' }}>
            {isActive ? 'Active' : 'Idle'}
          </span>
          {conversation.length > 0 && (
            <span style={{ fontSize: '12px', color: 'var(--pixel-text-dim)' }}>
              {conversation.length} context turns
            </span>
          )}
        </div>
        {shortDir && (
          <div style={{ fontSize: '13px', color: 'var(--pixel-text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {shortDir}
          </div>
        )}
        {!isSub && resumeCommand && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '11px', color: 'var(--pixel-text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>
              Resume in terminal
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'stretch' }}>
              <div
                title={resumeCommand}
                style={{
                  minWidth: 0,
                  padding: '8px 10px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.04)',
                  color: 'var(--vscode-foreground)',
                  fontFamily: 'var(--vscode-editor-font-family, monospace)',
                  fontSize: '12px',
                  lineHeight: 1.45,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {resumeCommand}
              </div>
              <button
                type="button"
                onClick={() => { void handleCopyResumeCommand() }}
                title="Copy resume command"
                style={{
                  minWidth: 76,
                  padding: '8px 12px',
                  border: '1px solid var(--pixel-agent-border)',
                  background: copied ? 'rgba(80, 180, 120, 0.18)' : 'var(--pixel-agent-bg)',
                  color: copied ? '#d6ffe4' : 'var(--pixel-agent-text)',
                  cursor: 'pointer',
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}
        {needsApproval && !isSub && canInteract && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => onPermissionAction?.('approve')}
              style={{
                flex: 1,
                background: 'rgba(80, 180, 120, 0.18)',
                color: '#d6ffe4',
                border: '1px solid #5ac88c',
                padding: '8px 10px',
                cursor: 'pointer',
              }}
            >
              Approve
            </button>
            <button
              onClick={() => onPermissionAction?.('deny')}
              style={{
                flex: 1,
                background: 'rgba(220, 90, 90, 0.18)',
                color: '#ffd6d6',
                border: '1px solid #e16f6f',
                padding: '8px 10px',
                cursor: 'pointer',
              }}
            >
              Deny
            </button>
          </div>
        )}
        {!isSub && onLayoff && (
          <button
            type="button"
            onClick={handleLayoff}
            style={{
              alignSelf: 'flex-start',
              background: 'rgba(220, 90, 90, 0.18)',
              color: '#ffd6d6',
              border: '1px solid #e16f6f',
              padding: '8px 12px',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: 0.8,
            }}
          >
            Lay Off
          </button>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px',
          borderBottom: '1px solid var(--pixel-border)',
          gap: 6,
        }}
      >
        {isRenaming ? (
          <input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={finishRename}
            onKeyDown={handleRenameKeyDown}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              fontSize: '16px',
              background: 'var(--vscode-input-background)',
              color: 'var(--vscode-input-foreground)',
              border: '1px solid var(--pixel-accent)',
              padding: '2px 6px',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        ) : (
          <span
            title={isSub ? undefined : 'Double-click to rename'}
            onDoubleClick={startRename}
            style={{
              flex: 1,
              fontSize: '16px',
              color: 'var(--pixel-text-dim)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              cursor: isSub ? 'default' : 'text',
              userSelect: 'none',
            }}
          >
            {displayName}
          </span>
        )}
        {!isSub && !isRenaming && (
          <button
            onClick={startRename}
            title="Rename agent"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--pixel-text-dim)',
              cursor: 'pointer',
              padding: '0 2px',
              fontSize: '14px',
              lineHeight: 1,
              flexShrink: 0,
              opacity: 0.7,
            }}
          >
            ✎
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--pixel-border)' }}>
        <TabButton label="Context" active={tab === 'context'} onClick={() => setTab('context')} />
        <TabButton label="Ops" active={tab === 'events'} onClick={() => setTab('events')} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tab === 'context' && (
          <>
            {(objective || latestReply) && (
              <div
                style={{
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)',
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {objective && (
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--pixel-text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>
                      Current objective
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--vscode-foreground)', marginTop: 3 }}>
                      {objective}
                    </div>
                  </div>
                )}
                {latestReply && (
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--pixel-text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>
                      Last reply
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--vscode-foreground)', marginTop: 3 }}>
                      {latestReply}
                    </div>
                  </div>
                )}
              </div>
            )}

            {visibleConversation.length > 0 ? (
              visibleConversation.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    alignSelf: entry.role === 'user' ? 'flex-end' : 'stretch',
                    maxWidth: '92%',
                    background: entry.role === 'user' ? 'rgba(72, 145, 255, 0.16)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${entry.role === 'user' ? 'rgba(72,145,255,0.32)' : 'rgba(255,255,255,0.08)'}`,
                    padding: '10px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: '11px', color: 'var(--pixel-text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>
                      {entry.role === 'user' ? 'You / User' : sourceLabel}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--pixel-text-dim)' }}>
                      {formatRelativeTimestamp(entry.timestamp)}
                    </span>
                  </div>
                  <div style={{ fontSize: '15px', color: 'var(--vscode-foreground)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {entry.text}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: '10px', fontSize: '15px', color: 'var(--pixel-text-dim)', fontStyle: 'italic' }}>
                No transcript context available for this agent yet.
              </div>
            )}
          </>
        )}

        {tab === 'events' && (
          <>
            {visibleMessages.length > 0 ? (
              visibleMessages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 6,
                    padding: '2px 0',
                    opacity: m.done ? 0.55 : 1,
                  }}
                >
                  <span
                    style={{
                      fontSize: '13px',
                      flexShrink: 0,
                      marginTop: 1,
                      color: m.kind === 'permission'
                        ? 'var(--pixel-status-permission)'
                        : m.kind === 'status'
                          ? 'var(--pixel-text-dim)'
                          : m.done
                            ? '#4caf50'
                            : 'var(--pixel-status-active)',
                    }}
                  >
                    {m.kind === 'permission' ? '🔒' : m.kind === 'status' ? '💬' : m.done ? '✓' : '⟳'}
                  </span>
                  <span
                    style={{
                      fontSize: '15px',
                      color: 'var(--vscode-foreground)',
                      whiteSpace: 'normal',
                      wordBreak: 'break-word',
                      flex: 1,
                    }}
                  >
                    {m.text}
                  </span>
                </div>
              ))
            ) : (
              <div style={{ padding: '10px 0', fontSize: '15px', color: 'var(--pixel-text-dim)', fontStyle: 'italic' }}>
                No operational events yet.
              </div>
            )}
          </>
        )}
        <div ref={contentEndRef} />
      </div>

      {!isSub && (
        <form
          onSubmit={handleSubmit}
          style={{
            borderTop: '1px solid var(--pixel-border)',
            padding: '10px 12px',
            display: 'flex',
            gap: 8,
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!canInteract}
            placeholder={canInteract ? 'Continue this agent with more context...' : 'Interaction not available for this provider yet'}
            style={{
              flex: 1,
              fontSize: '15px',
              background: 'var(--vscode-input-background, rgba(255,255,255,0.06))',
              color: 'var(--vscode-input-foreground, var(--vscode-foreground))',
              border: '1px solid var(--pixel-border)',
              padding: '8px 10px',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="submit"
            disabled={!canInteract || !draft.trim()}
            style={{
              background: !canInteract || !draft.trim() ? 'rgba(255,255,255,0.08)' : 'var(--pixel-agent-bg)',
              color: !canInteract || !draft.trim() ? 'var(--pixel-text-dim)' : 'var(--pixel-agent-text)',
              border: '1px solid var(--pixel-agent-border)',
              padding: '8px 12px',
              cursor: !canInteract || !draft.trim() ? 'default' : 'pointer',
              minWidth: 72,
            }}
          >
            Send
          </button>
        </form>
      )}
    </div>
  )
}
