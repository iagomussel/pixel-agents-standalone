import { useState, useEffect, useRef, useCallback } from 'react'
import type { OfficeState } from '../office/engine/officeState.js'
import type { OfficeLayout, ToolActivity } from '../office/types.js'
import { extractToolName } from '../office/toolUtils.js'
import { migrateLayoutColors } from '../office/layout/layoutSerializer.js'
import { buildDynamicCatalog } from '../office/layout/furnitureCatalog.js'
import { setFloorSprites } from '../office/floorTiles.js'
import { setWallSprites } from '../office/wallTiles.js'
import { setCharacterTemplates } from '../office/sprites/spriteData.js'
import { vscode } from '../vscodeApi.js'
import { playDoneSound, setSoundEnabled } from '../notificationSound.js'

export interface SubagentCharacter {
  id: number
  parentAgentId: number
  parentToolId: string
  label: string
}

export interface FurnitureAsset {
  id: string
  name: string
  label: string
  category: string
  file: string
  width: number
  height: number
  footprintW: number
  footprintH: number
  isDesk: boolean
  canPlaceOnWalls: boolean
  partOfGroup?: boolean
  groupId?: string
  canPlaceOnSurfaces?: boolean
  backgroundTiles?: number
}

export interface WorkspaceFolder {
  name: string
  path: string
}

export interface AgentMessage {
  id: string
  text: string
  timestamp: number
  kind: 'tool' | 'status' | 'permission' | 'info'
  done: boolean
}

export interface AgentConversationEntry {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: number
}

export type AgentSource = 'claude' | 'codex' | 'opencode' | 'gemini'

export interface ExtensionMessageState {
  agents: number[]
  selectedAgent: number | null
  agentTools: Record<number, ToolActivity[]>
  agentStatuses: Record<number, string>
  subagentTools: Record<number, Record<string, ToolActivity[]>>
  subagentCharacters: SubagentCharacter[]
  layoutReady: boolean
  loadedAssets?: { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> }
  workspaceFolders: WorkspaceFolder[]
  agentMessages: Record<number, AgentMessage[]>
  agentConversations: Record<number, AgentConversationEntry[]>
  agentNames: Record<number, string>
  agentSources: Record<number, AgentSource>
  agentResumeCommands: Record<number, string>
  updateAgentName: (id: number, name: string) => void
  agentWorkingDirs: Record<number, string>
  agentTokens: Record<number, { input: number; output: number }>
  agentFolderNames: Record<number, string>
  sendAgentMessage: (agentId: number, text: string) => void
  handlePermissionAction: (agentId: number, action: 'approve' | 'deny') => void
}

function saveAgentSeats(os: OfficeState): void {
  const seats: Record<number, { palette: number; hueShift: number; seatId: string | null }> = {}
  for (const ch of os.characters.values()) {
    if (ch.isSubagent) continue
    seats[ch.id] = { palette: ch.palette, hueShift: ch.hueShift, seatId: ch.seatId }
  }
  vscode.postMessage({ type: 'saveAgentSeats', seats })
}

const MAX_MESSAGES_PER_AGENT = 30
const MAX_CONVERSATION_ENTRIES = 24

function appendMessage(
  prev: Record<number, AgentMessage[]>,
  id: number,
  msg: AgentMessage,
): Record<number, AgentMessage[]> {
  const list = prev[id] || []
  const next = [...list, msg]
  return { ...prev, [id]: next.length > MAX_MESSAGES_PER_AGENT ? next.slice(-MAX_MESSAGES_PER_AGENT) : next }
}

function appendConversation(
  prev: Record<number, AgentConversationEntry[]>,
  id: number,
  entry: AgentConversationEntry,
): Record<number, AgentConversationEntry[]> {
  const list = prev[id] || []
  const lastEntry = list[list.length - 1]
  if (lastEntry && lastEntry.role === entry.role && lastEntry.text === entry.text) {
    return prev
  }
  const next = [...list, entry]
  return { ...prev, [id]: next.length > MAX_CONVERSATION_ENTRIES ? next.slice(-MAX_CONVERSATION_ENTRIES) : next }
}

export function useExtensionMessages(
  getOfficeState: () => OfficeState,
  onLayoutLoaded?: (layout: OfficeLayout) => void,
  isEditDirty?: () => boolean,
): ExtensionMessageState {
  const [agents, setAgents] = useState<number[]>([])
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null)
  const [agentTools, setAgentTools] = useState<Record<number, ToolActivity[]>>({})
  const [agentStatuses, setAgentStatuses] = useState<Record<number, string>>({})
  const [subagentTools, setSubagentTools] = useState<Record<number, Record<string, ToolActivity[]>>>({})
  const [subagentCharacters, setSubagentCharacters] = useState<SubagentCharacter[]>([])
  const [layoutReady, setLayoutReady] = useState(false)
  const [loadedAssets, setLoadedAssets] = useState<{ catalog: FurnitureAsset[]; sprites: Record<string, string[][]> } | undefined>()
  const [workspaceFolders, setWorkspaceFolders] = useState<WorkspaceFolder[]>([])
  const [agentMessages, setAgentMessages] = useState<Record<number, AgentMessage[]>>({})
  const [agentConversations, setAgentConversations] = useState<Record<number, AgentConversationEntry[]>>({})
  const [agentNames, setAgentNames] = useState<Record<number, string>>({})
  const [agentSources, setAgentSources] = useState<Record<number, AgentSource>>({})
  const [agentResumeCommands, setAgentResumeCommands] = useState<Record<number, string>>({})
  const [agentWorkingDirs, setAgentWorkingDirs] = useState<Record<number, string>>({})
  const [agentTokens, setAgentTokens] = useState<Record<number, { input: number; output: number }>>({})
  const [agentFolderNames, setAgentFolderNames] = useState<Record<number, string>>({})

  // Track whether initial layout has been loaded (ref to avoid re-render)
  const layoutReadyRef = useRef(false)

  const sendAgentMessage = useCallback((agentId: number, text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const timestamp = Date.now()
    if (trimmed !== '/compact') {
      setAgentConversations((prev) =>
        appendConversation(prev, agentId, {
          id: `user-${timestamp}`,
          role: 'user',
          text: trimmed,
          timestamp,
        }),
      )
    }
    setAgentMessages((prev) =>
      appendMessage(prev, agentId, {
        id: `user-${timestamp}`,
        text: `You: ${trimmed}`,
        timestamp,
        kind: 'info',
        done: true,
      }),
    )
    vscode.postMessage({ type: 'userMessage', agentId, text: trimmed })
  }, [])

  const handlePermissionAction = useCallback((agentId: number, action: 'approve' | 'deny') => {
    setAgentMessages((prev) =>
      appendMessage(prev, agentId, {
        id: `perm-action-${Date.now()}`,
        text: action === 'approve' ? 'You approved the pending action' : 'You denied the pending action',
        timestamp: Date.now(),
        kind: 'info',
        done: true,
      }),
    )
    vscode.postMessage({ type: 'permissionAction', agentId, action })
  }, [])

  const updateAgentName = useCallback((id: number, name: string) => {
    setAgentNames((prev) => {
      const next = { ...prev }
      const trimmed = name.trim()
      if (trimmed) {
        next[id] = trimmed
      } else {
        delete next[id]
      }
      vscode.postMessage({ type: 'saveAgentNames', names: next })
      return next
    })
  }, [])

  useEffect(() => {
    // Buffer agents from existingAgents until layout is loaded
    let pendingAgents: Array<{ id: number; palette?: number; hueShift?: number; seatId?: string; folderName?: string; source?: AgentSource }> = []

    const handler = (e: MessageEvent) => {
      const msg = e.data
      const os = getOfficeState()

      if (msg.type === 'layoutLoaded') {
        // Skip external layout updates while editor has unsaved changes
        if (layoutReadyRef.current && isEditDirty?.()) {
          console.log('[Webview] Skipping external layout update — editor has unsaved changes')
          return
        }
        const rawLayout = msg.layout as OfficeLayout | null
        const layout = rawLayout && rawLayout.version === 1 ? migrateLayoutColors(rawLayout) : null
        if (layout) {
          os.rebuildFromLayout(layout)
          onLayoutLoaded?.(layout)
        } else {
          // Default layout — snapshot whatever OfficeState built
          onLayoutLoaded?.(os.getLayout())
        }
        // Add buffered agents now that layout (and seats) are correct
        for (const p of pendingAgents) {
          os.addAgent(p.id, p.palette, p.hueShift, p.seatId, true, p.folderName, p.source)
        }
        pendingAgents = []
        layoutReadyRef.current = true
        setLayoutReady(true)
        if (os.characters.size > 0) {
          saveAgentSeats(os)
        }
      } else if (msg.type === 'agentCreated') {
        const id = msg.id as number
        const folderName = msg.folderName as string | undefined
        const source = (msg.source as AgentSource | undefined) ?? 'claude'
        const resumeCommand = typeof msg.resumeCommand === 'string' ? msg.resumeCommand : null
        setAgents((prev) => (prev.includes(id) ? prev : [...prev, id]))
        setSelectedAgent(id)
        setAgentSources((prev) => ({ ...prev, [id]: source }))
        if (resumeCommand) {
          setAgentResumeCommands((prev) => ({ ...prev, [id]: resumeCommand }))
        }
        if (folderName) {
          setAgentFolderNames((prev) => ({ ...prev, [id]: folderName }))
        }
        os.addAgent(id, undefined, undefined, undefined, undefined, folderName, source)
        saveAgentSeats(os)
      } else if (msg.type === 'agentClosed' || msg.type === 'agentLaidOff') {
        const id = msg.id as number
        setAgents((prev) => prev.filter((a) => a !== id))
        setSelectedAgent((prev) => (prev === id ? null : prev))
        setAgentFolderNames((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        setAgentTools((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        setAgentStatuses((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        setSubagentTools((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        setAgentMessages((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        setAgentConversations((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        setAgentWorkingDirs((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        setAgentSources((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        setAgentResumeCommands((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        setAgentTokens((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        // Remove all sub-agent characters belonging to this agent
        os.removeAllSubagents(id)
        setSubagentCharacters((prev) => prev.filter((s) => s.parentAgentId !== id))
        os.removeAgent(id)
      } else if (msg.type === 'existingAgents') {
        const incoming = msg.agents as number[]
        const meta = (msg.agentMeta || {}) as Record<number, { palette?: number; hueShift?: number; seatId?: string }>
        const folderNames = (msg.folderNames || {}) as Record<number, string>
        const incomingSources = (msg.agentSources || {}) as Record<number, AgentSource>
        const incomingResumeCommands = (msg.agentResumeCommands || {}) as Record<number, string>
        setAgentFolderNames((prev) => ({ ...prev, ...folderNames }))
        // Buffer agents — they'll be added in layoutLoaded after seats are built
        for (const id of incoming) {
          const m = meta[id]
          pendingAgents.push({ id, palette: m?.palette, hueShift: m?.hueShift, seatId: m?.seatId, folderName: folderNames[id], source: incomingSources[id] })
        }
        setAgentResumeCommands((prev) => ({ ...prev, ...incomingResumeCommands }))
        setAgentSources((prev) => {
          const next = { ...prev }
          for (const id of incoming) {
            next[id] = incomingSources[id] ?? next[id] ?? 'claude'
          }
          return next
        })
        setAgents((prev) => {
          const ids = new Set(prev)
          const merged = [...prev]
          for (const id of incoming) {
            if (!ids.has(id)) {
              merged.push(id)
            }
          }
          return merged.sort((a, b) => a - b)
        })
      } else if (msg.type === 'agentToolStart') {
        const id = msg.id as number
        const toolId = msg.toolId as string
        const status = msg.status as string
        setAgentTools((prev) => {
          const list = prev[id] || []
          if (list.some((t) => t.toolId === toolId)) return prev
          return { ...prev, [id]: [...list, { toolId, status, done: false }] }
        })
        setAgentMessages((prev) =>
          appendMessage(prev, id, { id: toolId, text: status, timestamp: Date.now(), kind: 'tool', done: false }),
        )
        const toolName = extractToolName(status)
        os.setAgentTool(id, toolName)
        os.setAgentActive(id, true)
        os.clearPermissionBubble(id)
        // Create sub-agent character for Task tool subtasks
        if (status.startsWith('Subtask:')) {
          const label = status.slice('Subtask:'.length).trim()
          const subId = os.addSubagent(id, toolId)
          setSubagentCharacters((prev) => {
            if (prev.some((s) => s.id === subId)) return prev
            return [...prev, { id: subId, parentAgentId: id, parentToolId: toolId, label }]
          })
        }
      } else if (msg.type === 'agentToolDone') {
        const id = msg.id as number
        const toolId = msg.toolId as string
        setAgentTools((prev) => {
          const list = prev[id]
          if (!list) return prev
          return {
            ...prev,
            [id]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)),
          }
        })
        setAgentMessages((prev) => {
          const list = prev[id]
          if (!list) return prev
          return { ...prev, [id]: list.map((m) => (m.id === toolId ? { ...m, done: true } : m)) }
        })
      } else if (msg.type === 'agentToolsClear') {
        const id = msg.id as number
        setAgentTools((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        setSubagentTools((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        setAgentMessages((prev) => {
          const list = prev[id]
          if (!list) return prev
          return { ...prev, [id]: list.map((m) => (!m.done ? { ...m, done: true } : m)) }
        })
        // Remove all sub-agent characters belonging to this agent
        os.removeAllSubagents(id)
        setSubagentCharacters((prev) => prev.filter((s) => s.parentAgentId !== id))
        os.setAgentTool(id, null)
        os.clearPermissionBubble(id)
      } else if (msg.type === 'agentSelected') {
        const id = msg.id as number
        setSelectedAgent(id)
      } else if (msg.type === 'agentStatus') {
        const id = msg.id as number
        const status = msg.status as string
        setAgentStatuses((prev) => {
          if (status === 'active') {
            if (!(id in prev)) return prev
            const next = { ...prev }
            delete next[id]
            return next
          }
          return { ...prev, [id]: status }
        })
        os.setAgentActive(id, status === 'active')
        if (status === 'waiting') {
          os.showWaitingBubble(id)
          playDoneSound()
          setAgentMessages((prev) =>
            appendMessage(prev, id, {
              id: `waiting-${Date.now()}`,
              text: 'Waiting for input...',
              timestamp: Date.now(),
              kind: 'status',
              done: false,
            }),
          )
        }
      } else if (msg.type === 'agentToolPermission') {
        const id = msg.id as number
        setAgentMessages((prev) =>
          appendMessage(prev, id, {
            id: `perm-${Date.now()}`,
            text: 'Needs your approval',
            timestamp: Date.now(),
            kind: 'permission',
            done: false,
          }),
        )
        setAgentTools((prev) => {
          const list = prev[id]
          if (!list) return prev
          return {
            ...prev,
            [id]: list.map((t) => (t.done ? t : { ...t, permissionWait: true })),
          }
        })
        os.showPermissionBubble(id)
      } else if (msg.type === 'subagentToolPermission') {
        const id = msg.id as number
        const parentToolId = msg.parentToolId as string
        // Show permission bubble on the sub-agent character
        const subId = os.getSubagentId(id, parentToolId)
        if (subId !== null) {
          os.showPermissionBubble(subId)
        }
      } else if (msg.type === 'agentToolPermissionClear') {
        const id = msg.id as number
        setAgentTools((prev) => {
          const list = prev[id]
          if (!list) return prev
          const hasPermission = list.some((t) => t.permissionWait)
          if (!hasPermission) return prev
          return {
            ...prev,
            [id]: list.map((t) => (t.permissionWait ? { ...t, permissionWait: false } : t)),
          }
        })
        os.clearPermissionBubble(id)
        // Also clear permission bubbles on all sub-agent characters of this parent
        for (const [subId, meta] of os.subagentMeta) {
          if (meta.parentAgentId === id) {
            os.clearPermissionBubble(subId)
          }
        }
      } else if (msg.type === 'subagentToolStart') {
        const id = msg.id as number
        const parentToolId = msg.parentToolId as string
        const toolId = msg.toolId as string
        const status = msg.status as string
        setSubagentTools((prev) => {
          const agentSubs = prev[id] || {}
          const list = agentSubs[parentToolId] || []
          if (list.some((t) => t.toolId === toolId)) return prev
          return { ...prev, [id]: { ...agentSubs, [parentToolId]: [...list, { toolId, status, done: false }] } }
        })
        // Update sub-agent character's tool and active state
        const subId = os.getSubagentId(id, parentToolId)
        if (subId !== null) {
          const subToolName = extractToolName(status)
          os.setAgentTool(subId, subToolName)
          os.setAgentActive(subId, true)
        }
      } else if (msg.type === 'subagentToolDone') {
        const id = msg.id as number
        const parentToolId = msg.parentToolId as string
        const toolId = msg.toolId as string
        setSubagentTools((prev) => {
          const agentSubs = prev[id]
          if (!agentSubs) return prev
          const list = agentSubs[parentToolId]
          if (!list) return prev
          return {
            ...prev,
            [id]: { ...agentSubs, [parentToolId]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)) },
          }
        })
      } else if (msg.type === 'subagentClear') {
        const id = msg.id as number
        const parentToolId = msg.parentToolId as string
        setSubagentTools((prev) => {
          const agentSubs = prev[id]
          if (!agentSubs || !(parentToolId in agentSubs)) return prev
          const next = { ...agentSubs }
          delete next[parentToolId]
          if (Object.keys(next).length === 0) {
            const outer = { ...prev }
            delete outer[id]
            return outer
          }
          return { ...prev, [id]: next }
        })
        // Remove sub-agent character
        os.removeSubagent(id, parentToolId)
        setSubagentCharacters((prev) => prev.filter((s) => !(s.parentAgentId === id && s.parentToolId === parentToolId)))
      } else if (msg.type === 'characterSpritesLoaded') {
        const characters = msg.characters as Array<{ down: string[][][]; up: string[][][]; right: string[][][] }>
        console.log(`[Webview] Received ${characters.length} pre-colored character sprites`)
        setCharacterTemplates(characters)
      } else if (msg.type === 'floorTilesLoaded') {
        const sprites = msg.sprites as string[][][]
        console.log(`[Webview] Received ${sprites.length} floor tile patterns`)
        setFloorSprites(sprites)
      } else if (msg.type === 'wallTilesLoaded') {
        const sprites = msg.sprites as string[][][]
        console.log(`[Webview] Received ${sprites.length} wall tile sprites`)
        setWallSprites(sprites)
      } else if (msg.type === 'workspaceFolders') {
        const folders = msg.folders as WorkspaceFolder[]
        setWorkspaceFolders(folders)
      } else if (msg.type === 'settingsLoaded') {
        const soundOn = msg.soundEnabled as boolean
        setSoundEnabled(soundOn)
      } else if (msg.type === 'furnitureAssetsLoaded') {
        try {
          const catalog = msg.catalog as FurnitureAsset[]
          const sprites = msg.sprites as Record<string, string[][]>
          console.log(`📦 Webview: Loaded ${catalog.length} furniture assets`)
          // Build dynamic catalog immediately so getCatalogEntry() works when layoutLoaded arrives next
          buildDynamicCatalog({ catalog, sprites })
          setLoadedAssets({ catalog, sprites })
        } catch (err) {
          console.error(`❌ Webview: Error processing furnitureAssetsLoaded:`, err)
        }
      } else if (msg.type === 'agentNamesLoaded') {
        const names = msg.names as Record<number, string>
        setAgentNames(names)
      } else if (msg.type === 'agentWorkingDir') {
        const id = msg.id as number
        const dir = msg.dir as string
        setAgentWorkingDirs((prev) => ({ ...prev, [id]: dir }))
      } else if (msg.type === 'agentConversationHistory') {
        const id = msg.id as number
        const entries = Array.isArray(msg.entries) ? msg.entries as AgentConversationEntry[] : []
        setAgentConversations((prev) => ({ ...prev, [id]: entries.slice(-MAX_CONVERSATION_ENTRIES) }))
      } else if (msg.type === 'agentTokenUsage') {
        const id = msg.id as number
        setAgentTokens((prev) => ({
          ...prev,
          [id]: {
            input: msg.totalInput as number,
            output: msg.totalOutput as number,
          },
        }))
      }
    }
    window.addEventListener('message', handler)
    vscode.postMessage({ type: 'webviewReady' })
    return () => window.removeEventListener('message', handler)
  }, [getOfficeState])

  return { agents, selectedAgent, agentTools, agentStatuses, subagentTools, subagentCharacters, layoutReady, loadedAssets, workspaceFolders, agentMessages, agentConversations, agentNames, agentSources, agentResumeCommands, updateAgentName, agentWorkingDirs, agentTokens, agentFolderNames, sendAgentMessage, handlePermissionAction }
}
