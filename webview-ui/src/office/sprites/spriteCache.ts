import type { SpriteData, SpriteSource, PngSpriteRef } from '../types.js'

export function isPngRef(sprite: SpriteSource): sprite is PngSpriteRef {
  return (sprite as PngSpriteRef)._png === true
}

const zoomCaches = new Map<number, WeakMap<SpriteData, HTMLCanvasElement>>()
// Separate cache for PNG sprites (keyed by HTMLImageElement)
const pngZoomCaches = new Map<number, Map<HTMLImageElement, HTMLCanvasElement>>()

// ── Outline sprite generation ─────────────────────────────────

const outlineCache = new WeakMap<SpriteData, SpriteData>()

/** Generate a 1px white outline SpriteData (2px larger in each dimension) */
export function getOutlineSprite(sprite: SpriteData): SpriteData {
  const cached = outlineCache.get(sprite)
  if (cached) return cached

  const rows = sprite.length
  const cols = sprite[0].length
  // Expanded grid: +2 in each dimension for 1px border
  const outline: string[][] = []
  for (let r = 0; r < rows + 2; r++) {
    outline.push(new Array<string>(cols + 2).fill(''))
  }

  // For each opaque pixel, mark its 4 cardinal neighbors as white
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (sprite[r][c] === '') continue
      const er = r + 1
      const ec = c + 1
      if (outline[er - 1][ec] === '') outline[er - 1][ec] = '#FFFFFF'
      if (outline[er + 1][ec] === '') outline[er + 1][ec] = '#FFFFFF'
      if (outline[er][ec - 1] === '') outline[er][ec - 1] = '#FFFFFF'
      if (outline[er][ec + 1] === '') outline[er][ec + 1] = '#FFFFFF'
    }
  }

  // Clear pixels that overlap with original opaque pixels
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (sprite[r][c] !== '') {
        outline[r + 1][c + 1] = ''
      }
    }
  }

  outlineCache.set(sprite, outline)
  return outline
}

export function getCachedSprite(sprite: SpriteSource, zoom: number): HTMLCanvasElement {
  if (isPngRef(sprite)) return getCachedPngSprite(sprite, zoom)
  return getCachedSpriteData(sprite, zoom)
}

function getCachedPngSprite(ref: PngSpriteRef, zoom: number): HTMLCanvasElement {
  let cache = pngZoomCaches.get(zoom)
  if (!cache) {
    cache = new Map()
    pngZoomCaches.set(zoom, cache)
  }
  const cached = cache.get(ref.img)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = ref.w * zoom
  canvas.height = ref.h * zoom
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(ref.img, ref.sx ?? 0, ref.sy ?? 0, ref.w, ref.h, 0, 0, ref.w * zoom, ref.h * zoom)
  cache.set(ref.img, canvas)
  return canvas
}

function getCachedSpriteData(sprite: SpriteData, zoom: number): HTMLCanvasElement {
  let cache = zoomCaches.get(zoom)
  if (!cache) {
    cache = new WeakMap()
    zoomCaches.set(zoom, cache)
  }

  const cached = cache.get(sprite)
  if (cached) return cached

  const rows = sprite.length
  const cols = sprite[0].length
  const canvas = document.createElement('canvas')
  canvas.width = cols * zoom
  canvas.height = rows * zoom
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const color = sprite[r][c]
      if (color === '') continue
      ctx.fillStyle = color
      ctx.fillRect(c * zoom, r * zoom, zoom, zoom)
    }
  }

  cache.set(sprite, canvas)
  return canvas
}
