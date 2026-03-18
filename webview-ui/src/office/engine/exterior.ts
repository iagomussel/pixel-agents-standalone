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
): void {
  const s = TILE_SIZE * zoom
  const x = worldOriginX + col * s
  const y = worldOriginY + row * s
  const trunkW = Math.max(3, Math.round(s * 0.2))
  const trunkH = Math.max(4, Math.round(s * 0.35))
  const canopy = Math.round(s * 0.72)
  ctx.fillStyle = TREE_SHADOW
  ctx.fillRect(x + s * 0.15, y + s * 0.72, canopy, Math.max(3, Math.round(s * 0.18)))
  ctx.fillStyle = TREE_TRUNK
  ctx.fillRect(x + s * 0.5 - trunkW / 2, y + s * 0.52, trunkW, trunkH)
  ctx.fillStyle = TREE_CANOPY
  ctx.fillRect(x + s * 0.12, y + s * 0.1, canopy, canopy)
  ctx.fillStyle = TREE_CANOPY_LIGHT
  ctx.fillRect(x + s * 0.24, y + s * 0.18, canopy * 0.45, canopy * 0.35)
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

export function renderExterior(
  ctx: CanvasRenderingContext2D,
  worldOriginX: number,
  worldOriginY: number,
  zoom: number,
  cols: number,
  rows: number,
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
  drawBench(ctx, worldOriginX, worldOriginY, zoom, plazaRect.col + 1, plazaRect.row + 1)
  drawBench(ctx, worldOriginX, worldOriginY, zoom, plazaRect.col + 4, plazaRect.row + 1)
  drawBench(ctx, worldOriginX, worldOriginY, zoom, plazaRect.col + 1, plazaRect.row + 7)
  drawBench(ctx, worldOriginX, worldOriginY, zoom, plazaRect.col + 4, plazaRect.row + 7)
  drawBench(ctx, worldOriginX, worldOriginY, zoom, buildingCol - 6, buildingRow + rows + 1, true)

  const treePositions = [
    [buildingCol - 8, buildingRow - 4],
    [buildingCol - 5, buildingRow + 2],
    [buildingCol - 9, buildingRow + 10],
    [buildingCol + cols + 3, buildingRow - 4],
    [buildingCol + cols + 5, buildingRow + 1],
    [buildingCol + cols + 3, buildingRow + rows - 2],
    [buildingCol - 7, buildingRow + rows - 4],
    [buildingCol - 3, buildingRow + rows + 2],
    [plazaRect.col + 1, plazaRect.row + plazaRect.h + 1],
    [plazaRect.col + 4, plazaRect.row + plazaRect.h + 1],
  ] as const

  for (const [col, row] of treePositions) {
    drawTree(ctx, worldOriginX, worldOriginY, zoom, col, row)
  }

  drawHydrant(ctx, worldOriginX, worldOriginY, zoom, rightRoad.col - 2, buildingRow + 13)
  drawManhole(ctx, worldOriginX, worldOriginY, zoom, rightRoad.col + 2, buildingRow + 5)
  drawManhole(ctx, worldOriginX, worldOriginY, zoom, buildingCol + 3, bottomRoad.row + 2)
}
