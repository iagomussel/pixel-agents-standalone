import { useState, useEffect, useRef, useCallback } from 'react'
import { EditTool } from '../types.js'
import type { TileType as TileTypeVal, FloorColor, PngSpriteRef } from '../types.js'
import { getCatalogByCategory, buildDynamicCatalog, getActiveCategories, addPngToCatalog } from '../layout/furnitureCatalog.js'
import type { FurnitureCategory, LoadedAssetData } from '../layout/furnitureCatalog.js'
import { getCachedSprite } from '../sprites/spriteCache.js'
import { getColorizedFloorSprite, getFloorPatternCount, hasFloorSprites } from '../floorTiles.js'

const btnStyle: React.CSSProperties = {
  padding: '3px 8px',
  fontSize: '22px',
  background: 'rgba(255, 255, 255, 0.08)',
  color: 'rgba(255, 255, 255, 0.7)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
}

const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'rgba(90, 140, 255, 0.25)',
  color: 'rgba(255, 255, 255, 0.9)',
  border: '2px solid #5a8cff',
}

const tabStyle: React.CSSProperties = {
  padding: '2px 6px',
  fontSize: '20px',
  background: 'transparent',
  color: 'rgba(255, 255, 255, 0.5)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
}

const activeTabStyle: React.CSSProperties = {
  ...tabStyle,
  background: 'rgba(255, 255, 255, 0.08)',
  color: 'rgba(255, 255, 255, 0.8)',
  border: '2px solid #5a8cff',
}

interface EditorToolbarProps {
  activeTool: EditTool
  selectedTileType: TileTypeVal
  selectedFurnitureType: string
  selectedFurnitureUid: string | null
  selectedFurnitureColor: FloorColor | null
  floorColor: FloorColor
  wallColor: FloorColor
  onToolChange: (tool: EditTool) => void
  onTileTypeChange: (type: TileTypeVal) => void
  onFloorColorChange: (color: FloorColor) => void
  onWallColorChange: (color: FloorColor) => void
  onSelectedFurnitureColorChange: (color: FloorColor | null) => void
  onFurnitureTypeChange: (type: string) => void
  loadedAssets?: LoadedAssetData
}

/** Render a floor pattern preview at 2x (32x32 canvas showing the 16x16 tile) */
function FloorPatternPreview({ patternIndex, color, selected, onClick }: {
  patternIndex: number
  color: FloorColor
  selected: boolean
  onClick: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const displaySize = 32
  const tileZoom = 2

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = displaySize
    canvas.height = displaySize
    ctx.imageSmoothingEnabled = false

    if (!hasFloorSprites()) {
      ctx.fillStyle = '#444'
      ctx.fillRect(0, 0, displaySize, displaySize)
      return
    }

    const sprite = getColorizedFloorSprite(patternIndex, color)
    const cached = getCachedSprite(sprite, tileZoom)
    ctx.drawImage(cached, 0, 0)
  }, [patternIndex, color])

  return (
    <button
      onClick={onClick}
      title={`Floor ${patternIndex}`}
      style={{
        width: displaySize,
        height: displaySize,
        padding: 0,
        border: selected ? '2px solid #5a8cff' : '2px solid #4a4a6a',
        borderRadius: 0,
        cursor: 'pointer',
        overflow: 'hidden',
        flexShrink: 0,
        background: '#2A2A3A',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: displaySize, height: displaySize, display: 'block' }}
      />
    </button>
  )
}

/** Slider control for a single color parameter */
function ColorSlider({ label, value, min, max, onChange }: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: '20px', color: '#999', width: 28, textAlign: 'right', flexShrink: 0 }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, height: 12, accentColor: 'rgba(90, 140, 255, 0.8)' }}
      />
      <span style={{ fontSize: '20px', color: '#999', width: 48, textAlign: 'right', flexShrink: 0 }}>{value}</span>
    </div>
  )
}

const DEFAULT_FURNITURE_COLOR: FloorColor = { h: 0, s: 0, b: 0, c: 0 }

export function EditorToolbar({
  activeTool,
  selectedTileType,
  selectedFurnitureType,
  selectedFurnitureUid,
  selectedFurnitureColor,
  floorColor,
  wallColor,
  onToolChange,
  onTileTypeChange,
  onFloorColorChange,
  onWallColorChange,
  onSelectedFurnitureColorChange,
  onFurnitureTypeChange,
  loadedAssets,
}: EditorToolbarProps) {
  const [activeCategory, setActiveCategory] = useState<FurnitureCategory>('desks')
  const [showColor, setShowColor] = useState(false)
  const [showWallColor, setShowWallColor] = useState(false)
  const [showFurnitureColor, setShowFurnitureColor] = useState(false)

  // PNG import state
  const [importedCount, setImportedCount] = useState(0)
  const [pendingPng, setPendingPng] = useState<{ img: HTMLImageElement; filename: string } | null>(null)
  const [importMeta, setImportMeta] = useState({ label: '', category: 'decor' as FurnitureCategory, footprintW: 1, footprintH: 1, isDesk: false })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      const img = new Image()
      img.onload = () => {
        const name = file.name.replace(/\.[^.]+$/, '')
        setPendingPng({ img, filename: name })
        setImportMeta({
          label: name,
          category: 'decor',
          footprintW: Math.max(1, Math.ceil(img.width / 16)),
          footprintH: Math.max(1, Math.ceil(img.height / 16)),
          isDesk: false,
        })
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }, [])

  const handleConfirmImport = useCallback(() => {
    if (!pendingPng) return
    const id = `png-${pendingPng.filename}-${Date.now()}`
    const pngRef: PngSpriteRef = { _png: true, img: pendingPng.img, w: pendingPng.img.width, h: pendingPng.img.height }
    addPngToCatalog(id, importMeta.label || pendingPng.filename, importMeta.category, importMeta.footprintW, importMeta.footprintH, importMeta.isDesk, pngRef)
    setActiveCategory(importMeta.category)
    setImportedCount((n) => n + 1)
    setPendingPng(null)
  }, [pendingPng, importMeta])

  // AI generation state
  const [showGenerate, setShowGenerate] = useState(false)
  const [generatePrompt, setGeneratePrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const handleGenerate = useCallback(async () => {
    if (!generatePrompt.trim() || isGenerating) return
    setIsGenerating(true)
    setGenerateError(null)
    try {
      const res = await fetch('/api/generate-sprite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: generatePrompt.trim() }),
      })
      const data = await res.json() as { imageBase64?: string; mimeType?: string; error?: string }
      if (!res.ok || !data.imageBase64) throw new Error(data.error ?? 'No image returned')
      const dataUrl = `data:${data.mimeType ?? 'image/png'};base64,${data.imageBase64}`
      const img = new Image()
      img.onload = () => {
        const name = generatePrompt.trim().slice(0, 30).replace(/\s+/g, '-')
        setPendingPng({ img, filename: name })
        setImportMeta({
          label: name,
          category: 'decor',
          footprintW: Math.max(1, Math.ceil(img.width / 16)),
          footprintH: Math.max(1, Math.ceil(img.height / 16)),
          isDesk: false,
        })
        setShowGenerate(false)
        setGeneratePrompt('')
      }
      img.src = dataUrl
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }, [generatePrompt, isGenerating])

  // Build dynamic catalog from loaded assets
  useEffect(() => {
    if (loadedAssets) {
      try {
        console.log(`[EditorToolbar] Building dynamic catalog with ${loadedAssets.catalog.length} assets...`)
        const success = buildDynamicCatalog(loadedAssets)
        console.log(`[EditorToolbar] Catalog build result: ${success}`)

        // Reset to first available category if current doesn't exist
        const activeCategories = getActiveCategories()
        if (activeCategories.length > 0) {
          const firstCat = activeCategories[0]?.id
          if (firstCat) {
            console.log(`[EditorToolbar] Setting active category to: ${firstCat}`)
            setActiveCategory(firstCat)
          }
        }
      } catch (err) {
        console.error(`[EditorToolbar] Error building dynamic catalog:`, err)
      }
    }
  }, [loadedAssets])

  const handleColorChange = useCallback((key: keyof FloorColor, value: number) => {
    onFloorColorChange({ ...floorColor, [key]: value })
  }, [floorColor, onFloorColorChange])

  const handleWallColorChange = useCallback((key: keyof FloorColor, value: number) => {
    onWallColorChange({ ...wallColor, [key]: value })
  }, [wallColor, onWallColorChange])

  // For selected furniture: use existing color or default
  const effectiveColor = selectedFurnitureColor ?? DEFAULT_FURNITURE_COLOR
  const handleSelFurnColorChange = useCallback((key: keyof FloorColor, value: number) => {
    onSelectedFurnitureColorChange({ ...effectiveColor, [key]: value })
  }, [effectiveColor, onSelectedFurnitureColorChange])

  void importedCount  // triggers re-render after PNG import
  const categoryItems = getCatalogByCategory(activeCategory)

  const patternCount = getFloorPatternCount()
  // Wall is TileType 0, floor patterns are 1..patternCount
  const floorPatterns = Array.from({ length: patternCount }, (_, i) => i + 1)

  const thumbSize = 36 // 2x for items

  const isFloorActive = activeTool === EditTool.TILE_PAINT || activeTool === EditTool.EYEDROPPER
  const isWallActive = activeTool === EditTool.WALL_PAINT
  const isEraseActive = activeTool === EditTool.ERASE
  const isFurnitureActive = activeTool === EditTool.FURNITURE_PLACE || activeTool === EditTool.FURNITURE_PICK

  return (
    <>
    {/* Hidden file input for PNG import */}
    <input
      ref={fileInputRef}
      type="file"
      accept="image/png,image/gif,image/webp"
      style={{ display: 'none' }}
      onChange={handleFileSelect}
    />

    {/* AI Generate panel */}
    {showGenerate && (
      <div style={{
        position: 'absolute',
        bottom: 68,
        left: 10,
        zIndex: 60,
        background: '#1e1e2e',
        border: '2px solid #7a5cff',
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        boxShadow: '2px 2px 0px #0a0a14',
        minWidth: 260,
      }}>
        <span style={{ fontSize: '20px', color: '#ccc' }}>✨ Generate sprite with AI</span>
        <textarea
          value={generatePrompt}
          onChange={(e) => setGeneratePrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleGenerate() } }}
          placeholder="e.g. plant pot, coffee machine, bookshelf..."
          rows={2}
          style={{ background: '#181828', color: '#eee', border: '1px solid #4a4a6a', fontSize: '18px', padding: '4px 6px', resize: 'none', fontFamily: 'inherit' }}
        />
        {generateError && <span style={{ fontSize: '18px', color: '#ff6b6b' }}>{generateError}</span>}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            style={{ ...btnStyle, flex: 1, background: isGenerating ? 'rgba(122,92,255,0.15)' : 'rgba(122,92,255,0.3)', border: '2px solid #7a5cff', opacity: isGenerating ? 0.7 : 1 }}
            onClick={() => void handleGenerate()}
            disabled={isGenerating || !generatePrompt.trim()}
          >
            {isGenerating ? 'Generating…' : 'Generate'}
          </button>
          <button style={{ ...btnStyle, flex: 1 }} onClick={() => { setShowGenerate(false); setGenerateError(null) }}>
            Cancel
          </button>
        </div>
      </div>
    )}

    {/* PNG import config dialog */}
    {pendingPng && (
      <div style={{
        position: 'absolute',
        bottom: 68,
        left: 10,
        zIndex: 60,
        background: '#1e1e2e',
        border: '2px solid #5a8cff',
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        boxShadow: '2px 2px 0px #0a0a14',
        minWidth: 220,
      }}>
        <span style={{ fontSize: '20px', color: '#ccc' }}>Import: <b style={{ color: '#fff' }}>{pendingPng.filename}</b></span>
        <span style={{ fontSize: '18px', color: '#888' }}>{pendingPng.img.width}×{pendingPng.img.height}px</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '18px', color: '#999', width: 60 }}>Label</span>
          <input value={importMeta.label} onChange={(e) => setImportMeta((m) => ({ ...m, label: e.target.value }))}
            style={{ flex: 1, background: '#181828', color: '#eee', border: '1px solid #4a4a6a', fontSize: '18px', padding: '2px 4px' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '18px', color: '#999', width: 60 }}>Category</span>
          <select value={importMeta.category} onChange={(e) => setImportMeta((m) => ({ ...m, category: e.target.value as FurnitureCategory }))}
            style={{ flex: 1, background: '#181828', color: '#eee', border: '1px solid #4a4a6a', fontSize: '18px' }}>
            <option value="decor">Decor</option>
            <option value="desks">Desks</option>
            <option value="chairs">Chairs</option>
            <option value="storage">Storage</option>
            <option value="electronics">Tech</option>
            <option value="wall">Wall</option>
            <option value="misc">Misc</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '18px', color: '#999', width: 60 }}>Tiles W</span>
          <input type="number" min={1} max={8} value={importMeta.footprintW} onChange={(e) => setImportMeta((m) => ({ ...m, footprintW: Math.max(1, Number(e.target.value)) }))}
            style={{ width: 48, background: '#181828', color: '#eee', border: '1px solid #4a4a6a', fontSize: '18px', padding: '2px 4px' }} />
          <span style={{ fontSize: '18px', color: '#999', width: 60 }}>Tiles H</span>
          <input type="number" min={1} max={8} value={importMeta.footprintH} onChange={(e) => setImportMeta((m) => ({ ...m, footprintH: Math.max(1, Number(e.target.value)) }))}
            style={{ width: 48, background: '#181828', color: '#eee', border: '1px solid #4a4a6a', fontSize: '18px', padding: '2px 4px' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '18px', color: '#999', cursor: 'pointer' }}>
            <input type="checkbox" checked={importMeta.isDesk} onChange={(e) => setImportMeta((m) => ({ ...m, isDesk: e.target.checked }))} />
            Is desk (can place items on top)
          </label>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={{ ...btnStyle, flex: 1, background: 'rgba(90,140,255,0.3)', border: '2px solid #5a8cff' }} onClick={handleConfirmImport}>
            Add
          </button>
          <button style={{ ...btnStyle, flex: 1 }} onClick={() => setPendingPng(null)}>
            Cancel
          </button>
        </div>
      </div>
    )}

    <div
      style={{
        position: 'absolute',
        bottom: 68,
        left: 10,
        zIndex: 50,
        background: '#1e1e2e',
        border: '2px solid #4a4a6a',
        borderRadius: 0,
        padding: '6px 8px',
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 6,
        boxShadow: '2px 2px 0px #0a0a14',
        maxWidth: 'calc(100vw - 20px)',
      }}
    >
      {/* Tool row — at the bottom */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button
          style={isFloorActive ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.TILE_PAINT)}
          title="Paint floor tiles"
        >
          Floor
        </button>
        <button
          style={isWallActive ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.WALL_PAINT)}
          title="Paint walls (click to toggle)"
        >
          Wall
        </button>
        <button
          style={isEraseActive ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.ERASE)}
          title="Erase tiles to void"
        >
          Erase
        </button>
        <button
          style={isFurnitureActive ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.FURNITURE_PLACE)}
          title="Place furniture"
        >
          Furniture
        </button>
      </div>

      {/* Sub-panel: Floor tiles — stacked bottom-to-top via column-reverse */}
      {isFloorActive && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 6 }}>
          {/* Color toggle + Pick — just above tool row */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              style={showColor ? activeBtnStyle : btnStyle}
              onClick={() => setShowColor((v) => !v)}
              title="Adjust floor color"
            >
              Color
            </button>
            <button
              style={activeTool === EditTool.EYEDROPPER ? activeBtnStyle : btnStyle}
              onClick={() => onToolChange(EditTool.EYEDROPPER)}
              title="Pick floor pattern + color from existing tile"
            >
              Pick
            </button>
          </div>

          {/* Color controls (collapsible) — above Wall/Color/Pick */}
          {showColor && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              padding: '4px 6px',
              background: '#181828',
              border: '2px solid #4a4a6a',
              borderRadius: 0,
            }}>
              <ColorSlider label="H" value={floorColor.h} min={0} max={360} onChange={(v) => handleColorChange('h', v)} />
              <ColorSlider label="S" value={floorColor.s} min={0} max={100} onChange={(v) => handleColorChange('s', v)} />
              <ColorSlider label="B" value={floorColor.b} min={-100} max={100} onChange={(v) => handleColorChange('b', v)} />
              <ColorSlider label="C" value={floorColor.c} min={-100} max={100} onChange={(v) => handleColorChange('c', v)} />
            </div>
          )}

          {/* Floor pattern horizontal carousel — at the top */}
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 2 }}>
            {floorPatterns.map((patIdx) => (
              <FloorPatternPreview
                key={patIdx}
                patternIndex={patIdx}
                color={floorColor}
                selected={selectedTileType === patIdx}
                onClick={() => onTileTypeChange(patIdx as TileTypeVal)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Sub-panel: Wall — stacked bottom-to-top via column-reverse */}
      {isWallActive && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 6 }}>
          {/* Color toggle — just above tool row */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              style={showWallColor ? activeBtnStyle : btnStyle}
              onClick={() => setShowWallColor((v) => !v)}
              title="Adjust wall color"
            >
              Color
            </button>
          </div>

          {/* Color controls (collapsible) */}
          {showWallColor && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              padding: '4px 6px',
              background: '#181828',
              border: '2px solid #4a4a6a',
              borderRadius: 0,
            }}>
              <ColorSlider label="H" value={wallColor.h} min={0} max={360} onChange={(v) => handleWallColorChange('h', v)} />
              <ColorSlider label="S" value={wallColor.s} min={0} max={100} onChange={(v) => handleWallColorChange('s', v)} />
              <ColorSlider label="B" value={wallColor.b} min={-100} max={100} onChange={(v) => handleWallColorChange('b', v)} />
              <ColorSlider label="C" value={wallColor.c} min={-100} max={100} onChange={(v) => handleWallColorChange('c', v)} />
            </div>
          )}

        </div>
      )}

      {/* Sub-panel: Furniture — stacked bottom-to-top via column-reverse */}
      {isFurnitureActive && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 4 }}>
          {/* Category tabs + Pick — just above tool row */}
          <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            {getActiveCategories().map((cat) => (
              <button
                key={cat.id}
                style={activeCategory === cat.id ? activeTabStyle : tabStyle}
                onClick={() => setActiveCategory(cat.id)}
              >
                {cat.label}
              </button>
            ))}
            <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.15)', margin: '0 2px', flexShrink: 0 }} />
            <button
              style={activeTool === EditTool.FURNITURE_PICK ? activeBtnStyle : btnStyle}
              onClick={() => onToolChange(EditTool.FURNITURE_PICK)}
              title="Pick furniture type from placed item"
            >
              Pick
            </button>
            <button
              style={btnStyle}
              onClick={() => fileInputRef.current?.click()}
              title="Import PNG sprite as furniture"
            >
              Import
            </button>
            <button
              style={showGenerate ? { ...btnStyle, background: 'rgba(122,92,255,0.25)', border: '2px solid #7a5cff', color: '#fff' } : btnStyle}
              onClick={() => { setShowGenerate((v) => !v); setGenerateError(null) }}
              title="Generate sprite with Gemini AI"
            >
              ✨ AI
            </button>
          </div>
          {/* Furniture items — single-row horizontal carousel at 2x */}
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 2 }}>
            {categoryItems.map((entry) => {
              const cached = getCachedSprite(entry.sprite, 2)
              const isSelected = selectedFurnitureType === entry.type
              return (
                <button
                  key={entry.type}
                  onClick={() => onFurnitureTypeChange(entry.type)}
                  title={entry.label}
                  style={{
                    width: thumbSize,
                    height: thumbSize,
                    background: '#2A2A3A',
                    border: isSelected ? '2px solid #5a8cff' : '2px solid #4a4a6a',
                    borderRadius: 0,
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  <canvas
                    ref={(el) => {
                      if (!el) return
                      const ctx = el.getContext('2d')
                      if (!ctx) return
                      const scale = Math.min(thumbSize / cached.width, thumbSize / cached.height) * 0.85
                      el.width = thumbSize
                      el.height = thumbSize
                      ctx.imageSmoothingEnabled = false
                      ctx.clearRect(0, 0, thumbSize, thumbSize)
                      const dw = cached.width * scale
                      const dh = cached.height * scale
                      ctx.drawImage(cached, (thumbSize - dw) / 2, (thumbSize - dh) / 2, dw, dh)
                    }}
                    style={{ width: thumbSize, height: thumbSize }}
                  />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Selected furniture color panel — shows when any placed furniture item is selected */}
      {selectedFurnitureUid && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 3 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              style={showFurnitureColor ? activeBtnStyle : btnStyle}
              onClick={() => setShowFurnitureColor((v) => !v)}
              title="Adjust selected furniture color"
            >
              Color
            </button>
            {selectedFurnitureColor && (
              <button
                style={{ ...btnStyle, fontSize: '20px', padding: '2px 6px' }}
                onClick={() => onSelectedFurnitureColorChange(null)}
                title="Remove color (restore original)"
              >
                Clear
              </button>
            )}
          </div>
          {showFurnitureColor && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              padding: '4px 6px',
              background: '#181828',
              border: '2px solid #4a4a6a',
              borderRadius: 0,
            }}>
              {effectiveColor.colorize ? (
                <>
                  <ColorSlider label="H" value={effectiveColor.h} min={0} max={360} onChange={(v) => handleSelFurnColorChange('h', v)} />
                  <ColorSlider label="S" value={effectiveColor.s} min={0} max={100} onChange={(v) => handleSelFurnColorChange('s', v)} />
                </>
              ) : (
                <>
                  <ColorSlider label="H" value={effectiveColor.h} min={-180} max={180} onChange={(v) => handleSelFurnColorChange('h', v)} />
                  <ColorSlider label="S" value={effectiveColor.s} min={-100} max={100} onChange={(v) => handleSelFurnColorChange('s', v)} />
                </>
              )}
              <ColorSlider label="B" value={effectiveColor.b} min={-100} max={100} onChange={(v) => handleSelFurnColorChange('b', v)} />
              <ColorSlider label="C" value={effectiveColor.c} min={-100} max={100} onChange={(v) => handleSelFurnColorChange('c', v)} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '20px', color: '#999', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!effectiveColor.colorize}
                  onChange={(e) => onSelectedFurnitureColorChange({ ...effectiveColor, colorize: e.target.checked || undefined })}
                  style={{ accentColor: 'rgba(90, 140, 255, 0.8)' }}
                />
                Colorize
              </label>
            </div>
          )}
        </div>
      )}
    </div>
    </>
  )
}
