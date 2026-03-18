import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { WorkspaceFolder, AgentSource } from '../hooks/useExtensionMessages.js'
import { vscode } from '../vscodeApi.js'

interface LaunchAgentModalProps {
  isOpen: boolean
  onClose: () => void
  workspaceFolders: WorkspaceFolder[]
}

const PROVIDERS: Array<{ id: AgentSource; name: string }> = [
  { id: 'claude', name: 'Claude' },
  { id: 'codex', name: 'Codex' },
  { id: 'gemini', name: 'Gemini' },
  { id: 'opencode', name: 'OpenCode' },
]

const RETRO_BTN: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: '20px',
  background: '#0d1f0d',
  color: '#aaffaa',
  border: '2px solid #3a7a3a',
  borderRadius: 0,
  cursor: 'pointer',
  letterSpacing: 2,
  fontFamily: 'inherit',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#060c06',
  border: '1px solid #2a5a2a',
  outline: 'none',
  color: '#ccffcc',
  fontSize: '18px',
  fontFamily: 'inherit',
  padding: '6px 10px',
  boxSizing: 'border-box',
}

export function LaunchAgentModal({ isOpen, onClose, workspaceFolders }: LaunchAgentModalProps) {
  const [provider, setProvider] = useState<AgentSource>('claude')
  const [folderPath, setFolderPath] = useState('')
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    if (workspaceFolders.length > 0) {
      setFolderPath((current) => current || workspaceFolders[0].path)
    }
  }, [isOpen, workspaceFolders])

  if (!isOpen) return null

  const handleLaunch = () => {
    if (!folderPath.trim()) return
    vscode.postMessage({ type: 'launchAgent', provider, folderPath: folderPath.trim() })
    onClose()
  }

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.72)',
          zIndex: 10000,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10001,
          background: '#050b05',
          border: '3px solid #1a2e1a',
          boxShadow: '0 0 20px rgba(0,0,0,0.8)',
          padding: '20px',
          width: 'min(450px, calc(100vw - 24px))',
          color: '#99cc99',
          fontFamily: "'FS Pixel Sans', monospace",
        }}
      >
        <div style={{ fontSize: '24px', color: '#ccffcc', marginBottom: '20px', textAlign: 'center', letterSpacing: 2 }}>
          LAUNCH NEW AGENT
        </div>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '16px', color: '#2a5a2a', marginBottom: '8px' }}>SELECT PROVIDER:</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {PROVIDERS.map((item) => (
              <button
                key={item.id}
                onClick={() => setProvider(item.id)}
                style={{
                  ...RETRO_BTN,
                  flex: 1,
                  fontSize: '16px',
                  background: provider === item.id ? '#2a5a2a' : '#0d1f0d',
                  color: provider === item.id ? '#050b05' : '#aaffaa',
                }}
              >
                {item.name.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '16px', color: '#2a5a2a', marginBottom: '8px' }}>PROJECT FOLDER PATH:</div>
          <input
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            style={inputStyle}
            placeholder="/path/to/project"
            spellCheck={false}
          />
          {workspaceFolders.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '14px', color: '#224422', marginBottom: '4px' }}>KNOWN FOLDERS:</div>
              <div style={{ maxHeight: '100px', overflowY: 'auto', border: '1px solid #1a2e1a', padding: '4px' }}>
                {workspaceFolders.map((folder) => (
                  <div
                    key={folder.path}
                    onClick={() => setFolderPath(folder.path)}
                    onMouseEnter={() => setHovered(folder.path)}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      padding: '4px 8px',
                      fontSize: '14px',
                      cursor: 'pointer',
                      background: hovered === folder.path ? '#0d180d' : 'transparent',
                      color: folderPath === folder.path ? '#ccffcc' : '#668866',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={folder.path}
                  >
                    {folder.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onClose}
            style={{ ...RETRO_BTN, flex: 1, borderColor: '#5a2a2a', color: '#cc6666' }}
          >
            CANCEL
          </button>
          <button
            onClick={handleLaunch}
            disabled={!folderPath.trim()}
            style={{
              ...RETRO_BTN,
              flex: 2,
              opacity: folderPath.trim() ? 1 : 0.5,
              cursor: folderPath.trim() ? 'pointer' : 'default',
            }}
          >
            FIRE!
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}
