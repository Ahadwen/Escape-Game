export const TAU = Math.PI * 2;
export const TILE_W = 560;
export const BLOCK = 35;
export const CAMERA_PAN_SPEED = 900;
export const HEAL_PICKUP_HIT_R = 24;
export const HEAL_PICKUP_PLUS_HALF = 13;
export const HEAL_PICKUP_ARM_THICK = 6;
export const SNIPER_ARTILLERY_WINDUP = 1.38;
export const SNIPER_ARTILLERY_LEAD = 0.94;

export function tileGridDims(viewH) {
  return {
    TILE_COLS: Math.floor(TILE_W / BLOCK),
    TILE_ROWS: Math.floor(viewH / BLOCK),
  };
}
