import { makeRng } from "./rng.js";

function rotatePoints(points) {
  return points.map((p) => ({ x: p.y, y: -p.x }));
}

function normalizePoints(points) {
  let minX = Infinity;
  let minY = Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
  }
  return points.map((p) => ({ x: p.x - minX, y: p.y - minY }));
}

/** @param {number} tileIndex @param {{ TILE_COLS: number; TILE_ROWS: number; TILE_W: number; BLOCK: number }} d */
export function generateTileObstacles(tileIndex, d) {
  const { TILE_COLS, TILE_ROWS, TILE_W, BLOCK } = d;
  const rng = makeRng(tileIndex * 0x9e3779b1);
  const grid = Array.from({ length: TILE_ROWS }, () => Array(TILE_COLS).fill(false));

  const topClearRows = 3;
  const bottomClearRows = 3;
  const minRow = topClearRows;
  const maxRow = TILE_ROWS - bottomClearRows - 1;

  const tetrominoes = [
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }],
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }],
    [{ x: 2, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }],
    [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
  ];

  let filled = 0;
  const targetBlocks = 72 + Math.floor(rng() * 28);

  function stampTetrominoAtEdge(side) {
    const base = tetrominoes[Math.floor(rng() * tetrominoes.length)];
    let points = base.map((p) => ({ ...p }));
    const rotations = Math.floor(rng() * 4);
    for (let i = 0; i < rotations; i++) points = rotatePoints(points);
    points = normalizePoints(points);

    const maxX = Math.max(...points.map((p) => p.x));
    const maxY = Math.max(...points.map((p) => p.y));
    const originX = side === "left" ? 0 : TILE_COLS - (maxX + 1);
    const originYMin = minRow;
    const originYMax = maxRow - maxY;
    if (originYMax < originYMin) return;
    const originY = originYMin + Math.floor(rng() * (originYMax - originYMin + 1));

    for (const p of points) {
      const gx = originX + p.x;
      const gy = originY + p.y;
      if (gx < 0 || gx >= TILE_COLS || gy < minRow || gy > maxRow) continue;
      if (!grid[gy][gx]) {
        grid[gy][gx] = true;
        filled++;
      }
    }
  }

  stampTetrominoAtEdge("left");
  stampTetrominoAtEdge("right");

  let safety = 0;
  while (filled < targetBlocks && safety < 380) {
    safety++;
    const base = tetrominoes[Math.floor(rng() * tetrominoes.length)];
    let points = base.map((p) => ({ ...p }));
    const rotations = Math.floor(rng() * 4);
    for (let i = 0; i < rotations; i++) points = rotatePoints(points);
    points = normalizePoints(points);

    const maxX = Math.max(...points.map((p) => p.x));
    const maxY = Math.max(...points.map((p) => p.y));

    const originX = Math.floor(rng() * (TILE_COLS - (maxX + 1)));
    const originYMin = minRow;
    const originYMax = maxRow - maxY;
    if (originYMax < originYMin) continue;
    const originY = originYMin + Math.floor(rng() * (originYMax - originYMin + 1));

    let ok = true;
    for (const p of points) {
      const gx = originX + p.x;
      const gy = originY + p.y;
      if (gx < 0 || gx >= TILE_COLS || gy < minRow || gy > maxRow) {
        ok = false;
        break;
      }
      if (grid[gy][gx]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    for (const p of points) {
      const gx = originX + p.x;
      const gy = originY + p.y;
      grid[gy][gx] = true;
      filled++;
    }
  }

  const verticalCorridors = [
    Math.floor(TILE_COLS * 0.2 + rng() * 2),
    Math.floor(TILE_COLS * 0.5 + rng() * 2 - 1),
    Math.floor(TILE_COLS * 0.8 + rng() * 2 - 2),
  ];
  for (const center of verticalCorridors) {
    for (let c = center - 1; c <= center + 1; c++) {
      if (c < 0 || c >= TILE_COLS) continue;
      for (let r = minRow; r <= maxRow; r++) grid[r][c] = false;
    }
  }

  const horizontalCorridors = [
    Math.floor(minRow + (maxRow - minRow) * 0.3),
    Math.floor(minRow + (maxRow - minRow) * 0.62),
  ];
  for (const center of horizontalCorridors) {
    for (let r = center; r <= center + 1; r++) {
      if (r < minRow || r > maxRow) continue;
      for (let c = 0; c < TILE_COLS; c++) grid[r][c] = false;
    }
  }

  const rects = [];
  const baseX = tileIndex * TILE_W;
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = 0; c < TILE_COLS; c++) {
      if (!grid[r][c]) continue;
      rects.push({ x: baseX + c * BLOCK, y: r * BLOCK, w: BLOCK, h: BLOCK });
    }
  }
  return rects;
}
