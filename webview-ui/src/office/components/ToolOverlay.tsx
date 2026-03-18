import { useState, useEffect } from 'react'
import type { ToolActivity } from '../types.js'
import type { OfficeState } from '../engine/officeState.js'
import type { SubagentCharacter, AgentMessage } from '../../hooks/useExtensionMessages.js'
import { TILE_SIZE, CharacterState } from '../types.js'
import { TOOL_OVERLAY_VERTICAL_OFFSET, CHARACTER_SITTING_OFFSET_PX } from '../../constants.js'
import { getExteriorMetrics } from '../engine/exterior.js'
import { AgentChatDialog } from '../../components/AgentChatDialog.js'

interface ToolOverlayProps {
  officeState: OfficeState
  agents: number[]
  agentTools: Record<number, ToolActivity[]>
  subagentCharacters: SubagentCharacter[]
  containerRef: React.RefObject<HTMLDivElement | null>
  zoom: number
  panRef: React.RefObject<{ x: number; y: number }>
  agentMessages: Record<number, AgentMessage[]>
  agentNames: Record<number, string>
  onRenameAgent: (id: number, name: string) => void
  agentWorkingDirs: Record<number, string>
  agentSources: Record<number, 'claude' | 'codex' | 'opencode' | 'gemini'>
  onSendMessage: (agentId: number, text: string) => void
  onPermissionAction: (agentId: number, action: 'approve' | 'deny') => void
}

function getActivityText(
  agentId: number,
  agentTools: Record<number, ToolActivity[]>,
  isActive: boolean,
): string {
  const tools = agentTools[agentId]
  if (tools && tools.length > 0) {
    const activeTool = [...tools].reverse().find((t) => !t.done)
    if (activeTool) {
      if (activeTool.permissionWait) return 'Needs approval'
      return activeTool.status
    }
    if (isActive) {
      const lastTool = tools[tools.length - 1]
      if (lastTool) return lastTool.status
    }
  }
  return 'Idle'
}

export function ToolOverlay({
  officeState,
  agents,
  agentTools,
  subagentCharacters,
  containerRef,
  zoom,
  panRef,
  agentMessages,
  agentNames,
  onRenameAgent,
  agentWorkingDirs,
  agentSources,
  onSendMessage,
  onPermissionAction,
}: ToolOverlayProps) {
  const [, setTick] = useState(0)
  useEffect(() => {
    let rafId = 0
    const tick = () => {
      setTick((n) => n + 1)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  const el = containerRef.current
  if (!el) return null
  const rect = el.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const canvasW = Math.round(rect.width * dpr)
  const canvasH = Math.round(rect.height * dpr)
  const layout = officeState.getLayout()
  const exterior = getExteriorMetrics(layout.cols, layout.rows, zoom)
  const worldOriginX = Math.floor((canvasW - exterior.worldWidthPx) / 2) + Math.round(panRef.current.x)
  const worldOriginY = Math.floor((canvasH - exterior.worldHeightPx) / 2) + Math.round(panRef.current.y)
  const deviceOffsetX = worldOriginX + exterior.padLeftPx
  const deviceOffsetY = worldOriginY + exterior.padTopPx

  const selectedId = officeState.selectedAgentId
  const hoveredId = officeState.hoveredAgentId

  const allIds = [...agents, ...subagentCharacters.map((s) => s.id)]
  const selectedCharacter = selectedId !== null ? officeState.characters.get(selectedId) : null
  const selectedIsSub = !!selectedCharacter?.isSubagent
  const selectedBaseId = selectedCharacter ? (selectedCharacter.isSubagent ? (selectedCharacter.parentAgentId ?? selectedCharacter.id) : selectedCharacter.id) : null
  const selectedDisplayName = selectedCharacter
    ? (agentNames[selectedCharacter.id] || selectedCharacter.folderName || (selectedIsSub ? 'Subtask' : `Agent #${selectedCharacter.id}`))
    : ''
  const selectedTools = selectedBaseId !== null ? (agentTools[selectedBaseId] || []) : []
  const selectedHasPermission = selectedTools.some((t) => t.permissionWait && !t.done) || selectedCharacter?.bubbleType === 'permission'
  const selectedActivityText = selectedCharacter
    ? (selectedIsSub
        ? (selectedHasPermission ? 'Needs approval' : (subagentCharacters.find((s) => s.id === selectedCharacter.id)?.label ?? 'Subtask'))
        : getActivityText(selectedBaseId ?? selectedCharacter.id, agentTools, selectedCharacter.isActive))
    : ''
  const selectedDotColor = selectedCharacter
    ? (selectedHasPermission
        ? 'var(--pixel-status-permission)'
        : (selectedCharacter.isActive && selectedTools.some((t) => !t.done))
          ? 'var(--pixel-status-active)'
          : null)
    : null

  return (
    <>
      {selectedCharacter && (
        <AgentChatDialog
          id={selectedCharacter.id}
          isSub={selectedIsSub}
          displayName={selectedDisplayName}
          activityText={selectedActivityText}
          dotColor={selectedDotColor}
          isActive={selectedCharacter.isActive}
          messages={agentMessages[selectedBaseId ?? selectedCharacter.id] || []}
          onClose={() => {
            officeState.selectedAgentId = null
            officeState.cameraFollowId = null
          }}
          onRename={(name) => onRenameAgent(selectedCharacter.id, name)}
          onSendMessage={selectedIsSub ? undefined : (text) => onSendMessage(selectedCharacter.id, text)}
          onPermissionAction={selectedIsSub ? undefined : (action) => onPermissionAction(selectedCharacter.id, action)}
          source={agentSources[selectedCharacter.id] ?? selectedCharacter.source}
          workingDir={agentWorkingDirs[selectedCharacter.id]}
          canInteract={!selectedIsSub && ['claude', 'codex', 'opencode'].includes(agentSources[selectedCharacter.id] ?? selectedCharacter.source ?? '')}
          needsApproval={!selectedIsSub && selectedHasPermission}
        />
      )}
      {allIds.map((id) => {
        const ch = officeState.characters.get(id)
        if (!ch) return null

        const isSelected = selectedId === id
        const isHovered = hoveredId === id
        const isSub = ch.isSubagent
        const hasPermission = ch.bubbleType === 'permission'
        const isWaiting = ch.bubbleType === 'waiting'

        const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0
        const screenX = (deviceOffsetX + ch.x * zoom) / dpr
        const screenY = (deviceOffsetY + (ch.y + sittingOffset - TOOL_OVERLAY_VERTICAL_OFFSET) * zoom) / dpr

        const displayName = agentNames[id] || ch.folderName || (isSub ? 'Subtask' : `Agent #${id}`)

        const tools = agentTools[isSub ? (ch.parentAgentId ?? id) : id]
        const hasActiveTools = tools?.some((t) => !t.done)
        const hasPermissionTool = tools?.some((t) => t.permissionWait && !t.done)
        const dotColor = (hasPermission || hasPermissionTool)
          ? 'var(--pixel-status-permission)'
          : (ch.isActive && hasActiveTools)
            ? 'var(--pixel-status-active)'
            : null

        const activityText = isSub
          ? (hasPermission ? 'Needs approval' : (subagentCharacters.find((s) => s.id === id)?.label ?? 'Subtask'))
          : getActivityText(isSub ? (ch.parentAgentId ?? id) : id, agentTools, ch.isActive)

        if (isSelected) return null

        // Auto-appearing permission/waiting dialog when not selected
        if ((hasPermission || hasPermissionTool) && !isSub) {
          return (
            <div
              key={id}
              className="pixel-agents-flicker"
              style={{
                position: 'absolute',
                left: screenX,
                top: screenY - 24,
                animation: 'pixel-agents-permission-shake 0.4s ease-in-out 1',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                pointerEvents: 'none',
                zIndex: 'var(--pixel-overlay-selected-z)' as unknown as number,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'var(--pixel-bg)',
                  border: '2px solid var(--pixel-status-permission)',
                  padding: '4px 10px',
                  boxShadow: '0 0 8px var(--pixel-status-permission)',
                  whiteSpace: 'nowrap',
                  animation: 'pixel-agents-pulse 1.2s ease-in-out infinite',
                }}
              >
                <span style={{ fontSize: '18px' }}>🔒</span>
                <div>
                  <span style={{ fontSize: '20px', color: 'var(--pixel-status-permission)', display: 'block' }}>
                    Needs approval
                  </span>
                  <span style={{ fontSize: '14px', color: 'var(--pixel-text-dim)', display: 'block' }}>
                    {displayName} · click to open panel
                  </span>
                </div>
              </div>
            </div>
          )
        }

        // Compact status bubble for waiting agents
        if (isWaiting && !isSub) {
          return (
            <div
              key={id}
              style={{
                position: 'absolute',
                left: screenX,
                top: screenY - 24,
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                pointerEvents: 'none',
                zIndex: 'var(--pixel-overlay-z)' as unknown as number,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'var(--pixel-bg)',
                  border: '2px solid var(--pixel-border)',
                  padding: '3px 8px',
                  boxShadow: 'var(--pixel-shadow)',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontSize: '18px' }}>💬</span>
                <div>
                  <span style={{ fontSize: '20px', color: 'var(--vscode-foreground)', display: 'block' }}>
                    Waiting for input
                  </span>
                  <span style={{ fontSize: '14px', color: 'var(--pixel-text-dim)', display: 'block' }}>
                    {displayName} · click to chat
                  </span>
                </div>
              </div>
            </div>
          )
        }

        // Hover state: show compact info box
        if (isHovered) {
          const isPermissionColor = dotColor === 'var(--pixel-status-permission)'
          return (
            <div
              key={id}
              style={{
                position: 'absolute',
                left: screenX,
                top: screenY - 24,
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                pointerEvents: 'none',
                zIndex: 'var(--pixel-overlay-selected-z)' as unknown as number,
              }}
            >
              <div
                className={isPermissionColor ? 'pixel-agents-flicker' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'var(--pixel-bg)',
                  border: '2px solid var(--pixel-border)',
                  padding: '3px 8px',
                  boxShadow: 'var(--pixel-shadow)',
                  whiteSpace: 'nowrap',
                  maxWidth: 220,
                }}
              >
                {dotColor && (
                  <span
                    className={ch.isActive && dotColor !== 'var(--pixel-status-permission)' ? 'pixel-agents-pulse' : undefined}
                    style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }}
                  />
                )}
                <div style={{ overflow: 'hidden' }}>
                  <span
                    style={{
                      fontSize: isSub ? '20px' : '22px',
                      fontStyle: isSub ? 'italic' : undefined,
                      color: 'var(--vscode-foreground)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: 'block',
                    }}
                  >
                    {activityText}
                  </span>
                  <span
                    style={{
                      fontSize: '14px',
                      color: 'var(--pixel-text-dim)',
                      display: 'block',
                    }}
                  >
                    {displayName} · click to open chat
                  </span>
                  {agentWorkingDirs[id] && !isSub && (() => {
                    const dir = agentWorkingDirs[id]
                    const parts = dir.replace(/\\/g, '/').split('/').filter(Boolean)
                    const shortDir = parts.slice(-2).join('/')
                    return (
                      <span style={{ fontSize: '13px', color: 'var(--pixel-border)', display: 'block', marginTop: 1 }}>
                        📁 {shortDir}
                      </span>
                    )
                  })()}
                </div>
              </div>
            </div>
          )
        }

        // Default: small name tag
        return (
          <div
            key={id}
            style={{
              position: 'absolute',
              left: screenX,
              top: screenY - 24,
              transform: 'translateX(-50%)',
              pointerEvents: 'none',
              zIndex: 'var(--pixel-overlay-z)' as unknown as number,
            }}
          >
            <div
              style={{
                background: 'var(--pixel-bg)',
                border: `1px solid ${ch.isActive && dotColor ? dotColor : 'var(--pixel-border)'}`,
                padding: '1px 6px',
                boxShadow: ch.isActive && dotColor ? `0 0 6px ${dotColor}40` : 'var(--pixel-shadow)',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {dotColor && (
                <span
                  className="pixel-agents-pulse"
                  style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, flexShrink: 0 }}
                />
              )}
              <span style={{ fontSize: '16px', color: 'var(--pixel-text-dim)' }}>
                {displayName}
              </span>
            </div>
          </div>
        )
      })}
    </>
  )
}
