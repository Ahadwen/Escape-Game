import {
  TAU,
  TILE_W,
  BLOCK,
  CAMERA_PAN_SPEED,
  HEAL_PICKUP_HIT_R,
  HEAL_PICKUP_PLUS_HALF,
  HEAL_PICKUP_ARM_THICK,
  SNIPER_ARTILLERY_WINDUP,
  SNIPER_ARTILLERY_LEAD,
  tileGridDims,
} from "./constants.js";
import { clamp, distSq, pointToSegmentDistance, rand, intersectsRectCircle, lineIntersectsRect } from "./math.js";
import { generateTileObstacles } from "./tiles.js";
import { drawCircle, drawHealPickup, drawObstacles } from "./draw.js";

export function mountEscape({ canvas, snapshotFolderButton, snapshotStatus }) {
  const ctx = canvas.getContext("2d");
  const world = { w: canvas.width, h: canvas.height };
  const VIEW_W = world.w;
  const VIEW_H = world.h;
  const { TILE_COLS, TILE_ROWS } = tileGridDims(world.h);

let obstacles = []; // active obstacles for the currently cached 3 tiles
let activeTileMinX = 0;
let activeTileMaxX = VIEW_W; // set by ensureTilesForPlayer()
let activePlayerTile = 0;
let cameraX = 0;
let cameraPanDir = 0;
let cameraOffset = 0;
let lastTileIndex = null;

const tileCache = new Map(); // tileIndex -> rect obstacles in global coordinates

function ensureTilesForPlayer() {
  const tileIndex = Math.floor(player.x / TILE_W);
  activePlayerTile = tileIndex;

  if (lastTileIndex === tileIndex && obstacles.length) return;
  lastTileIndex = tileIndex;

  const needed = [tileIndex - 1, tileIndex, tileIndex + 1];
  for (const idx of needed) {
    if (!tileCache.has(idx)) tileCache.set(idx, generateTileObstacles(idx, { TILE_COLS, TILE_ROWS, TILE_W, BLOCK }));
  }
  // Drop other cached tiles.
  for (const idx of Array.from(tileCache.keys())) {
    if (idx < needed[0] || idx > needed[2]) tileCache.delete(idx);
  }

  activeTileMinX = needed[0] * TILE_W;
  activeTileMaxX = (needed[2] + 1) * TILE_W;
  obstacles = [];
  for (const idx of needed) {
    obstacles = obstacles.concat(tileCache.get(idx));
  }
}

const player = {
  x: 96,
  y: 340,
  r: 10,
  hp: 10,
  maxHp: 10,
  speed: 198,
  facing: { x: 1, y: 0 },
  burstUntil: 0,
  ultimateSpeedUntil: 0,
  velX: 0,
  velY: 0,
  _px: 96,
  _py: 340,
};

const state = {
  keys: new Set(),
  running: true,
  bestSurvival: 0,
  elapsed: 0,
  lastTime: 0,
  wave: 0,
  spawnInterval: 8,
  nextSpawnAt: 3,
  spawnScheduled: [],
  nextPickupAt: 4,
  hurtFlash: 0,
  damageEvents: [],
  enemyHitCooldown: 0.52,
  deathCount: 0,
  snapshotPending: false,
  playerInvulnerableUntil: 0,
  playerTimelockUntil: 0,
  tempHp: 0,
  tempHpExpiry: 0,
  ultimatePushbackReadyAt: 0,
  screenShakeUntil: 0,
  screenShakeStrength: 0,
};

let snapshotDirectoryHandle = null;

const abilities = {
  dash: { key: "q", cooldown: 2.2, nextReadyAt: 0 },
  burst: { key: "w", cooldown: 5, nextReadyAt: 0, duration: 3 },
  decoy: { key: "e", cooldown: 8, nextReadyAt: 0 },
  random: { key: "r", type: null, ammo: 0, maxAmmo: 0 },
};

const entities = {
  hunters: [],
  pickups: [],
  decoys: [],
  shields: [],
  dangerZones: [],
  bullets: [],
  projectiles: [],
  laserBeams: [],
  attackRings: [],
  damageRipples: [],
  ultimateEffects: [],
};

function outOfBoundsCircle(c) {
  // World is infinite in X; only enforce Y bounds.
  return c.y - c.r < 0 || c.y + c.r > world.h;
}

function collidesAnyObstacle(circle) {
  for (const obstacle of obstacles) {
    if (intersectsRectCircle(circle, obstacle)) return true;
  }
  return false;
}

function lineIntersectsRect(x1, y1, x2, y2, rect) {
  const steps = Math.max(6, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 12));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return true;
  }
  return false;
}

function hasLineOfSight(from, target) {
  for (const obstacle of obstacles) {
    if (lineIntersectsRect(from.x, from.y, target.x, target.y, obstacle)) return false;
  }
  return true;
}

function getLaserEndpoint(x, y, dx, dy, maxLen = 900) {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  let lastX = x;
  let lastY = y;
  for (let d = 8; d <= maxLen; d += 8) {
    const px = x + ux * d;
    const py = y + uy * d;
    if (py < 0 || py > world.h) return { x: lastX, y: lastY };
    for (const obstacle of obstacles) {
      if (px >= obstacle.x && px <= obstacle.x + obstacle.w && py >= obstacle.y && py <= obstacle.y + obstacle.h) {
        return { x: lastX, y: lastY };
      }
    }
    lastX = px;
    lastY = py;
  }
  return { x: lastX, y: lastY };
}

function hitDecoyAlongSegment(ax, ay, bx, by, extraRadius = 0) {
  for (let i = entities.decoys.length - 1; i >= 0; i--) {
    const d = entities.decoys[i];
    const hitDist = pointToSegmentDistance(d.x, d.y, ax, ay, bx, by);
    if (hitDist <= d.r + extraRadius) {
      if (state.elapsed < d.invulnerableUntil) return true;
      d.hp -= 1;
      if (d.hp <= 0) entities.decoys.splice(i, 1);
      return true;
    }
  }
  return false;
}

function moveCircleWithCollisions(entity, vx, vy, dt) {
  const nx = { x: entity.x + vx * dt, y: entity.y, r: entity.r };
  if (!outOfBoundsCircle(nx) && !collidesAnyObstacle(nx)) entity.x = nx.x;
  const ny = { x: entity.x, y: entity.y + vy * dt, r: entity.r };
  if (!outOfBoundsCircle(ny) && !collidesAnyObstacle(ny)) entity.y = ny.y;
}

function updatePlayerVelocity(dt) {
  const pdt = Math.max(dt, 1e-5);
  const ix = (player.x - player._px) / pdt;
  const iy = (player.y - player._py) / pdt;
  player.velX = player.velX * 0.38 + ix * 0.62;
  player.velY = player.velY * 0.38 + iy * 0.62;
  player._px = player.x;
  player._py = player.y;
}

function randomOpenPoint(radius, attempts = 80) {
  for (let i = 0; i < attempts; i++) {
    const candidate = {
      x: rand(activeTileMinX + radius + 6, activeTileMaxX - radius - 6),
      y: rand(radius + 6, world.h - radius - 6),
      r: radius,
    };
    if (!collidesAnyObstacle(candidate)) return candidate;
  }
  return { x: player.x, y: world.h / 2, r: radius };
}

function randomOpenPointAround(cx, cy, radiusMin, radiusMax, r, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    const ang = Math.random() * TAU;
    const d = rand(radiusMin, radiusMax);
    const candidate = { x: cx + Math.cos(ang) * d, y: cy + Math.sin(ang) * d, r };
    if (outOfBoundsCircle(candidate)) continue;
    if (!collidesAnyObstacle(candidate)) return candidate;
  }
  // Fallback: just clamp within bounds (may overlap obstacles, but better than NaN).
  return {
    x: clamp(cx, activeTileMinX + r + 2, activeTileMaxX - r - 2),
    y: clamp(cy, r + 2, world.h - r - 2),
    r,
  };
}

function resetGame() {
  state.running = true;
  state.elapsed = 0;
  state.lastTime = 0;
  state.wave = 0;
  state.spawnInterval = 8;
  state.nextSpawnAt = 3;
  state.spawnScheduled = [];
  state.nextPickupAt = 4;
  state.hurtFlash = 0;
  state.damageEvents = [];
  state.snapshotPending = false;
  state.playerInvulnerableUntil = 0;
  state.playerTimelockUntil = 0;
  state.tempHp = 0;
  state.tempHpExpiry = 0;
  state.ultimatePushbackReadyAt = 0;
  state.screenShakeUntil = 0;
  state.screenShakeStrength = 0;
  player.x = 96;
  player.y = 340;
  cameraOffset = 0;
  cameraPanDir = 0;
  obstacles = [];
  activeTileMinX = 0;
  activeTileMaxX = VIEW_W;
  activePlayerTile = 0;
  lastTileIndex = null;
  player.hp = player.maxHp;
  player.facing = { x: 1, y: 0 };
  player.burstUntil = 0;
  player.ultimateSpeedUntil = 0;
  player.velX = 0;
  player.velY = 0;
  player._px = player.x;
  player._py = player.y;
  abilities.dash.nextReadyAt = 0;
  abilities.burst.nextReadyAt = 0;
  abilities.decoy.nextReadyAt = 0;
  abilities.random.type = null;
  abilities.random.ammo = 0;
  abilities.random.maxAmmo = 0;
  entities.hunters = [];
  entities.pickups = [];
  entities.decoys = [];
  entities.shields = [];
  entities.dangerZones = [];
  entities.bullets = [];
  entities.projectiles = [];
  entities.laserBeams = [];
  entities.attackRings = [];
  entities.damageRipples = [];
  entities.ultimateEffects = [];

  ensureTilesForPlayer();
  cameraX = clamp(player.x - VIEW_W / 2 + cameraOffset, activeTileMinX, activeTileMaxX - VIEW_W);
}

function playerMissingHealth01() {
  if (player.maxHp <= 0) return 0;
  return clamp(1 - player.hp / player.maxHp, 0, 1);
}

function playerSpeedHealthMultiplier() {
  // Slight "desperation" boost as HP gets low.
  return 1 + playerMissingHealth01() * 0.08;
}

function playerColorByHealth() {
  // Interpolate between blue and red (slight red tint when low HP).
  const t = playerMissingHealth01() * 0.65;
  const blue = { r: 0x60, g: 0xa5, b: 0xfa };
  const red = { r: 0xef, g: 0x44, b: 0x44 };
  const r = Math.round(blue.r + (red.r - blue.r) * t);
  const g = Math.round(blue.g + (red.g - blue.g) * t);
  const b = Math.round(blue.b + (red.b - blue.b) * t);
  return `rgb(${r},${g},${b})`;
}

function spawnAttackRing(x, y, r, color = "#fca5a5", duration = 0.18) {
  entities.attackRings.push({
    x,
    y,
    r,
    color,
    bornAt: state.elapsed,
    expiresAt: state.elapsed + duration,
  });
}

function spawnUltimateEffect(type, x, y, color, duration, radius) {
  entities.ultimateEffects.push({
    type,
    x,
    y,
    color,
    bornAt: state.elapsed,
    expiresAt: state.elapsed + duration,
    radius,
  });
}

function setSnapshotStatus(text) {
  snapshotStatus.textContent = text;
}

function makeSnapshotFilename() {
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  return `death-snapshots/escape-death-${String(state.deathCount).padStart(3, "0")}-${stamp}.png`;
}

function makeSnapshotBlob() {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

async function chooseSnapshotFolder() {
  if (!window.showDirectoryPicker) {
    setSnapshotStatus("Death screenshots: browser folder access unavailable, using downloads");
    return;
  }
  try {
    snapshotDirectoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    setSnapshotStatus("Death screenshots: saving to chosen folder");
  } catch (error) {
    setSnapshotStatus("Death screenshots: folder not chosen, using downloads");
  }
}

async function saveDeathSnapshot() {
  const blob = await makeSnapshotBlob();
  if (!blob) return;

  const filename = makeSnapshotFilename();
  const shortName = filename.split("/").pop();

  if (snapshotDirectoryHandle) {
    try {
      let targetDir = snapshotDirectoryHandle;
      try {
        targetDir = await snapshotDirectoryHandle.getDirectoryHandle("death-snapshots", { create: true });
      } catch (error) {
        targetDir = snapshotDirectoryHandle;
      }
      const fileHandle = await targetDir.getFileHandle(shortName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      setSnapshotStatus(`Death screenshots: saved ${shortName}`);
      return;
    } catch (error) {
      setSnapshotStatus("Death screenshots: folder save failed, using downloads");
      snapshotDirectoryHandle = null;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = shortName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSnapshotStatus(`Death screenshots: downloaded ${shortName}`);
}

function spawnHunter(type, customX, customY) {
  let r = 10;
  let life = 8;
  let lastShotAt = state.elapsed + rand(0.3, 1.1);
  const h = {
    type,
    x: 0,
    y: 0,
    r: 10,
    bornAt: state.elapsed,
    dieAt: state.elapsed + life,
    lastShotAt: 0,
    dir: { x: 1, y: 0 },
    hitLockUntil: 0,
  };

  if (type === "sniper") {
    r = 12;
    life = 8;
    lastShotAt = state.elapsed + rand(0.6, 1.2);
  } else if (type === "chaser") {
    r = 10;
    life = 8;
    lastShotAt = state.elapsed + rand(0.3, 1.1);
    h.chaserDashPhase = "chase";
    h.chaserDashNextReady = state.elapsed + rand(0.35, 1.0);
  } else if (type === "cutter") {
    r = 10;
    life = 8;
    lastShotAt = state.elapsed + rand(0.3, 1.1);
  } else if (type === "ranged") {
    r = 10;
    life = 8;
    lastShotAt = state.elapsed + rand(0.4, 1.0);
    h.shotInterval = 1.35;
    h.shotSpeed = 360;
  } else if (type === "laser") {
    r = 13;
    life = 8;
    lastShotAt = state.elapsed + rand(0.6, 1.2);
    h.laserState = "move";
    h.aimStartedAt = 0;
    h.nextLaserReadyAt = state.elapsed + rand(0.7, 1.4);
    h.laserCooldown = 1.0;
    h.laserWarning = 0.42;
    h.laserAim = null;
  } else if (type === "fast") {
    r = 9;
    life = 2;
    lastShotAt = state.elapsed + 999; // unused
  } else if (type === "spawner") {
    r = 18;
    life = 8;
    lastShotAt = state.elapsed + 999; // unused
    // Spawner behavior:
    // - 2 seconds "charging" with a visible clock
    // - then constant swarm spawning for the next 6 seconds
    h.spawnDelayUntil = state.elapsed + 2;
    h.spawnActiveUntil = state.elapsed + 8;
    h.nextSwarmAt = h.spawnDelayUntil; // spawn immediately when active
    h.swarmInterval = 0.6;
    h.swarmN = 5;
    h.fastR = 10;
  }

  h.r = r;
  h.life = life;
  h.dieAt = state.elapsed + life;
  h.lastShotAt = lastShotAt;

  if (customX != null && customY != null) {
    h.x = customX;
    h.y = customY;
    entities.hunters.push(h);
    return;
  }

  // Infinite X: spawn only from top/bottom edges on the currently cached 3 tiles.
  const tilePick = activePlayerTile + (Math.random() < 1 / 3 ? -1 : Math.random() < 0.5 ? 0 : 1);
  const edgeTop = Math.random() < 0.5;
  h.x = tilePick * TILE_W + rand(r + 10, TILE_W - r - 10);
  h.y = edgeTop ? r + 1 : world.h - r - 1;
  entities.hunters.push(h);
}

function pickRegularHunterType() {
  const roll = Math.random();
  if (roll < 0.25) return "chaser";
  if (roll < 0.44) return "cutter";
  if (roll < 0.61) return "sniper";
  if (roll < 0.78) return "ranged";
  if (roll < 0.93) return "laser";
  return "spawner";
}

function hunterRadiusForType(type) {
  return type === "sniper" ? 12 : type === "spawner" ? 18 : type === "laser" ? 13 : type === "fast" ? 9 : 10;
}

function scheduleWaveSpawns() {
  const jobs = [];
  const tiles = [activePlayerTile - 1, activePlayerTile, activePlayerTile + 1];
  for (const tileIdx of tiles) {
    for (let pair = 0; pair < 2; pair++) {
      const edgeTop = pair === 0;
      jobs.push(() => {
        const type = pickRegularHunterType();
        const r = hunterRadiusForType(type);
        const x = tileIdx * TILE_W + rand(r + 10, TILE_W - r - 10);
        const y = edgeTop ? r + 1 : world.h - r - 1;
        spawnHunter(type, x, y);
      });
    }
  }
  const sideYFractions = [0.22, 0.4, 0.6, 0.78];
  for (const side of [-1, 1]) {
    const tileIdx = activePlayerTile + side;
    for (const fy of sideYFractions) {
      jobs.push(() => {
        const type = pickRegularHunterType();
        const r = hunterRadiusForType(type);
        const x = side < 0 ? tileIdx * TILE_W + r + 1 : (tileIdx + 1) * TILE_W - r - 1;
        const y = clamp(world.h * fy, r + 4, world.h - r - 4);
        spawnHunter(type, x, y);
      });
    }
  }
  for (let i = jobs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = jobs[i];
    jobs[i] = jobs[j];
    jobs[j] = tmp;
  }
  const spread = state.spawnInterval * 0.88;
  const t0 = state.elapsed;
  const n = jobs.length;
  const slot = spread / n;
  for (let i = 0; i < n; i++) {
    const jitter = (Math.random() - 0.5) * slot * 0.5;
    const at = clamp(t0 + (i + 0.5) * slot + jitter, t0 + 0.04, t0 + spread);
    state.spawnScheduled.push({ at, fn: jobs[i] });
  }
  state.spawnScheduled.sort((a, b) => a.at - b.at);
}

function advanceSpawnWave() {
  state.wave += 1;
  state.spawnInterval = Math.max(2.5, state.spawnInterval * 0.88);
  state.nextSpawnAt = state.elapsed + state.spawnInterval;
  scheduleWaveSpawns();
}

function spawnPickup() {
  const point = randomOpenPoint(HEAL_PICKUP_HIT_R);
  entities.pickups.push({
    x: point.x,
    y: point.y,
    r: HEAL_PICKUP_HIT_R,
    plusHalf: HEAL_PICKUP_PLUS_HALF,
    plusThick: HEAL_PICKUP_ARM_THICK,
    expiresAt: state.elapsed + 6,
    life: 6,
    heal: 2,
  });
}

function tryDash() {
  const ability = abilities.dash;
  if (state.elapsed < ability.nextReadyAt || !state.running) return;
  ability.nextReadyAt = state.elapsed + ability.cooldown;
  const dir = player.facing;
  const step = 12;
  let tx = player.x;
  let ty = player.y;
  let progressed = false;
  for (let d = step; d <= 120; d += step) {
    const test = { x: player.x + dir.x * d, y: player.y + dir.y * d, r: player.r };
    if (outOfBoundsCircle(test)) break;
    if (collidesAnyObstacle(test)) continue;
    tx = test.x;
    ty = test.y;
    progressed = true;
  }
  if (progressed) {
    player.x = tx;
    player.y = ty;
  }
}

function tryBurst() {
  const ability = abilities.burst;
  if (state.elapsed < ability.nextReadyAt || !state.running) return;
  ability.nextReadyAt = state.elapsed + ability.cooldown;
  player.burstUntil = state.elapsed + ability.duration;
}

function tryDecoy() {
  const ability = abilities.decoy;
  if (state.elapsed < ability.nextReadyAt || !state.running) return;
  ability.nextReadyAt = state.elapsed + ability.cooldown;
  entities.decoys.push({
    x: player.x,
    y: player.y,
    r: player.r,
    hp: 3,
    invulnerableUntil: state.elapsed + 0.4,
    expiresAt: state.elapsed + 6,
  });
}

function grantRandomAbility() {
  const pool = ["shield", "burst", "timelock", "heal"];
  const prev = abilities.random.type;
  const choices = pool.filter((t) => t !== prev);
  const pickFrom = choices.length ? choices : pool;
  const next = pickFrom[Math.floor(Math.random() * pickFrom.length)];
  abilities.random.type = next;
  abilities.random.maxAmmo = next === "timelock" ? 3 : 1;
  abilities.random.ammo = abilities.random.maxAmmo;
  entities.shields = [];
}

function useRandomAbility() {
  const ability = abilities.random;
  if (!state.running || !ability.type || ability.ammo <= 0) return;
  if (ability.type === "burst" && state.elapsed < state.ultimatePushbackReadyAt) return;

  if (ability.type === "shield") {
    spawnAttackRing(player.x, player.y, player.r + 34, "#93c5fd", 0.28);
    spawnUltimateEffect("shieldSummon", player.x, player.y, "#93c5fd", 0.45, 56);
    entities.shields = [
      {
        angle: 0,
        radius: player.r + 22,
        r: 10,
      },
    ];
  } else if (ability.type === "burst") {
    const burstRadius = 140;
    player.ultimateSpeedUntil = state.elapsed + 5;
    spawnAttackRing(player.x, player.y, burstRadius, "#93c5fd", 0.22);
    spawnAttackRing(player.x, player.y, burstRadius * 0.7, "#bfdbfe", 0.18);
    spawnUltimateEffect("burstWave", player.x, player.y, "#93c5fd", 0.35, burstRadius);
    for (const h of entities.hunters) {
      const d2 = distSq(player, h);
      if (d2 > burstRadius * burstRadius) continue;
      const away = vectorToTarget(player, h);
      const push = h.type === "spawner" ? 0 : 95;
      const test = { x: h.x + away.x * push, y: h.y + away.y * push, r: h.r };
      if (!outOfBoundsCircle(test) && !collidesAnyObstacle(test)) {
        h.x = test.x;
        h.y = test.y;
      }
      h.dir.x = away.x;
      h.dir.y = away.y;
    }
    for (let i = entities.projectiles.length - 1; i >= 0; i--) {
      if (distSq(player, entities.projectiles[i]) <= burstRadius * burstRadius) {
        entities.projectiles.splice(i, 1);
      }
    }
    state.ultimatePushbackReadyAt = state.elapsed + 8;
  } else if (ability.type === "timelock") {
    state.playerTimelockUntil = Math.max(state.playerTimelockUntil, state.elapsed + 2);
    state.playerInvulnerableUntil = Math.max(state.playerInvulnerableUntil, state.elapsed + 3);
    spawnAttackRing(player.x, player.y, player.r + 24, "#c084fc", 0.3);
    spawnAttackRing(player.x, player.y, player.r + 46, "#e9d5ff", 0.36);
    spawnUltimateEffect("timelock", player.x, player.y, "#c084fc", 3, 40);
  } else if (ability.type === "heal") {
    state.tempHp = 2;
    state.tempHpExpiry = state.elapsed + 20;
    spawnAttackRing(player.x, player.y, player.r + 26, "#4ade80", 0.26);
    spawnAttackRing(player.x, player.y, player.r + 44, "#bbf7d0", 0.32);
    spawnUltimateEffect("healVitality", player.x, player.y, "#34d399", 0.5, 48);
  }

  ability.ammo -= 1;
}

function nearestDecoy(from) {
  if (!entities.decoys.length) return null;
  let best = null;
  let bestDist = Infinity;
  for (const d of entities.decoys) {
    const score = distSq(from, d);
    if (score < bestDist) {
      bestDist = score;
      best = d;
    }
  }
  return best;
}

function pickTargetForHunter(hunter) {
  let target = player;
  if (!entities.decoys.length) return target;
  if (hunter.type === "chaser" || hunter.type === "fast") {
    return nearestDecoy(hunter) || target;
  }
  if (hunter.type === "cutter") {
    const decoy = nearestDecoy(hunter);
    if (decoy && distSq(hunter, decoy) < 240 * 240) return decoy;
  }
  return target;
}

function vectorToTarget(from, target) {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function avoidObstacles(hunter, desired) {
  const lookAhead = 30;
  const sample = {
    x: hunter.x + desired.x * lookAhead,
    y: hunter.y + desired.y * lookAhead,
    r: hunter.r,
  };
  if (!collidesAnyObstacle(sample)) return desired;
  let ax = 0;
  let ay = 0;
  for (const obstacle of obstacles) {
    const closestX = clamp(hunter.x, obstacle.x, obstacle.x + obstacle.w);
    const closestY = clamp(hunter.y, obstacle.y, obstacle.y + obstacle.h);
    const awayX = hunter.x - closestX;
    const awayY = hunter.y - closestY;
    const dist = Math.hypot(awayX, awayY) || 1;
    const influence = 1 / Math.max(25, dist);
    ax += (awayX / dist) * influence;
    ay += (awayY / dist) * influence;
  }
  const mixX = desired.x * 0.65 + ax * 35;
  const mixY = desired.y * 0.65 + ay * 35;
  const len = Math.hypot(mixX, mixY) || 1;
  return { x: mixX / len, y: mixY / len };
}

function moveHunters(dt) {
  for (const h of entities.hunters) {
    if (h.type === "spawner") continue; // immobile

    const lifeSpan = h.life || Math.max(0.0001, h.dieAt - h.bornAt);
    const age = clamp((state.elapsed - h.bornAt) / lifeSpan, 0, 1);
    const speedFactor = 1 + age * 1.2;
    const baseSpeed =
      h.type === "sniper"
        ? 100
        : h.type === "cutter"
          ? 116
          : h.type === "laser"
            ? 138
          : h.type === "ranged"
            ? 85
            : h.type === "fast"
              ? 150
              : 110;
    const speed = baseSpeed * speedFactor;

    let desired;
    if (h.type === "cutter") {
      const target = pickTargetForHunter(h);
      const lead = 58;
      if (target === player) {
        const px = player.x + player.facing.x * lead;
        const py = player.y + player.facing.y * lead;
        desired = vectorToTarget(h, { x: px, y: py });
      } else {
        desired = vectorToTarget(h, target);
      }
    } else if (h.type === "sniper") {
      const target = nearestDecoy(h) || player;
      const away = vectorToTarget(target, h);
      const toward = vectorToTarget(h, target);
      const d2 = distSq(h, target);
      desired = d2 < 210 * 210 ? away : toward;
    } else if (h.type === "ranged") {
      const target = nearestDecoy(h) || player;
      const d2 = distSq(h, target);
      const away = vectorToTarget(target, h);
      const toward = vectorToTarget(h, target);
      desired = d2 < 240 * 240 ? away : toward;
    } else if (h.type === "laser") {
      const target = nearestDecoy(h) || player;
      const los = hasLineOfSight(h, target);

      if (h.laserState === "aim") {
        if (state.elapsed >= h.aimStartedAt + h.laserWarning) {
          const aim = h.laserAim;
          if (!aim) {
            h.laserState = "move";
            h.nextLaserReadyAt = state.elapsed + h.laserCooldown;
            continue;
          }
          entities.laserBeams.push({
            x1: aim.x1,
            y1: aim.y1,
            x2: aim.x2,
            y2: aim.y2,
            bornAt: state.elapsed,
            expiresAt: state.elapsed + 0.5,
            warning: false,
            active: true,
          });
          spawnAttackRing(h.x, h.y, h.r + 9, "#ef4444", 0.16);
          if (!hitDecoyAlongSegment(aim.x1, aim.y1, aim.x2, aim.y2, 5)) {
            const hitDist = pointToSegmentDistance(player.x, player.y, aim.x1, aim.y1, aim.x2, aim.y2);
            if (hitDist <= player.r + 5) damagePlayer(2);
          }
          h.laserState = "move";
          h.laserAim = null;
          h.nextLaserReadyAt = state.elapsed + h.laserCooldown;
        }
        continue;
      }

      if (los && state.elapsed >= h.nextLaserReadyAt) {
        const aimDirX = target.x - h.x;
        const aimDirY = target.y - h.y;
        const endpoint = getLaserEndpoint(h.x, h.y, aimDirX, aimDirY);
        h.laserAim = { x1: h.x, y1: h.y, x2: endpoint.x, y2: endpoint.y };
        h.laserState = "aim";
        h.aimStartedAt = state.elapsed;
        entities.laserBeams.push({
          x1: h.laserAim.x1,
          y1: h.laserAim.y1,
          x2: h.laserAim.x2,
          y2: h.laserAim.y2,
          bornAt: state.elapsed,
          expiresAt: state.elapsed + h.laserWarning,
          warning: true,
          active: false,
        });
        continue;
      }

      const d2 = distSq(h, target);
      const away = vectorToTarget(target, h);
      const toward = vectorToTarget(h, target);
      desired = d2 < 200 * 200 ? away : toward;
    } else if (h.type === "chaser") {
      const target = pickTargetForHunter(h);
      const toT = vectorToTarget(h, target);
      const dist = Math.hypot(target.x - h.x, target.y - h.y);

      if (h.chaserDashPhase === "windup") {
        h.dir.x = toT.x;
        h.dir.y = toT.y;
        if (state.elapsed >= h.chaserDashWindupEnd) {
          h.chaserDashPhase = "dashing";
          h.chaserDashDir = { x: toT.x, y: toT.y };
          h.chaserDashDist = 124;
          spawnAttackRing(h.x, h.y, h.r + 9, "#fecaca", 0.14);
        } else {
          continue;
        }
      }

      if (h.chaserDashPhase === "dashing") {
        const dashSpeed = 405 * speedFactor;
        const stepLen = Math.min(dashSpeed * dt, 24);
        const nx = h.x + h.chaserDashDir.x * stepLen;
        const ny = h.y + h.chaserDashDir.y * stepLen;
        const test = { x: nx, y: ny, r: h.r };
        if (outOfBoundsCircle(test) || collidesAnyObstacle(test)) {
          h.chaserDashPhase = "chase";
          h.chaserDashNextReady = state.elapsed + rand(1.45, 2.05);
        } else {
          h.x = nx;
          h.y = ny;
          h.chaserDashDist -= stepLen;
          if (h.chaserDashDist <= 0) {
            h.chaserDashPhase = "chase";
            h.chaserDashNextReady = state.elapsed + rand(1.45, 2.05);
          }
        }
        continue;
      }

      desired = vectorToTarget(h, target);
      const canDash = state.elapsed >= (h.chaserDashNextReady ?? 0);
      if (h.chaserDashPhase === "chase" && canDash && dist <= 168 && dist >= 36 && hasLineOfSight(h, target)) {
        h.chaserDashPhase = "windup";
        h.chaserDashWindupEnd = state.elapsed + 0.1;
        h.dir.x = toT.x;
        h.dir.y = toT.y;
        spawnAttackRing(h.x, h.y, h.r + 4, "#fca5a5", 0.09);
        continue;
      }
    } else {
      const target = pickTargetForHunter(h);
      desired = vectorToTarget(h, target);
    }
    const steer = avoidObstacles(h, desired);
    h.dir.x = h.dir.x * 0.74 + steer.x * 0.26;
    h.dir.y = h.dir.y * 0.74 + steer.y * 0.26;
    const dlen = Math.hypot(h.dir.x, h.dir.y) || 1;
    h.dir.x /= dlen;
    h.dir.y /= dlen;
    moveCircleWithCollisions(h, h.dir.x * speed, h.dir.y * speed, dt);
  }
}

function updateRangedAttackers(dt) {
  for (const h of entities.hunters) {
    if (h.type !== "ranged") continue;
    if (state.elapsed - h.lastShotAt < h.shotInterval) continue;
    h.lastShotAt = state.elapsed;

    spawnAttackRing(h.x, h.y, h.r + 7, "#fb923c", 0.14);

    const target = nearestDecoy(h) || player;

    const to = vectorToTarget(h, target);
    const speed = h.shotSpeed || 360;
    entities.projectiles.push({
      x: h.x,
      y: h.y,
      vx: to.x * speed,
      vy: to.y * speed,
      r: 3,
      bornAt: state.elapsed,
      life: 1.25,
      damage: 1,
    });
  }

  for (let i = entities.projectiles.length - 1; i >= 0; i--) {
    const p = entities.projectiles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    const circle = { x: p.x, y: p.y, r: p.r };
    if (state.elapsed - p.bornAt > p.life || outOfBoundsCircle(circle) || collidesAnyObstacle(circle)) {
      entities.projectiles.splice(i, 1);
      continue;
    }

    if (hitDecoyIfAny(p, p.r)) {
      spawnAttackRing(p.x, p.y, p.r + 7, "#fca5a5", 0.12);
      entities.projectiles.splice(i, 1);
      continue;
    }

    const rr = p.r + player.r;
    if (distSq(p, player) <= rr * rr) {
      spawnAttackRing(p.x, p.y, p.r + 10, "#fca5a5", 0.18);
      damagePlayer(p.damage || 1);
      entities.projectiles.splice(i, 1);
    }
  }
}

function updateSpawners(dt) {
  for (const h of entities.hunters) {
    if (h.type !== "spawner") continue;
    if (state.elapsed < h.spawnDelayUntil) continue;
    if (state.elapsed >= h.spawnActiveUntil) continue;
    if (state.elapsed < h.nextSwarmAt) continue;

    // If the framerate hiccups, catch up by spawning at most a few times.
    let safety = 0;
    while (state.elapsed >= h.nextSwarmAt && safety < 4) {
      h.nextSwarmAt += h.swarmInterval;
      safety++;

      spawnAttackRing(h.x, h.y, h.r + 12, "#fb7185", 0.12);

      const fastR = h.fastR || 10;
      const swarmN = h.swarmN || 5;
      for (let i = 0; i < swarmN; i++) {
        const open = randomOpenPointAround(h.x, h.y, h.r + 16, h.r + 34, fastR, 25);
        spawnHunter("fast", open.x, open.y);
      }
    }
  }
}

function clearTempHp() {
  state.tempHp = 0;
  state.tempHpExpiry = 0;
}

function hitDecoyIfAny(source, range) {
  for (let i = entities.decoys.length - 1; i >= 0; i--) {
    const d = entities.decoys[i];
    const rr = range + d.r;
    if (distSq(source, d) <= rr * rr) {
      if (state.elapsed < d.invulnerableUntil) return true;
      d.hp -= 1;
      if (d.hp <= 0) entities.decoys.splice(i, 1);
      return true;
    }
  }
  return false;
}

function damagePlayer(amount) {
  if (!state.running) return;
  if (state.elapsed < state.playerInvulnerableUntil) return;
  if (amount <= 0) return;
  let rem = amount;
  if (state.tempHp > 0) {
    const absorbed = Math.min(rem, state.tempHp);
    state.tempHp -= absorbed;
    rem -= absorbed;
    if (state.tempHp <= 0) clearTempHp();
  }
  if (rem > 0) player.hp = Math.max(0, player.hp - rem);
  state.hurtFlash = 0.16;
  state.playerInvulnerableUntil = state.elapsed + 0.35;
  state.screenShakeUntil = state.elapsed + 0.18;
  state.screenShakeStrength = 8;
  entities.damageRipples.push({
    x: player.x,
    y: player.y,
    bornAt: state.elapsed,
    expiresAt: state.elapsed + 0.22,
  });
  state.damageEvents.push({ t: state.elapsed, amount, hpAfter: player.hp });
  if (player.hp <= 0) {
    state.deathCount += 1;
    state.snapshotPending = true;
    state.running = false;
    state.bestSurvival = Math.max(state.bestSurvival, state.elapsed);
  }
}

function updateSnipers(dt) {
  for (const h of entities.hunters) {
    if (h.type !== "sniper") continue;
    if (state.elapsed - h.lastShotAt < 2.1) continue;
    h.lastShotAt = state.elapsed;
    spawnAttackRing(h.x, h.y, h.r + 6, "#fb7185", 0.2);
    const target = nearestDecoy(h) || player;
    const windup = SNIPER_ARTILLERY_WINDUP;
    const leadT = windup * SNIPER_ARTILLERY_LEAD;
    const tvx = target === player ? player.velX : 0;
    const tvy = target === player ? player.velY : 0;
    let aimX = target.x + tvx * leadT + rand(-12, 12);
    let aimY = target.y + tvy * leadT + rand(-12, 12);
    aimX = clamp(aimX, activeTileMinX + 40, activeTileMaxX - 40);
    aimY = clamp(aimY, 32, world.h - 32);
    entities.dangerZones.push({
      x: aimX,
      y: aimY,
      r: 28,
      bornAt: state.elapsed,
      detonateAt: state.elapsed + windup,
      windup,
      exploded: false,
    });
    const dist = Math.hypot(aimX - h.x, aimY - h.y) || 1;
    entities.bullets.push({
      x: h.x,
      y: h.y,
      tx: aimX,
      ty: aimY,
      bornAt: state.elapsed,
      life: clamp(0.14 + dist / 2200, 0.16, 0.32),
    });
  }

  for (let i = entities.bullets.length - 1; i >= 0; i--) {
    const b = entities.bullets[i];
    if (state.elapsed - b.bornAt > b.life) entities.bullets.splice(i, 1);
  }

  for (let i = entities.dangerZones.length - 1; i >= 0; i--) {
    const zone = entities.dangerZones[i];
    if (!zone.exploded && state.elapsed >= zone.detonateAt) {
      zone.exploded = true;
      if (!hitDecoyIfAny(zone, zone.r)) {
        const rr = zone.r + player.r;
        if (distSq(zone, player) <= rr * rr) damagePlayer(2);
      }
    }
    const zu = zone.windup != null ? zone.windup : 0.8;
    if (state.elapsed - zone.bornAt > zu + 0.48) entities.dangerZones.splice(i, 1);
  }
}

function updateCollisions() {
  for (const h of entities.hunters) {
    if (state.elapsed < h.hitLockUntil) continue;
    if (hitDecoyIfAny(h, h.r + 2)) {
      spawnAttackRing(h.x, h.y, h.r + 7, "#fca5a5", 0.14);
      h.hitLockUntil = state.elapsed + state.enemyHitCooldown;
      continue;
    }
    const rr = h.r + player.r;
    if (distSq(h, player) <= rr * rr) {
      spawnAttackRing(h.x, h.y, h.r + 7, "#fca5a5", 0.14);
      damagePlayer(1);
      h.hitLockUntil = state.elapsed + state.enemyHitCooldown;
    }
  }

  for (let i = entities.pickups.length - 1; i >= 0; i--) {
    const p = entities.pickups[i];
    if (state.elapsed >= p.expiresAt) {
      entities.pickups.splice(i, 1);
      continue;
    }
    const rr = p.r + player.r;
    if (distSq(p, player) <= rr * rr) {
      clearTempHp();
      player.hp = Math.min(player.maxHp, player.hp + p.heal);
      // Heal pickup slightly refreshes ability cooldowns.
      const refreshFactor = 0.8; // 20% shorter remaining cooldown
      for (const ability of [abilities.dash, abilities.burst, abilities.decoy]) {
        const remaining = ability.nextReadyAt - state.elapsed;
        if (remaining > 0) ability.nextReadyAt = state.elapsed + remaining * refreshFactor;
      }
      grantRandomAbility();
      entities.pickups.splice(i, 1);
    }
  }
}

function cdr(ability) {
  return Math.max(0, ability.nextReadyAt - state.elapsed);
}

function updateSpecialAbilityEffects(dt) {
  for (const shield of entities.shields) {
    shield.angle += dt * 3.8;
    shield.x = player.x + Math.cos(shield.angle) * shield.radius;
    shield.y = player.y + Math.sin(shield.angle) * shield.radius;
  }

  for (const shield of entities.shields) {
    for (const h of entities.hunters) {
      if (h.type === "spawner") continue;
      const rr = shield.r + h.r;
      if (distSq(shield, h) > rr * rr) continue;
      const away = vectorToTarget(player, h);
      const test = { x: h.x + away.x * 28, y: h.y + away.y * 28, r: h.r };
      if (!outOfBoundsCircle(test) && !collidesAnyObstacle(test)) {
        h.x = test.x;
        h.y = test.y;
      }
      h.dir.x = away.x;
      h.dir.y = away.y;
    }
  }

  for (let i = entities.projectiles.length - 1; i >= 0; i--) {
    const p = entities.projectiles[i];
    let blocked = false;
    for (const shield of entities.shields) {
      const rr = shield.r + p.r;
      if (distSq(shield, p) <= rr * rr) {
        blocked = true;
        spawnAttackRing(shield.x, shield.y, shield.r + 6, "#93c5fd", 0.1);
        break;
      }
    }
    if (blocked) entities.projectiles.splice(i, 1);
  }

  for (let i = entities.bullets.length - 1; i >= 0; i--) {
    const b = entities.bullets[i];
    const life = clamp((state.elapsed - b.bornAt) / b.life, 0, 1);
    const x = b.x + (b.tx - b.x) * life;
    const y = b.y + (b.ty - b.y) * life;
    for (const shield of entities.shields) {
      const rr = shield.r + 3;
      if (distSq({ x, y }, shield) <= rr * rr) {
        entities.bullets.splice(i, 1);
        break;
      }
    }
  }
}

function updateLaserHazards() {
  for (const beam of entities.laserBeams) {
    if (beam.warning || !beam.active) continue;
    if (!hitDecoyAlongSegment(beam.x1, beam.y1, beam.x2, beam.y2, 5)) {
      const hitDist = pointToSegmentDistance(player.x, player.y, beam.x1, beam.y1, beam.x2, beam.y2);
      if (hitDist <= player.r + 5) damagePlayer(2);
    }
  }
}

function update(dt) {
  if (!state.running) return;
  state.elapsed += dt;
  state.hurtFlash = Math.max(0, state.hurtFlash - dt);
  state.screenShakeStrength = Math.max(0, state.screenShakeStrength - dt * 30);
  if (state.elapsed >= state.playerTimelockUntil) state.playerTimelockUntil = 0;
  if (state.tempHp > 0 && state.tempHpExpiry > 0 && state.elapsed >= state.tempHpExpiry) clearTempHp();

  cameraOffset += cameraPanDir * CAMERA_PAN_SPEED * dt;
  // Ensure procedural tiles + obstacle cache are valid for the player.
  ensureTilesForPlayer();
  cameraX = clamp(player.x - VIEW_W / 2 + cameraOffset, activeTileMinX, activeTileMaxX - VIEW_W);
  // Keep cameraOffset consistent with cameraX clamping.
  cameraOffset = cameraX - (player.x - VIEW_W / 2);

  while (state.spawnScheduled.length && state.spawnScheduled[0].at <= state.elapsed) {
    state.spawnScheduled.shift().fn();
  }
  if (state.elapsed >= state.nextSpawnAt) advanceSpawnWave();
  if (state.elapsed >= state.nextPickupAt) {
    spawnPickup();
    state.nextPickupAt = state.elapsed + 6;
  }

  for (let i = entities.hunters.length - 1; i >= 0; i--) {
    if (state.elapsed >= entities.hunters[i].dieAt) entities.hunters.splice(i, 1);
  }
  for (let i = entities.decoys.length - 1; i >= 0; i--) {
    if (state.elapsed >= entities.decoys[i].expiresAt) entities.decoys.splice(i, 1);
  }
  for (let i = entities.attackRings.length - 1; i >= 0; i--) {
    if (state.elapsed >= entities.attackRings[i].expiresAt) entities.attackRings.splice(i, 1);
  }
  for (let i = entities.damageRipples.length - 1; i >= 0; i--) {
    if (state.elapsed >= entities.damageRipples[i].expiresAt) entities.damageRipples.splice(i, 1);
  }
  for (let i = entities.ultimateEffects.length - 1; i >= 0; i--) {
    if (state.elapsed >= entities.ultimateEffects[i].expiresAt) entities.ultimateEffects.splice(i, 1);
  }
  for (let i = entities.laserBeams.length - 1; i >= 0; i--) {
    if (state.elapsed >= entities.laserBeams[i].expiresAt) entities.laserBeams.splice(i, 1);
  }

  let mx = 0;
  let my = 0;
  if (state.keys.has("arrowleft")) mx -= 1;
  if (state.keys.has("arrowright")) mx += 1;
  if (state.keys.has("arrowup")) my -= 1;
  if (state.keys.has("arrowdown")) my += 1;
  if (mx || my) {
    const mlen = Math.hypot(mx, my);
    mx /= mlen;
    my /= mlen;
    player.facing.x = mx;
    player.facing.y = my;
  }

  if (state.playerTimelockUntil > 0) {
    mx = 0;
    my = 0;
  }

  const wBurstMult = state.elapsed < player.burstUntil ? 2 : 1;
  const ultSpeedMult = state.elapsed < player.ultimateSpeedUntil ? 1.75 : 1;
  const speedMult = Math.max(wBurstMult, ultSpeedMult);
  const effectiveSpeed = player.speed * speedMult * playerSpeedHealthMultiplier();
  moveCircleWithCollisions(player, mx * effectiveSpeed, my * effectiveSpeed, dt);
  updatePlayerVelocity(dt);
  moveHunters(dt);
  updateSnipers(dt);
  updateRangedAttackers(dt);
  updateSpawners(dt);
  updateSpecialAbilityEffects(dt);
  updateLaserHazards();
  updateCollisions();
}

function drawHud() {
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "15px Arial";
  ctx.fillText("Survival: " + state.elapsed.toFixed(1) + "s", 14, 22);
  ctx.fillText("Best: " + state.bestSurvival.toFixed(1) + "s", 14, 42);
  ctx.fillText("Wave: " + state.wave, 14, 62);
  ctx.fillText("Hunters: " + entities.hunters.length, 14, 82);
  ctx.fillText(
    "HP: " + player.hp + "/" + player.maxHp + (state.tempHp > 0 ? "  +" + state.tempHp + " temp" : ""),
    14,
    102
  );

  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Q Dash " + cdr(abilities.dash).toFixed(1), 560, 22);
  ctx.fillText("W Burst " + cdr(abilities.burst).toFixed(1), 560, 42);
  ctx.fillText("E Decoy " + cdr(abilities.decoy).toFixed(1), 560, 62);
  let rLabel = "R None 0/0";
  if (abilities.random.type) {
    const name = abilities.random.type[0].toUpperCase() + abilities.random.type.slice(1);
    let extra = "";
    if (abilities.random.type === "burst" && state.elapsed < state.ultimatePushbackReadyAt) {
      extra = " " + Math.max(0, state.ultimatePushbackReadyAt - state.elapsed).toFixed(1) + "s";
    }
    rLabel =
      "R " + name + " " + abilities.random.ammo + "/" + abilities.random.maxAmmo + extra;
  }
  ctx.fillText(rLabel, 560, 82);
}

function render() {
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, world.w, world.h);
  const shake =
    state.elapsed < state.screenShakeUntil
      ? {
          x: (Math.random() * 2 - 1) * state.screenShakeStrength,
          y: (Math.random() * 2 - 1) * state.screenShakeStrength,
        }
      : { x: 0, y: 0 };
  ctx.save();
  ctx.translate(-cameraX + shake.x, shake.y);
  drawObstacles(ctx, obstacles);

  for (const p of entities.pickups) {
    drawHealPickup(ctx, p, state.elapsed);
    const lifeLeft = clamp((p.expiresAt - state.elapsed) / (p.life || 0.001), 0, 1);
    const barW = 34;
    const barH = 4;
    const bx = p.x - barW / 2;
    const by = p.y + (p.plusHalf ?? HEAL_PICKUP_PLUS_HALF) + 12;
    ctx.fillStyle = "rgba(148, 163, 184, 0.32)";
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = lifeLeft > 0.35 ? "#22c55e" : "#ef4444";
    ctx.fillRect(bx, by, barW * lifeLeft, barH);
  }
  for (const d of entities.decoys) drawCircle(ctx, d.x, d.y, d.r, "#a78bfa", 0.65);

  for (const zone of entities.dangerZones) {
    const zu = zone.windup != null ? zone.windup : 0.8;
    const life = clamp((state.elapsed - zone.bornAt) / zu, 0, 1);
    const pulse = 1 + Math.sin(state.elapsed * 20) * 0.08;
    const radius = zone.r * pulse;
    drawCircle(ctx, zone.x, zone.y, radius, zone.exploded ? "#f43f5e" : "#ef4444", 0.25 + life * 0.4);
    ctx.strokeStyle = "#f87171";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, radius, 0, TAU);
    ctx.stroke();
  }

  for (const b of entities.bullets) {
    const life = clamp((state.elapsed - b.bornAt) / b.life, 0, 1);
    const x = b.x + (b.tx - b.x) * life;
    const y = b.y + (b.ty - b.y) * life;
    drawCircle(ctx, x, y, 2, "#fca5a5");
  }

  for (const p of entities.projectiles) {
    drawCircle(ctx, p.x, p.y, p.r, "#f59e0b");
  }

  for (const fx of entities.ultimateEffects) {
    const t = clamp((state.elapsed - fx.bornAt) / Math.max(0.001, fx.expiresAt - fx.bornAt), 0, 1);
    if (fx.type === "burstWave") {
      const rr = fx.radius * (0.25 + t * 0.9);
      ctx.strokeStyle = `rgba(147, 197, 253, ${0.85 * (1 - t)})`;
      ctx.lineWidth = 10 - t * 6;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, rr, 0, TAU);
      ctx.stroke();
    } else if (fx.type === "shieldSummon") {
      const rr = fx.radius * (0.35 + t * 0.85);
      drawCircle(ctx, fx.x, fx.y, rr, fx.color, 0.16 * (1 - t));
      ctx.strokeStyle = `rgba(191, 219, 254, ${0.9 * (1 - t)})`;
      ctx.lineWidth = 6 - t * 3;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, rr, 0, TAU);
      ctx.stroke();
    } else if (fx.type === "timelock") {
      const pulse = 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(state.elapsed * 12));
      const rr = fx.radius + pulse * 10;
      drawCircle(ctx, fx.x, fx.y, rr, fx.color, 0.08);
      ctx.strokeStyle = `rgba(192, 132, 252, ${0.32 + 0.18 * pulse})`;
      ctx.lineWidth = 4 + pulse * 3;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, rr, 0, TAU);
      ctx.stroke();
    } else if (fx.type === "healVitality") {
      const pulse = 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(state.elapsed * 14));
      const rr = fx.radius * (0.4 + t * 0.75);
      drawCircle(ctx, fx.x, fx.y, rr, fx.color, 0.12 * (1 - t));
      ctx.strokeStyle = `rgba(52, 211, 153, ${0.55 * (1 - t)})`;
      ctx.lineWidth = 5 - t * 2.5;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, rr, 0, TAU);
      ctx.stroke();
    }
  }

  for (const shield of entities.shields) {
    ctx.strokeStyle = "rgba(147, 197, 253, 0.28)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, player.y, shield.radius, 0, TAU);
    ctx.stroke();
    drawCircle(ctx, shield.x, shield.y, shield.r + 7, "#bfdbfe", 0.22);
    drawCircle(ctx, shield.x, shield.y, shield.r, "#93c5fd", 0.98);
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(shield.x, shield.y, shield.r + 1.5, 0, TAU);
    ctx.stroke();
  }

  for (const beam of entities.laserBeams) {
    if (beam.warning) {
      const t = clamp(
        (state.elapsed - beam.bornAt) / Math.max(0.001, beam.expiresAt - beam.bornAt),
        0,
        1
      );
      const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(state.elapsed * 30));
      ctx.strokeStyle = `rgba(248, 113, 113, ${0.35 + 0.55 * pulse})`;
      ctx.lineWidth = 3 + pulse * 6;
      ctx.setLineDash([18, 10]);
      ctx.lineDashOffset = -state.elapsed * 140;
    } else {
      ctx.strokeStyle = "rgba(239, 68, 68, 0.95)";
      ctx.lineWidth = 6;
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.moveTo(beam.x1, beam.y1);
    ctx.lineTo(beam.x2, beam.y2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Spawner charging animation: large translucent clock at spawner position.
  for (const h of entities.hunters) {
    if (h.type !== "spawner") continue;
    if (state.elapsed >= h.spawnDelayUntil) continue;

    const delayTotal = 2;
    const elapsedSinceBorn = state.elapsed - h.bornAt;
    const progress = clamp(elapsedSinceBorn / delayTotal, 0, 1);
    const remaining = 1 - progress;

    const clockR = h.r + 28 + remaining * 6;
    const pulse = 1 + Math.sin(state.elapsed * 10) * 0.04;
    const alpha = 0.10 + remaining * 0.18;

    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#fb7185";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, clockR * pulse, 0, TAU);
    ctx.stroke();

    // Clock hands (one rotates fast as the countdown approaches).
    ctx.strokeStyle = "#f43f5e";
    ctx.lineWidth = 4;
    ctx.beginPath();

    const a1 = -Math.PI / 2 + progress * TAU * 0.9;
    const a2 = -Math.PI / 2 + progress * TAU * 0.35;

    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a1) * clockR * 0.68, Math.sin(a1) * clockR * 0.68);
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a2) * clockR * 0.45, Math.sin(a2) * clockR * 0.45);
    ctx.stroke();
    ctx.restore();
  }

  for (const h of entities.hunters) {
    const color =
      h.type === "chaser"
        ? "#ef4444"
        : h.type === "cutter"
          ? "#f59e0b"
          : h.type === "sniper"
            ? "#fb7185"
            : h.type === "laser"
              ? "#f87171"
            : h.type === "spawner"
              ? "#f43f5e"
            : h.type === "ranged"
              ? "#38bdf8"
              : h.type === "fast"
                ? "#f97316"
                : "#a78bfa";
    drawCircle(ctx, h.x, h.y, h.r, color);
  }
  for (const h of entities.hunters) {
    const total = h.life || Math.max(0.0001, h.dieAt - h.bornAt);
    const lifeLeft = clamp((h.dieAt - state.elapsed) / total, 0, 1);
    const barW = h.r * 2.4;
    const barH = 4;
    const x = h.x - barW / 2;
    const y = h.y + h.r + 8;
    ctx.fillStyle = "rgba(148, 163, 184, 0.35)";
    ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = lifeLeft > 0.35 ? "#22c55e" : "#ef4444";
    ctx.fillRect(x, y, barW * lifeLeft, barH);
  }
  for (const ring of entities.attackRings) {
    const t = clamp((state.elapsed - ring.bornAt) / Math.max(0.001, ring.expiresAt - ring.bornAt), 0, 1);
    const rr = ring.r * (1 + t * 0.28);
    ctx.strokeStyle = ring.color;
    ctx.globalAlpha = 0.85 * (1 - t);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, rr, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const playerInvuln =
    state.elapsed < state.playerInvulnerableUntil
      ? 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(state.elapsed * 32))
      : 1;
  drawCircle(ctx, player.x, player.y, player.r, playerColorByHealth(), playerInvuln);
  if (state.playerTimelockUntil > 0) {
    const timePulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(state.elapsed * 14));
    drawCircle(ctx, player.x, player.y, player.r + 10 + timePulse * 4, "#c084fc", 0.18);
    ctx.strokeStyle = `rgba(233, 213, 255, ${0.55 + 0.2 * timePulse})`;
    ctx.lineWidth = 3 + timePulse * 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 14 + timePulse * 5, 0, TAU);
    ctx.stroke();
  } else if (state.tempHp > 0) {
    const p = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(state.elapsed * 10));
    ctx.strokeStyle = `rgba(52, 211, 153, ${0.35 + 0.25 * p})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 7 + p * 3, 0, TAU);
    ctx.stroke();
  }
  for (const ripple of entities.damageRipples) {
    const t = clamp(
      (state.elapsed - ripple.bornAt) / Math.max(0.001, ripple.expiresAt - ripple.bornAt),
      0,
      1
    );
    const rr = player.r + 3 + t * 17;
    ctx.strokeStyle = "#f43f5e";
    ctx.globalAlpha = 0.75 * (1 - t);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ripple.x, ripple.y, rr, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (state.elapsed < player.burstUntil) {
    drawCircle(ctx, player.x, player.y, player.r + 4, "#22d3ee", 0.3 * playerInvuln);
  } else if (state.elapsed < player.ultimateSpeedUntil) {
    drawCircle(ctx, player.x, player.y, player.r + 5, "#fde68a", 0.28 * playerInvuln);
  }

  ctx.restore();
  if (state.hurtFlash > 0) {
    ctx.fillStyle = "rgba(220, 38, 38, 0.24)";
    ctx.fillRect(0, 0, world.w, world.h);
  }

  if (state.snapshotPending) {
    state.snapshotPending = false;
    queueMicrotask(() => {
      saveDeathSnapshot().catch(() => {
        setSnapshotStatus("Death screenshots: save failed");
      });
    });
  }

  drawHud();

  if (!state.running) {
    ctx.fillStyle = "rgba(2, 6, 23, 0.72)";
    ctx.fillRect(0, 0, world.w, world.h);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 34px Arial";
    ctx.fillText("You Died", world.w / 2 - 76, world.h / 2 - 20);
    ctx.font = "18px Arial";
    ctx.fillText("Press R to restart", world.w / 2 - 76, world.h / 2 + 18);
  }
}

function loop(ts) {
  if (!state.lastTime) state.lastTime = ts;
  const dt = Math.min((ts - state.lastTime) / 1000, 0.033);
  state.lastTime = ts;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

function onAbilityKey(key) {
  if (key === abilities.dash.key) tryDash();
  if (key === abilities.burst.key) tryBurst();
  if (key === abilities.decoy.key) tryDecoy();
  if (key === abilities.random.key) useRandomAbility();
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (key.startsWith("arrow")) state.keys.add(key);
  if (key === "a") cameraPanDir = -1;
  if (key === "d") cameraPanDir = 1;
  if (key === "s") cameraOffset = 0;
  onAbilityKey(key);
  if (key === "r" && !state.running) resetGame();
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  if (key.startsWith("arrow")) state.keys.delete(key);
  if (key === "a" || key === "d") cameraPanDir = 0;
});

snapshotFolderButton.addEventListener("click", () => {
  chooseSnapshotFolder();
});

resetGame();
requestAnimationFrame(loop);
    
}
