import { TILE_SIZE } from '../types.js'
import {
  EXTERIOR_PAD_LEFT_TILES,
  EXTERIOR_PAD_TOP_TILES,
  EXTERIOR_PAD_RIGHT_TILES,
  EXTERIOR_PAD_BOTTOM_TILES,
} from '../../constants.js'

interface RectSpec {
  col: number
  row: number
  w: number
  h: number
}

interface PointSpec {
  x: number
  y: number
}

export interface ExteriorMetrics {
  worldCols: number
  worldRows: number
  worldWidthPx: number
  worldHeightPx: number
  padLeftPx: number
  padTopPx: number
}

const SIDEWALK_TILES = 2
const ROAD_WIDTH_TILES = 5

const GRASS_BASE = '#6f9e4d'
const GRASS_SHADE = '#5f8942'
const GRASS_HIGHLIGHT = '#84b55b'
const SIDEWALK_BASE = '#8b8f92'
const SIDEWALK_SHADE = '#73787b'
const PLAZA_BASE = '#9fa79f'
const PLAZA_SHADE = '#838a84'
const ROAD_BASE = '#34373c'
const ROAD_SHADE = '#272a2f'
const CURB_COLOR = '#b9b9b6'
const LANE_COLOR = '#f0ddb0'
const CROSSWALK_COLOR = '#e8e1d2'
const TREE_TRUNK = '#6e4b32'
const TREE_CANOPY = '#4b7c35'
const TREE_CANOPY_LIGHT = '#629b46'
const TREE_SHADOW = 'rgba(28, 44, 22, 0.28)'
const HYDRANT_RED = '#d94d43'
const HYDRANT_DARK = '#962d29'
const METAL_LIGHT = '#8f989f'
const METAL_DARK = '#596066'
const BENCH_WOOD = '#8a5d39'
const BENCH_METAL = '#4b5158'
const FOUNTAIN_WATER = '#68b7d8'
const FOUNTAIN_EDGE = '#d4d6d8'

const STREET_LIGHT_POLE = '#555555'
const STREET_LIGHT_GLOW = 'rgba(255, 255, 204, 0.4)'
const TRASH_CAN_BASE = '#333333'
const TRASH_CAN_LID = '#444444'
const FLOWER_RED = '#cc3333'
const FLOWER_YELLOW = '#cccc33'
const FLOWER_PURPLE = '#9933cc'
const FLOWER_WHITE = '#ffffff'
const ROCK_BASE = '#888888'
const ROCK_SHADE = '#666666'
const PUDDLE_COLOR = 'rgba(104, 183, 216, 0.4)'
const CRACK_COLOR = 'rgba(0, 0, 0, 0.1)'
const CAR_RED = '#cc0000'
const CAR_BLUE = '#0066cc'
const CAR_GREEN = '#339933'
const CAR_YELLOW = '#d4a318'
const CAR_GLASS = '#bbddff'

// Asset paths (local - use absolute from web root)
const TREES_PATH = '/assets/exterior/Trees.png'
const CARS_PATH = '/assets/exterior/cars.png'

const assets = {
  trees: new Image(),
  cars: new Image(),
}
assets.trees.src = TREES_PATH
assets.cars.src = CARS_PATH

function deterministicUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

export function getExteriorMetrics(cols: number, rows: number, zoom: number): ExteriorMetrics {
  const worldCols = cols + EXTERIOR_PAD_LEFT_TILES + EXTERIOR_PAD_RIGHT_TILES
  const worldRows = rows + EXTERIOR_PAD_TOP_TILES + EXTERIOR_PAD_BOTTOM_TILES
  const padLeftPx = EXTERIOR_PAD_LEFT_TILES * TILE_SIZE * zoom
  const padTopPx = EXTERIOR_PAD_TOP_TILES * TILE_SIZE * zoom

  return {
    worldCols,
    worldRows,
    worldWidthPx: worldCols * TILE_SIZE * zoom,
    worldHeightPx: worldRows * TILE_SIZE * zoom,
    padLeftPx,
    padTopPx,
  }
}

function fillRectTiles(
  ctx: CanvasRenderingContext2D,
  worldOriginX: number,
  worldOriginY: number,
  zoom: number,
  rect: RectSpec,
  color: string,
): void {
  const s = TILE_SIZE * zoom
  ctx.fillStyle = color
  ctx.fillRect(
    worldOriginX + rect.col * s,
    worldOriginY + rect.row * s,
    rect.w * s,
    rect.h * s,
  )
}

function drawGrassTexture(
  ctx: CanvasRenderingContext2D,
  worldOriginX: number,
  worldOriginY: number,
  zoom: number,
  worldCols: number,
  worldRows: number,
): void {
  const s = TILE_SIZE * zoom
  const patch = Math.max(1, Math.round(zoom * 1.2))
  for (let row = 0; row < worldRows; row++) {
    for (let col = 0; col < worldCols; col++) {
      const x = worldOriginX + col * s
      const y = worldOriginY + row * s
      ctx.fillStyle = ((col * 3 + row * 5) % 7) < 3 ? GRASS_SHADE : GRASS_HIGHLIGHT
      ctx.fillRect(x + patch, y + patch, patch, patch)
      if ((col + row) % 3 === 0) {
        ctx.fillRect(x + s - patch * 2, y + s - patch * 2, patch, patch)
      }
    }
  }
}

function drawPaverTexture(
  ctx: CanvasRenderingContext2D,
  worldOriginX: number,
  worldOriginY: number,
  zoom: number,
  rect: RectSpec,
  base: string,
  accent: string,
): void {
  fillRectTiles(ctx, worldOriginX, worldOriginY, zoom, rect, base)
  const s = TILE_SIZE * zoom
  const line = Math.max(1, Math.round(zoom))
  ctx.strokeStyle = accent
  ctx.lineWidth = line
  for (let r = 0; r <= rect.h; r++) {
    const y = worldOriginY + (rect.row + r) * s + 0.5
    ctx.beginPath()
    ctx.moveTo(worldOriginX + rect.col * s, y)
    ctx.lineTo(worldOriginX + (rect.col + rect.w) * s, y)
    ctx.stroke()
  }
  for (let c = 0; c <= rect.w; c++) {
    const x = worldOriginX + (rect.col + c) * s + 0.5
    ctx.beginPath()
    ctx.moveTo(x, worldOriginY + rect.row * s)
    ctx.lineTo(x, worldOriginY + (rect.row + rect.h) * s)
    ctx.stroke()
  }
}

function drawRoadLaneMarks(
  ctx: CanvasRenderingContext2D,
  worldOriginX: number,
  worldOriginY: number,
  zoom: number,
  rect: RectSpec,
  vertical: boolean,
): void {
  const s = TILE_SIZE * zoom
  const dash = s * 0.8
  const gap = s * 0.55
  ctx.fillStyle = LANE_COLOR

  if (vertical) {
    const x = worldOriginX + (rect.col + rect.w / 2) * s - Math.max(1, zoom)
    for (let y = worldOriginY + rect.row * s + gap; y < worldOriginY + (rect.row + rect.h) * s - dash; y += dash + gap) {
      ctx.fillRect(x, y, Math.max(2, Math.round(zoom * 1.8)), dash)
    }
    return
  }

  const y = worldOriginY + (rect.row + rect.h / 2) * s - Math.max(1, zoom)
  for (let x = worldOriginX + rect.col * s + gap; x < worldOriginX + (rect.col + rect.w) * s - dash; x += dash + gap) {
    ctx.fillRect(x, y, dash, Math.max(2, Math.round(zoom * 1.8)))
  }
}

function drawCrosswalk(
  ctx: CanvasRenderingContext2D,
  worldOriginX: number,
  worldOriginY: number,
  zoom: number,
  rect: RectSpec,
  vertical: boolean,
): void {
  const s = TILE_SIZE * zoom
  const stripe = Math.max(3, Math.round(s * 0.24))
  const gap = Math.max(2, Math.round(s * 0.18))
  ctx.fillStyle = CROSSWALK_COLOR

  if (vertical) {
    for (let x = worldOriginX + rect.col * s + gap; x < worldOriginX + (rect.col + rect.w) * s - stripe; x += stripe + gap) {
      ctx.fillRect(x, worldOriginY + rect.row * s, stripe, rect.h * s)
    }
    return
  }

  for (let y = worldOriginY + rect.row * s + gap; y < worldOriginY + (rect.row + rect.h) * s - stripe; y += stripe + gap) {
    ctx.fillRect(worldOriginX + rect.col * s, y, rect.w * s, stripe)
  }
}

function drawTree(
  ctx: CanvasRenderingContext2D,
  worldOriginX: number,
  worldOriginY: number,
  zoom: number,
  col: number,
  row: number,
  variant = 0,
  _time = 0,
): void {
  const s = TILE_SIZE * zoom
  const x = worldOriginX + col * s
  const y = worldOriginY + row * s

  ctx.fillStyle = TREE_SHADOW
  ctx.beginPath()
  ctx.ellipse(x + s * 0.5, y + s * 0.85, s * 0.45, s * 0.18, 0, 0, Math.PI * 2)
  ctx.fill()

  const img = assets.trees
  if (img.complete && img.naturalWidth > 0) {
    // Exact coordinates for the 5 main trees detected in Trees.png
    const treeData = [
      { sx: 287, sy: 0,   sw: 66, sh: 128 },
      { sx: 94,  sy: 21,  sw: 85, sh: 107 },
      { sx: 194, sy: 24,  sw: 75, sh: 104 },
      { sx: 375, sy: 29,  sw: 66, sh: 99  },
      { sx: 1,   sy: 40,  sw: 70, sh: 88  },
    ]
    
    // Pick one of the 5 trees
    const treeIdx = (variant + Math.abs(col * 3 + row * 5)) % treeData.length
    const { sx, sy, sw, sh } = treeData[treeIdx]

    // Scale while preserving aspect ratio, centered on the tile
    const scale = 1.2
    const drawW = s * (sw / 32) * scale
    const drawH = s * (sh / 32) * scale
    const dx = x + s * 0.5 - drawW / 2
    const dy = y + s * 0.85 - drawH
    
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, drawW, drawH)
    ctx.imageSmoothingEnabled = false
  } else {
    const trunkW = Math.max(3, Math.round(s * (variant === 1 ? 0.25 : 0.2)))
    const trunkH = Math.max(4, Math.round(s * (variant === 1 ? 0.4 : 0.35)))
    const canopy = Math.round(s * (variant === 1 ? 0.85 : 0.72))
    const canopyColor = variant === 1 ? '#3a5f2a' : TREE_CANOPY
    const highlightColor = variant === 1 ? '#4b7c35' : TREE_CANOPY_LIGHT
    ctx.fillStyle = TREE_TRUNK
    ctx.fillRect(x + s * 0.5 - trunkW / 2, y + s * 0.52, trunkW, trunkH)
    ctx.fillStyle = canopyColor
    ctx.fillRect(x + s * 0.5 - canopy / 2 + windX, y + s * 0.1, canopy, canopy)
    ctx.fillStyle = highlightColor
    ctx.fillRect(x + s * 0.5 - canopy * 0.2 + windX, y + s * 0.18, canopy * 0.45, canopy * 0.35)
  }
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  worldOriginX: number,
  worldOriginY: number,
  zoom: number,
  col: number,
  row: number,
  color: string,
  vertical = false,
  time = 0,
  reverse = false,
): void {
  const s = TILE_SIZE * zoom
  const speed = vertical ? 0.04 : 0.06
  const loopDist = vertical ? 60 * s : 100 * s
  const offset = (time * speed) % loopDist

  let x = worldOriginX + col * s
  let y = worldOriginY + row * s

  if (vertical) {
    if (reverse) {
      y += offset
      if (y > worldOriginY + loopDist - 20 * s) y -= loopDist
    } else {
      y -= offset
      if (y < worldOriginY - 10 * s) y += loopDist
    }
  } else {
    if (reverse) {
      x -= offset
      if (x < worldOriginX - 10 * s) x += loopDist
    } else {
      x += offset
      if (x > worldOriginX + loopDist - 20 * s) x -= loopDist
    }
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'
  if (vertical) {
    ctx.fillRect(x + s * 0.1, y + s * 0.1, s * 0.8, s * 1.2)
  } else {
    ctx.fillRect(x + s * 0.1, y + s * 0.1, s * 1.2, s * 0.8)
  }

  if (assets.cars.complete && assets.cars.naturalWidth > 0) {
    const colorIdx = color === CAR_RED ? 0 : color === CAR_BLUE ? 1 : color === CAR_GREEN ? 2 : 3
    const sx = colorIdx * 16

    ctx.save()
    ctx.translate(x + s * 0.5, y + s * 0.5)
    if (vertical) {
      ctx.rotate(reverse ? Math.PI : 0)
    } else {
      ctx.rotate(reverse ? -Math.PI / 2 : Math.PI / 2)
    }
    ctx.drawImage(assets.cars, sx, 0, 16, 16, -s * 0.5, -s * 0.5, s, s)
    ctx.restore()
  } else {
    ctx.fillStyle = color
    if (vertical) {
      ctx.fillRect(x + s * 0.2, y + s * 0.1, s * 0.6, s * 1.1)
      ctx.fillStyle = CAR_GLASS
      ctx.fillRect(x + s * 0.25, y + s * 0.3, s * 0.5, s * 0.2)
    } else {
      ctx.fillRect(x + s * 0.1, y + s * 0.2, s * 1.1, s * 0.6)
      ctx.fillStyle = CAR_GLASS
      ctx.fillRect(x + s * 0.3, y + s * 0.25, s * 0.2, s * 0.5)
    }
  }
}

function drawStreetLight(
  ctx: CanvasRenderingContext2D,
  worldOriginX: number,
  worldOriginY: number,
  zoom: number,
  col: number,
  row: number,
): void {
  const s = TILE_SIZE * zoom
  const x = worldOriginX + col * s
  const y = worldOriginY + row * s

  const poleW = Math.max(2, Math.round(zoom * 1.5))
  ctx.fillStyle = STREET_LIGHT_POLE
  ctx.fillRect(x + s * 0.5 - poleW / 2, y + s * 0.2, poleW, s * 0.7)

  const headW = Math.max(4, Math.round(s * 0.3))
  ctx.fillRect(x + s * 0.5 - headW / 2, y + s * 0.1, headW, headW)

  ctx.fillStyle = STREET_LIGHT_GLOW
  ctx.beginPath()
  ctx.arc(x + s * 0.5, y + s * 0.2, s * 0.6, 0, Math.PI * 2)
  ctx.fill()
}

function drawTrashCan(
  ctx: CanvasRenderingContext2D,
  worldOriginX: number,
  worldOriginY: number,
  zoom: number,
  col: number,
  row: number,
): void {
  const s = TILE_SIZE * zoom
  const x = worldOriginX + col * s
  const y = worldOriginY + row * s

  const size = s * 0.45
  ctx.fillStyle = TRASH_CAN_BASE
  ctx.fillRect(x + s * 0.28, y + s * 0.28, size, size)
  ctx.fillStyle = TRASH_CAN_LID
  ctx.fillRect(x + s * 0.32, y + s * 0.32, size * 0.8, size * 0.8)
}

function drawFlowerPatch(
  ctx: CanvasRenderingContext2D,
  worldOriginX: number,
  worldOriginY: number,
  zoom: number,
  col: number,
  row: number,
  variant = 0,
): void {
  const s = TILE_SIZE * zoom
  const x = worldOriginX + col * s
  const y = worldOriginY + row * s
  const dot = Math.max(2, Math.round(zoom))

  const colors = [
    [FLOWER_RED, FLOWER_YELLOW],
    [FLOWER_PURPLE, FLOWER_WHITE],
    [FLOWER_RED, FLOWER_WHITE],
  ]
  const [c1, c2] = colors[variant % colors.length]

  ctx.fillStyle = c1
  ctx.fillRect(x + s * 0.2, y + s * 0.3, dot, dot)
  ctx.fillRect(x + s * 0.7, y + s * 0.2, dot, dot)
  ctx.fillStyle = c2
  ctx.fillRect(x + s * 0.4, y + s * 0.6, dot, dot)
  ctx.fillRect(x + s * 0.8, y + s * 0.7, dot, dot)
}

function drawPuddle(
  ctx: CanvasRenderingContext2D,
  worldOriginX: number,
  worldOriginY: number,
  zoom: number,
  col: number,
  row: number,
): void {
  const s = TILE_SIZE * zoom
  const x = worldOriginX + col * s
  const y = worldOriginY + row * s

  ctx.fillStyle = PUDDLE_COLOR
  ctx.beginPath()
  ctx.ellipse(x + s * 0.5, y + s * 0.5, s * 0.6, s * 0.3, Math.PI / 4, 0, Math.PI * 2)
  ctx.fill()
}

function drawSidewalkCracks(
  ctx: CanvasRenderingContext2D,
  worldOriginX: number,
  worldOriginY: number,
  zoom: number,
  rect: RectSpec,
): void {
  const s = TILE_SIZE * zoom
  ctx.strokeStyle = CRACK_COLOR
  ctx.lineWidth = Math.max(1, Math.round(zoom * 0.8))

  const crackCount = 5
  for (let i = 0; i < crackCount; i++) {
    const seed = rect.col * 101 + rect.row * 211 + rect.w * 307 + rect.h * 401 + i * 503
    const start: PointSpec = {
      x: worldOriginX + (rect.col + deterministicUnit(seed) * rect.w) * s,
      y: worldOriginY + (rect.row + deterministicUnit(seed + 1) * rect.h) * s,
    }
    const bend: PointSpec = {
      x: start.x + (deterministicUnit(seed + 2) - 0.5) * s * 0.6,
      y: start.y + deterministicUnit(seed + 3) * s * 0.7,
    }
    const end: PointSpec = {
      x: bend.x + (deterministicUnit(seed + 4) - 0.5) * s * 0.4,
      y: bend.y + deterministicUnit(seed + 5) * s * 0.5,
    }

    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(bend.x, bend.y)
    ctx.lineTo(end.x, end.y)
    ctx.stroke()
  }
}

function drawRock(
  ctx: CanvasRenderingContext2D,
  worldOriginX: number,
  worldOriginY: number,
  zoom: number,
  col: number,
  row: number,
): void {
  const s = TILE_SIZE * zoom
  const x = worldOriginX + col * s
  const y = worldOriginY + row * s

  ctx.fillStyle = ROCK_BASE
  ctx.beginPath()
  ctx.arc(x + s * 0.4, y + s * 0.5, s * 0.25, 0, Math.PI * 2)
  ctx.arc(x + s * 0.65, y + s * 0.6, s * 0.2, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = ROCK_SHADE
  ctx.beginPath()
  ctx.arc(x + s * 0.35, y + s * 0.55, s * 0.12, 0, Math.PI * 2)
  ctx.fill()
}

function drawHydrant(
  ctx: CanvasRenderingContext2D,
  worldOriginX: number,
  worldOriginY: number,
  zoom: number,
  col: number,
  row: number,
): void {
  const s = TILE_SIZE * zoom
  const x = worldOriginX + col * s
  const y = worldOriginY + row * s
  ctx.fillStyle = HYDRANT_DARK
  ctx.fillRect(x + s * 0.32, y + s * 0.7, s * 0.36, s * 0.08)
  ctx.fillStyle = HYDRANT_RED
  ctx.fillRect(x + s * 0.38, y + s * 0.22, s * 0.24, s * 0.48)
  ctx.fillRect(x + s * 0.26, y + s * 0.34, s * 0.48, s * 0.12)
  ctx.fillRect(x + s * 0.42, y + s * 0.1, s * 0.16, s * 0.12)
}

function drawManhole(
  ctx: CanvasRenderingContext2D,
  worldOriginX: number,
  worldOriginY: number,
  zoom: number,
  col: number,
  row: number,
): void {
  const s = TILE_SIZE * zoom
  const x = worldOriginX + col * s + s * 0.2
  const y = worldOriginY + row * s + s * 0.2
  const size = s * 0.6
  ctx.fillStyle = METAL_DARK
  ctx.fillRect(x, y, size, size)
  ctx.strokeStyle = METAL_LIGHT
  ctx.lineWidth = Math.max(1, Math.round(zoom))
  ctx.strokeRect(x, y, size, size)
  ctx.beginPath()
  ctx.moveTo(x + size * 0.2, y + size * 0.5)
  ctx.lineTo(x + size * 0.8, y + size * 0.5)
  ctx.moveTo(x + size * 0.5, y + size * 0.2)
  ctx.lineTo(x + size * 0.5, y + size * 0.8)
  ctx.stroke()
}

function drawFountain(
  ctx: CanvasRenderingContext2D,
  worldOriginX: number,
  worldOriginY: number,
  zoom: number,
  col: number,
  row: number,
): void {
  const s = TILE_SIZE * zoom
  const x = worldOriginX + col * s
  const y = worldOriginY + row * s
  ctx.fillStyle = FOUNTAIN_EDGE
  ctx.fillRect(x + s * 0.12, y + s * 0.12, s * 1.76, s * 1.76)
  ctx.fillStyle = FOUNTAIN_WATER
  ctx.fillRect(x + s * 0.32, y + s * 0.32, s * 1.36, s * 1.36)
  ctx.fillStyle = '#d8ecef'
  ctx.fillRect(x + s * 0.88, y + s * 0.46, s * 0.24, s * 0.78)
}

function drawCurb(
  ctx: CanvasRenderingContext2D,
  worldOriginX: number,
  worldOriginY: number,
  zoom: number,
  cols: number,
  rows: number,
): void {
  const s = TILE_SIZE * zoom
  const x = worldOriginX + (EXTERIOR_PAD_LEFT_TILES - SIDEWALK_TILES) * s
  const y = worldOriginY + (EXTERIOR_PAD_TOP_TILES - SIDEWALK_TILES) * s
  const w = (cols + SIDEWALK_TILES * 2) * s
  const h = (rows + SIDEWALK_TILES * 2) * s
  ctx.strokeStyle = CURB_COLOR
  ctx.lineWidth = Math.max(2, Math.round(zoom * 1.5))
  ctx.strokeRect(x, y, w, h)
}

function drawOilSpill(
  ctx: CanvasRenderingContext2D,
  worldOriginX: number,
  worldOriginY: number,
  zoom: number,
  col: number,
  row: number,
): void {
  const s = TILE_SIZE * zoom
  const x = worldOriginX + col * s
  const y = worldOriginY + row * s

  ctx.fillStyle = 'rgba(20, 20, 25, 0.3)'
  ctx.beginPath()
  ctx.arc(x + s * 0.5, y + s * 0.5, s * 0.4, 0, Math.PI * 2)
  ctx.arc(x + s * 0.3, y + s * 0.4, s * 0.2, 0, Math.PI * 2)
  ctx.fill()
}

function drawBench(
  ctx: CanvasRenderingContext2D,
  worldOriginX: number,
  worldOriginY: number,
  zoom: number,
  col: number,
  row: number,
  vertical = false,
): void {
  const s = TILE_SIZE * zoom
  const x = worldOriginX + col * s
  const y = worldOriginY + row * s
  const leg = Math.max(2, Math.round(zoom * 1.4))
  ctx.fillStyle = BENCH_METAL
  if (vertical) {
    ctx.fillRect(x + s * 0.25, y + s * 0.15, leg, s * 0.7)
    ctx.fillRect(x + s * 0.65, y + s * 0.15, leg, s * 0.7)
    ctx.fillStyle = BENCH_WOOD
    ctx.fillRect(x + s * 0.32, y + s * 0.2, s * 0.3, s * 0.16)
    ctx.fillRect(x + s * 0.32, y + s * 0.48, s * 0.3, s * 0.16)
    return
  }

  ctx.fillRect(x + s * 0.15, y + s * 0.25, s * 0.7, leg)
  ctx.fillRect(x + s * 0.15, y + s * 0.65, s * 0.7, leg)
  ctx.fillStyle = BENCH_WOOD
  ctx.fillRect(x + s * 0.2, y + s * 0.32, s * 0.6, s * 0.12)
  ctx.fillRect(x + s * 0.2, y + s * 0.5, s * 0.6, s * 0.12)
}

export function renderExterior(
  ctx: CanvasRenderingContext2D,
  worldOriginX: number,
  worldOriginY: number,
  zoom: number,
  cols: number,
  rows: number,
  time: number,
): void {
  const { worldCols, worldRows } = getExteriorMetrics(cols, rows, zoom)

  fillRectTiles(ctx, worldOriginX, worldOriginY, zoom, { col: 0, row: 0, w: worldCols, h: worldRows }, GRASS_BASE)
  drawGrassTexture(ctx, worldOriginX, worldOriginY, zoom, worldCols, worldRows)

  const buildingCol = EXTERIOR_PAD_LEFT_TILES
  const buildingRow = EXTERIOR_PAD_TOP_TILES
  const lotRect = {
    col: buildingCol - SIDEWALK_TILES,
    row: buildingRow - SIDEWALK_TILES,
    w: cols + SIDEWALK_TILES * 2,
    h: rows + SIDEWALK_TILES * 2,
  }
  const plazaRect = {
    col: buildingCol + cols + 1,
    row: buildingRow + 8,
    w: 6,
    h: 9,
  }
  const rightRoad = {
    col: buildingCol + cols + 8,
    row: 0,
    w: ROAD_WIDTH_TILES,
    h: worldRows,
  }
  const bottomRoad = {
    col: 0,
    row: buildingRow + rows + 5,
    w: worldCols,
    h: ROAD_WIDTH_TILES,
  }

  drawPaverTexture(ctx, worldOriginX, worldOriginY, zoom, lotRect, SIDEWALK_BASE, SIDEWALK_SHADE)
  drawPaverTexture(ctx, worldOriginX, worldOriginY, zoom, plazaRect, PLAZA_BASE, PLAZA_SHADE)

  drawSidewalkCracks(ctx, worldOriginX, worldOriginY, zoom, lotRect)

  fillRectTiles(ctx, worldOriginX, worldOriginY, zoom, rightRoad, ROAD_BASE)
  fillRectTiles(ctx, worldOriginX, worldOriginY, zoom, bottomRoad, ROAD_BASE)
  fillRectTiles(
    ctx,
    worldOriginX,
    worldOriginY,
    zoom,
    { col: rightRoad.col, row: bottomRoad.row, w: rightRoad.w, h: bottomRoad.h },
    ROAD_SHADE,
  )

  drawRoadLaneMarks(ctx, worldOriginX, worldOriginY, zoom, rightRoad, true)
  drawRoadLaneMarks(ctx, worldOriginX, worldOriginY, zoom, bottomRoad, false)
  drawCrosswalk(
    ctx,
    worldOriginX,
    worldOriginY,
    zoom,
    { col: rightRoad.col - 1, row: buildingRow + 12, w: 1, h: 3 },
    false,
  )
  drawCrosswalk(
    ctx,
    worldOriginX,
    worldOriginY,
    zoom,
    { col: buildingCol + 8, row: bottomRoad.row - 1, w: 4, h: 1 },
    true,
  )

  drawCurb(ctx, worldOriginX, worldOriginY, zoom, cols, rows)
  drawFountain(ctx, worldOriginX, worldOriginY, zoom, plazaRect.col + 2, plazaRect.row + 3)

  drawStreetLight(ctx, worldOriginX, worldOriginY, zoom, lotRect.col - 1, lotRect.row + 5)
  drawStreetLight(ctx, worldOriginX, worldOriginY, zoom, lotRect.col + lotRect.w, lotRect.row + 5)
  drawStreetLight(ctx, worldOriginX, worldOriginY, zoom, lotRect.col + 5, lotRect.row - 1)
  drawStreetLight(ctx, worldOriginX, worldOriginY, zoom, plazaRect.col + 3, plazaRect.row - 1)

  drawTrashCan(ctx, worldOriginX, worldOriginY, zoom, plazaRect.col - 1, plazaRect.row + 4)
  drawTrashCan(ctx, worldOriginX, worldOriginY, zoom, buildingCol - 2, buildingRow + rows + 1)

  drawBench(ctx, worldOriginX, worldOriginY, zoom, plazaRect.col + 1, plazaRect.row + 1)
  drawBench(ctx, worldOriginX, worldOriginY, zoom, plazaRect.col + 4, plazaRect.row + 1)
  drawBench(ctx, worldOriginX, worldOriginY, zoom, plazaRect.col + 1, plazaRect.row + 7)
  drawBench(ctx, worldOriginX, worldOriginY, zoom, plazaRect.col + 4, plazaRect.row + 7)
  drawBench(ctx, worldOriginX, worldOriginY, zoom, buildingCol - 6, buildingRow + rows + 1, true)

  const treePositions = [
    [buildingCol - 8, buildingRow - 4, 1],
    [buildingCol - 5, buildingRow + 2, 0],
    [buildingCol - 9, buildingRow + 10, 1],
    [buildingCol + cols + 3, buildingRow - 4, 0],
    [buildingCol + cols + 5, buildingRow + 1, 1],
    [buildingCol + cols + 3, buildingRow + rows - 2, 0],
    [buildingCol - 7, buildingRow + rows - 4, 1],
    [buildingCol - 3, buildingRow + rows + 2, 0],
    [plazaRect.col + 1, plazaRect.row + plazaRect.h + 1, 1],
    [plazaRect.col + 4, plazaRect.row + plazaRect.h + 1, 0],
  ] as const

  for (const [col, row, variant] of treePositions) {
    drawTree(ctx, worldOriginX, worldOriginY, zoom, col, row, variant, time)
  }

  const natureDetails = [
    [buildingCol - 4, buildingRow - 3, 'flower', 0],
    [buildingCol - 10, buildingRow + 5, 'rock', 0],
    [buildingCol + cols + 5, buildingRow + 15, 'flower', 1],
    [buildingCol + 10, buildingRow + rows + 8, 'flower', 2],
    [buildingCol - 5, buildingRow + rows + 10, 'rock', 0],
    [buildingCol + 5, buildingRow - 5, 'puddle', 0],
  ] as const

  for (const [col, row, type, variant] of natureDetails) {
    if (type === 'flower') {
      drawFlowerPatch(ctx, worldOriginX, worldOriginY, zoom, col, row, variant)
    } else if (type === 'rock') {
      drawRock(ctx, worldOriginX, worldOriginY, zoom, col, row)
    } else if (type === 'puddle') {
      drawPuddle(ctx, worldOriginX, worldOriginY, zoom, col, row)
    }
  }

  drawOilSpill(ctx, worldOriginX, worldOriginY, zoom, rightRoad.col + 1, buildingRow + 2)
  drawOilSpill(ctx, worldOriginX, worldOriginY, zoom, buildingCol + 15, bottomRoad.row + 3)

  // Lanes and Directions
  // Vertical Road: Left Lane (col + 0.8) goes UP, Right Lane (col + 3.2) goes DOWN
  drawCar(ctx, worldOriginX, worldOriginY, zoom, rightRoad.col + 0.8, buildingRow - 2, CAR_RED, true, time, false)
  drawCar(ctx, worldOriginX, worldOriginY, zoom, rightRoad.col + 3.2, buildingRow + 4, CAR_YELLOW, true, time, true)
  drawCar(ctx, worldOriginX, worldOriginY, zoom, rightRoad.col + 0.8, buildingRow + 15, CAR_BLUE, true, time, false)

  // Horizontal Road: Top Lane (row + 0.8) goes RIGHT, Bottom Lane (row + 3.2) goes LEFT
  drawCar(ctx, worldOriginX, worldOriginY, zoom, buildingCol + 2, bottomRoad.row + 0.8, CAR_GREEN, false, time, false)
  drawCar(ctx, worldOriginX, worldOriginY, zoom, buildingCol + 12, bottomRoad.row + 3.2, CAR_RED, false, time, true)
  drawCar(ctx, worldOriginX, worldOriginY, zoom, buildingCol + 20, bottomRoad.row + 0.8, CAR_YELLOW, false, time, false)

  drawHydrant(ctx, worldOriginX, worldOriginY, zoom, rightRoad.col - 2, buildingRow + 13)
  drawManhole(ctx, worldOriginX, worldOriginY, zoom, rightRoad.col + 2, buildingRow + 5)
  drawManhole(ctx, worldOriginX, worldOriginY, zoom, buildingCol + 3, bottomRoad.row + 2)
}
