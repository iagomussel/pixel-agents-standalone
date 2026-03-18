import { useRef, useEffect, useState, useCallback } from 'react'
import type { AgentMessage } from '../hooks/useExtensionMessages.js'

interface AgentChatDialogProps {
  id: number
  isSub: boolean
  displayName: string
  activityText: string
  dotColor: string | null
  isActive: boolean
  messages: AgentMessage[]
  onClose: () => void
  onRename: (name: string) => void
  onSendMessage?: (text: string) => void
  onPermissionAction?: (action: 'approve' | 'deny') => void
  source?: string
  workingDir?: string
  canInteract?: boolean
  needsApproval?: boolean
}

const PANEL_WIDTH = 380

export function AgentChatDialog({
  id: _id,
  isSub,
  displayName,
  activityText,
  dotColor,
  isActive,
  messages,
  onClose,
  onRename,
  onSendMessage,
  onPermissionAction,
  source,
  workingDir,
  canInteract = true,
  needsApproval = false,
}: AgentChatDialogProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [editName, setEditName] = useState(displayName)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Focus input when renaming starts
  useEffect(() => {
    if (isRenaming) {
      setEditName(displayName)
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isRenaming, displayName])

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

  const visibleMessages = messages.slice(-12)
  const sourceLabel = source ? source.toUpperCase() : 'AGENT'
  const shortDir = workingDir
    ? workingDir.replace(/\\/g, '/').split('/').filter(Boolean).slice(-3).join('/')
    : null

  return (
    <div
      style={{
        position: 'absolute',
        right: 16,
        top: 16,
        bottom: 84,
        width: `min(${PANEL_WIDTH}px, calc(100vw - 32px))`,
        background: 'var(--pixel-bg)',
        border: '2px solid var(--pixel-border-light)',
        boxShadow: 'var(--pixel-shadow)',
        pointerEvents: 'auto',
        zIndex: 'var(--pixel-overlay-selected-z)' as unknown as number,
        display: 'flex',
        flexDirection: 'column',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header: activity status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '8px 10px',
          borderBottom: '1px solid var(--pixel-border)',
          minHeight: 36,
        }}
      >
        {dotColor && (
          <span
            className={isActive && dotColor !== 'var(--pixel-status-permission)' ? 'pixel-agents-pulse' : undefined}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: dotColor,
              flexShrink: 0,
            }}
          />
        )}
        <span
          style={{
            flex: 1,
            fontSize: isSub ? '18px' : '20px',
            fontStyle: isSub ? 'italic' : undefined,
            color: 'var(--vscode-foreground)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {activityText}
        </span>
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
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--pixel-close-hover)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--pixel-close-text)' }}
          >
            ×
          </button>
        )}
      </div>

      <div
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid var(--pixel-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '13px', color: 'var(--pixel-text-dim)' }}>Status</span>
          <span style={{ fontSize: '14px', color: isActive ? 'var(--pixel-status-active)' : 'var(--pixel-text)' }}>
            {isActive ? 'Active' : 'Idle'}
          </span>
        </div>
        {shortDir && (
          <div style={{ fontSize: '13px', color: 'var(--pixel-text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {shortDir}
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
      </div>

      {/* Name row (editable) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 10px',
          borderBottom: '1px solid var(--pixel-border)',
          gap: 4,
          minHeight: 28,
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
              fontSize: '18px',
              background: 'var(--vscode-input-background)',
              color: 'var(--vscode-input-foreground)',
              border: '1px solid var(--pixel-accent)',
              padding: '1px 4px',
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
              opacity: 0.6,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.6' }}
          >
            ✎
          </button>
        )}
      </div>

      {/* Message feed */}
      {visibleMessages.length > 0 && (
        <div
          style={{
            overflowY: 'auto',
            padding: '6px 0',
            flex: 1,
          }}
        >
          {visibleMessages.map((m) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
                padding: '2px 8px',
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
                  fontSize: '17px',
                  color: 'var(--vscode-foreground)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'normal',
                  wordBreak: 'break-word',
                  flex: 1,
                }}
              >
                {m.text}
              </span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {visibleMessages.length === 0 && (
        <div style={{ padding: '10px', fontSize: '16px', color: 'var(--pixel-text-dim)', fontStyle: 'italic', flex: 1 }}>
          No activity yet
        </div>
      )}

      {!isSub && (
        <form
          onSubmit={handleSubmit}
          style={{
            borderTop: '1px solid var(--pixel-border)',
            padding: '10px',
            display: 'flex',
            gap: 8,
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!canInteract}
            placeholder={canInteract ? 'Send a message to this agent...' : 'Interaction not available for this provider yet'}
            style={{
              flex: 1,
              fontSize: '16px',
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
