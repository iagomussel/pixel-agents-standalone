import { useRef, useEffect, useState, useCallback } from 'react'
import type { AgentMessage } from '../hooks/useExtensionMessages.js'

interface AgentChatDialogProps {
  id: number
  isSub: boolean
  screenX: number
  screenY: number
  displayName: string
  activityText: string
  dotColor: string | null
  isActive: boolean
  messages: AgentMessage[]
  onClose: () => void
  onRename: (name: string) => void
}

const DIALOG_WIDTH = 260

export function AgentChatDialog({
  id: _id,
  isSub,
  screenX,
  screenY,
  displayName,
  activityText,
  dotColor,
  isActive,
  messages,
  onClose,
  onRename,
}: AgentChatDialogProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [editName, setEditName] = useState(displayName)
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

  const visibleMessages = messages.slice(-12)

  return (
    <div
      style={{
        position: 'absolute',
        left: screenX - DIALOG_WIDTH / 2,
        top: screenY - 24,
        width: DIALOG_WIDTH,
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
          padding: '4px 8px',
          borderBottom: '1px solid var(--pixel-border)',
          minHeight: 28,
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
        {!isSub && (
          <button
            onClick={(e) => { e.stopPropagation(); onClose() }}
            title="Close agent"
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

      {/* Name row (editable) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '3px 8px',
          borderBottom: '1px solid var(--pixel-border)',
          gap: 4,
          minHeight: 24,
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
            maxHeight: 160,
            overflowY: 'auto',
            padding: '4px 0',
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
                  whiteSpace: 'nowrap',
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
        <div style={{ padding: '6px 8px', fontSize: '16px', color: 'var(--pixel-text-dim)', fontStyle: 'italic' }}>
          No activity yet
        </div>
      )}
    </div>
  )
}
