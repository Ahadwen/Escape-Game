import {
  TAU,
  TILE_W,
  BLOCK,
  HEAL_PICKUP_HIT_R,
  HEAL_PICKUP_PLUS_HALF,
  HEAL_PICKUP_ARM_THICK,
  SNIPER_ARTILLERY_WINDUP,
  SNIPER_ARTILLERY_LEAD,
  SNIPER_ARTILLERY_BANG_DURATION,
  tileGridDims,
} from "./constants.js";
import { clamp, distSq, pointToSegmentDistance, rand, intersectsRectCircle, lineIntersectsRect } from "./math.js";
import { generateHexTileObstacles } from "./tiles.js";
import { drawCircle, drawHealPickup, drawObstacles } from "./draw.js";

export function mountEscape({
  canvas,
  snapshotFolderButton,
  snapshotStatus,
  controlsHintEl,
  characterSelectModal,
  characterSelectOptions,
  abilitySlots,
  deckRankSlotEls,
  backpackSlotEls,
  setBonusStatusEl,
  dangerRampFillEl,
  cardModal,
  modalDeckStripEl,
  cardModalFace,
  modalSetBonusStatusEl,
  cardCloseButton,
  cardPickupButton,
  cardSkipButton,
  cardSwapRow,
}) {
  const deathSnapshotsEnabled = (() => {
    try {
      const h = window.location.hostname;
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch {
      return false;
    }
  })();
  if (!deathSnapshotsEnabled) {
    const meta = snapshotFolderButton?.closest(".meta");
    if (meta) meta.hidden = true;
  }

  const ctx = canvas.getContext("2d");
  const world = { w: canvas.width, h: canvas.height };
const postFxCanvas = document.createElement("canvas");
postFxCanvas.width = world.w;
postFxCanvas.height = world.h;
const postFxCtx = postFxCanvas.getContext("2d");
  const VIEW_W = world.w;
  const VIEW_H = world.h;
  const { TILE_COLS, TILE_ROWS } = tileGridDims(world.h);
const DEATH_ANIM_DURATION = 0.42;
const PICKUP_SPAWN_INTERVAL = 3.2;
const CARD_SPAWN_INTERVAL = 8.5;
const LOOT_DENSITY_BASE_ACTIVE_HEXES = 3;
const TERRAIN_SPEED_BOOST_LINGER = 0.16;
const ROGUE_STEALTH_AFTER_LOS_BREAK = 0.35;
const ROGUE_STEALTH_OPEN_GRACE = 0.4;
/** Knight Spades set bonus: after using R (ultimate), non-player simulation uses this `dt` multiplier for this many seconds. */
const KNIGHT_SPADES_WORLD_SLOW_MULT = 0.3;
const KNIGHT_SPADES_WORLD_SLOW_SEC = 2;

/** Hunter wave spacing at run start (seconds until next wave after scheduling). */
const SPAWN_INTERVAL_START = 8;
/** Minimum seconds between hunter spawn waves once danger ramp is full (was 1.8). */
const SPAWN_INTERVAL_FLOOR = 1.5;
/** Survival time over which wave spacing eases from START → FLOOR (matches danger bar). */
const DANGER_RAMP_SECONDS = 300;
/** Knight + Diamonds speed burst path: multiplier vs default passive/active burst factor of 2 (+30% on that factor → 2.6). */
const KNIGHT_DIAMOND_BURST_SPEED_MULT = 2.6;
/** Extra seconds on W burst window when that path is active. */
const KNIGHT_DIAMOND_BURST_DURATION_BONUS_SEC = 1.5;
/** From this many seconds, waves can include `airSpawner` and `laserBlue` elites. */
const LATE_GAME_ELITE_SPAWN_SEC = 180;
/** After this many seconds, every `MIDGAME_ESCALATION_INTERVAL_SEC` adds +5% enemy speed (compounding) and +1 spawn per wave. */
const MIDGAME_ESCALATION_START_SEC = 240;
const MIDGAME_ESCALATION_INTERVAL_SEC = 15;
const MIDGAME_ESCALATION_SPEED_FACTOR = 1.05;
const BASE_WAVE_SPAWN_JOBS = 14;
/** Flying spawner chase speed (includes ~5% buff over original 84). */
const AIR_SPAWNER_CHASE_SPEED = 84 * 1.05;
/** Blue laser: time between full shot cycles (slightly longer than red). */
const LASER_BLUE_COOLDOWN_SEC = 1.22;
/** Blue laser: shorter warning = faster shot after aim (repositions quicker). */
const LASER_BLUE_WARN_SEC = 0.3;
/** Blue laser hit: player move speed multiplier. */
const LASER_BLUE_PLAYER_SLOW_MULT = 0.8;
const LASER_BLUE_PLAYER_SLOW_SEC = 1.5;
/** Hunter `speedFactor` uses `1 + age * coeff` over each hunter's lifetime; was 0.9 (+0.9 max); +0.2 → 1.1 (+1.1 max). */
const HUNTER_SPEED_AGE_COEFF = 1.1;
/** Matching suit cards in the rank deck required to unlock that suit's set bonus. */
const SET_BONUS_SUIT_THRESHOLD = 7;
/** Full set: all 13 ranks of a suit in the deck unlock the second-tier bonus. */
const SET_BONUS_SUIT_MAX = 13;
/** Hearts 13: once per this many seconds, lethal damage sets HP to 5 instead. */
const HEARTS_13_DEATH_DEFY_CD_SEC = 30;
/** Spades 13: enemies/projectiles in this radius (px) use ~30% slower motion; ≈2in at 96 CSS px/in. */
const SPADES_13_AURA_RADIUS_PX = 2 * 96;
/** Spades 13: multiplier on hostile `dt` while inside the aura (30% slow). */
const SPADES_13_ENEMY_DT_MULT = 0.7;
/** Clubs 13: collision radius vs base `player.r`. */
const CLUBS_13_HITBOX_MULT = 0.7;
/** Clubs 13: after taking real HP damage, enemies ignore the player briefly. */
const CLUBS_13_UNTARGETABLE_SEC = 1;
const PLAYER_BASE_HITBOX_R = 10;
/** Card pickup: spawn weight at rank 2 vs King (linear in between); doubles prior 12:1 curve. */
const CARD_RANK_SPAWN_WEIGHT_MAX = 24;
const CARD_RANK_SPAWN_WEIGHT_MIN = 1;
/** Ultimate (R): cooldown after any ult use. */
const ULTIMATE_ABILITY_COOLDOWN_SEC = 20;
/** Push ult: radius per wave (was 140; doubled). */
const ULT_BURST_RADIUS = 280;
const ULT_BURST_WAVE_COUNT = 5;
const ULT_BURST_WAVE_SPAN_SEC = 2;
/** Orbiting ult shields: distance from player center (slightly farther than old single orbiter). */
const ULT_ORBIT_SHIELD_RADIUS_EXTRA = 36;
const ULT_ORBIT_SHIELD_STAGGER_SEC = 4;
/** Food sets hunger to at least this many seconds (cap stays rogueHungerMax). */
const ROGUE_FOOD_HUNGER_RESTORE = 30;
/** Seconds food stays on the map before expiring. */
const ROGUE_FOOD_LIFETIME = 21;
/** Consume (E) food-sense overlay duration (screen arrows). */
const ROGUE_FOOD_SENSE_DURATION = 2.35;
/** World px: at or inside this distance to food, arrow size is maxed (no growth when closer). */
const ROGUE_FOOD_ARROW_CLOSE_PLATEAU = 96;
/** World px: beyond this, food-sense arrows use minimum size. */
const ROGUE_FOOD_ARROW_FAR_LEN = 440;
/** Rogue move speed bonus when starving; linear up to this fraction at 0 hunger. */
const ROGUE_DESPERATION_SPEED_MAX = 0.2;
const CAMERA_FOLLOW_LERP = 0.18;

const CHARACTERS = {
  knight: {
    id: "knight",
    name: "Knight",
    baseHp: 10,
    cooldownAbilityIds: ["dash", "burst", "decoy"],
    abilities: {
      dash: { key: "q", label: "Dash", cooldown: 2.2, minCooldown: 0.25 },
      burst: { key: "w", label: "Burst", cooldown: 5, minCooldown: 0.4, duration: 3 },
      decoy: { key: "e", label: "Decoy", cooldown: 8, minCooldown: 0.4 },
      random: { key: "r", label: "Ultimate" },
    },
  },
  rogue: {
    id: "rogue",
    name: "Hungry Rogue",
    baseHp: 7,
    cooldownAbilityIds: ["dash", "burst"],
    abilities: {
      dash: { key: "q", label: "Dash", cooldown: 2.2, minCooldown: 0.25 },
      burst: { key: "w", label: "Smoke", cooldown: 16, minCooldown: 1, duration: 3 },
      decoy: { key: "e", label: "Consume", cooldown: 4.5, minCooldown: 0.5 },
      random: { key: "r", label: "Ultimate" },
    },
  },
};

let obstacles = [];
let activePlayerHex = { q: 0, r: 0 };
let activeHexes = [];
let cameraX = 0;
let cameraY = 0;
let lastPlayerHexKey = null;

const tileCache = new Map();
const HEX_SIZE = TILE_W * 1.15;
const SQRT3 = Math.sqrt(3);
const HEX_DIRS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

function hexToWorld(q, r) {
  return {
    x: HEX_SIZE * SQRT3 * (q + r / 2),
    y: HEX_SIZE * 1.5 * r,
  };
}

function worldToHex(x, y) {
  const qf = (SQRT3 / 3 * x - 1 / 3 * y) / HEX_SIZE;
  const rf = (2 / 3 * y) / HEX_SIZE;
  // cube-round axial
  let xCube = qf;
  let zCube = rf;
  let yCube = -xCube - zCube;
  let rx = Math.round(xCube);
  let ry = Math.round(yCube);
  let rz = Math.round(zCube);
  const xDiff = Math.abs(rx - xCube);
  const yDiff = Math.abs(ry - yCube);
  const zDiff = Math.abs(rz - zCube);
  if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz;
  else if (yDiff > zDiff) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}

function hexKey(q, r) {
  return `${q},${r}`;
}

function ensureTilesForPlayer() {
  const center = worldToHex(player.x, player.y);
  const centerKey = hexKey(center.q, center.r);
  activePlayerHex = center;
  if (lastPlayerHexKey === centerKey && obstacles.length) return;
  lastPlayerHexKey = centerKey;

  const needed = [{ q: center.q, r: center.r }, ...HEX_DIRS.map((d) => ({ q: center.q + d.q, r: center.r + d.r }))];
  activeHexes = needed;
  for (const h of needed) {
    const key = hexKey(h.q, h.r);
    if (!tileCache.has(key)) {
      const c = hexToWorld(h.q, h.r);
      tileCache.set(
        key,
        generateHexTileObstacles(h.q, h.r, {
          TILE_COLS,
          TILE_ROWS,
          TILE_W,
          BLOCK,
          centerX: c.x,
          centerY: c.y,
          hexSize: HEX_SIZE,
        })
      );
    }
  }
  const neededKeys = new Set(needed.map((h) => hexKey(h.q, h.r)));
  for (const key of Array.from(tileCache.keys())) {
    if (!neededKeys.has(key)) tileCache.delete(key);
  }

  obstacles = [];
  for (const h of needed) {
    obstacles = obstacles.concat(tileCache.get(hexKey(h.q, h.r)));
  }
}

const player = {
  x: 96,
  y: 340,
  r: PLAYER_BASE_HITBOX_R,
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
  nextPickupAt: 3.5,
  nextCardAt: 10,
  hurtFlash: 0,
  damageEvents: [],
  enemyHitCooldown: 0.52,
  deathCount: 0,
  snapshotPending: false,
  playerInvulnerableUntil: 0,
  /** Clubs 13: enemies do not acquire the player as target; damage blocked. */
  playerUntargetableUntil: 0,
  /** Hearts 13: `elapsed` when death defiance may proc again. */
  heartsDeathDefyReadyAt: 0,
  /** Blue laser: movement slow until this `elapsed`. */
  playerLaserSlowUntil: 0,
  playerTimelockUntil: 0,
  tempHp: 0,
  tempHpExpiry: 0,
  ultimateBurstWaves: [],
  timelockEnemyFrom: 0,
  timelockEnemyUntil: 0,
  /** One-shot extra screen shake when timelock world phase begins. */
  timelockWorldShakeAt: 0,
  screenShakeUntil: 0,
  screenShakeStrength: 0,
  deathStartedAtMs: 0,
  manualPause: false,
  pausedForCard: false,
  inventoryModalOpen: false,
  waitingForMovementResume: false,
  pendingCard: null,
  /** True after touching a map card until modal closes; keeps pickup UI visible even when pending is empty. */
  cardPickupFlowActive: false,
  /** Rank (1–13) for this pickup session; bottom row shows one interactive slot for this rank. */
  pickupTargetRank: null,
  setBonusChoicePendingSuit: null,
  setBonusChoiceCard: null,
  /** Knight + Spades set: `elapsed` until ult-triggered world slow ends. */
  knightSpadesWorldSlowUntil: 0,
  playerHeadstartUntil: 0,
  rogueHunger: 60,
  rogueHungerMax: 60,
  rogueLastSeenAt: 0,
  rogueAlertUntil: 0,
  rogueStealthActive: false,
  rogueStealthOpenUntil: 0,
  rogueHasEnemyLos: false,
  rogueDashAiming: false,
  rogueFoodSenseUntil: 0,
  rogueNextFoodAt: 0,
  rogueNextHungryPopupAt: 0,
  rogueLastKnownPlayerPos: { x: 96, y: 340 },
};

let snapshotDirectoryHandle = null;
let selectedCharacter = CHARACTERS.knight;

function makeAbilitiesForCharacter(character) {
  const spec = character.abilities;
  return {
    dash: { ...spec.dash, nextReadyAt: 0 },
    burst: { ...spec.burst, nextReadyAt: 0 },
    decoy: { ...spec.decoy, nextReadyAt: 0 },
    random: { ...spec.random, type: null, ammo: 0, maxAmmo: 0, nextReadyAt: 0 },
  };
}

function makeCooldownFlatForCharacter(character) {
  const out = {};
  for (const id of character.cooldownAbilityIds) out[id] = 0;
  return out;
}

function makeCooldownPctForCharacter(character) {
  const out = {};
  for (const id of character.cooldownAbilityIds) out[id] = 0;
  return out;
}

let abilities = makeAbilitiesForCharacter(selectedCharacter);

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
  cards: [],
  healPopups: [],
  smokeZones: [],
  foods: [],
};

/** 14-length array: index 1..13 = card at that rank, or null. */
function makeEmptyDeckByRank() {
  const a = new Array(14).fill(null);
  return a;
}

/** Latest suit counts from `recalcCardPassives` (rank deck only); safe for combat code like `damagePlayer`. */
let deckSuitCounts = { diamonds: 0, hearts: 0, clubs: 0, spades: 0 };

const inventory = {
  deckByRank: makeEmptyDeckByRank(),
  backpackSlots: [null, null, null],
  diamondEmpower: null,
  heartsRegenPerSec: 0,
  spadesLandingStealthUntil: 0,
  spadesObstacleBoostUntil: 0,
  clubsInvisUntil: 0,
  clubsPhaseThroughTerrain: false,
  heartsResistanceReadyAt: 0,
  heartsResistanceCooldownDuration: 0,
  heartsRegenBank: 0,
  dodgeTextUntil: 0,
  rogueDiamondRangeBoost: false,
};

const passive = {
  cooldownFlat: makeCooldownFlatForCharacter(selectedCharacter),
  cooldownPct: makeCooldownPctForCharacter(selectedCharacter),
  speedMult: 1,
  obstacleTouchMult: 1,
  dodgeChanceWhenDashCd: 0,
  stunOnHitSecs: 0,
  invisOnBurst: 0,
  dashChargesBonus: 0,
  heartsShieldArc: 0,
};

const dashState = {
  charges: 1,
  maxCharges: 1,
  nextRechargeAt: 0,
};

const suitGlyph = { diamonds: "♦", hearts: "♥", clubs: "♣", spades: "♠" };
let gameStarted = false;
/** After death, R runs `resetGame` then this (modal: reopen pick; no modal: set `gameStarted` true). */
let afterDeathRetry = () => {};

function cardRankText(rank) {
  if (rank === 1) return "A";
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  return String(rank);
}

function formatCardName(card) {
  return `${cardRankText(card.rank)}${suitGlyph[card.suit] ?? "?"}`;
}

/** Canonical identity for the 52-card pool (rank 1 = Ace, 13 = King). */
function deckKey(suit, rank) {
  return `${suit}:${rank}`;
}

/**
 * Spawn weight by rank: 2 is most common; linear down to King (min weight).
 * Rank 2 vs King ratio is CARD_RANK_SPAWN_WEIGHT_MAX : CARD_RANK_SPAWN_WEIGHT_MIN (e.g. 24× rarer).
 * Ace (1) uses the same weight as 9.
 */
function cardRankSpawnWeight(rank) {
  if (rank === 1) return cardRankSpawnWeight(9);
  if (rank >= 2 && rank <= 13) {
    const span = 11;
    const t = (rank - 2) / span;
    return CARD_RANK_SPAWN_WEIGHT_MAX - t * (CARD_RANK_SPAWN_WEIGHT_MAX - CARD_RANK_SPAWN_WEIGHT_MIN);
  }
  return CARD_RANK_SPAWN_WEIGHT_MIN;
}

function addReservedDeckKey(card, reserved) {
  if (card?.suit != null && Number.isInteger(card.rank)) reserved.add(deckKey(card.suit, card.rank));
}

/** Cards held, pending pickup UI, or still on the ground — excluded from the next spawn. */
function getReservedDeckKeys() {
  const reserved = new Set();
  addReservedDeckKey(state.pendingCard, reserved);
  for (let r = 1; r <= 13; r++) addReservedDeckKey(inventory.deckByRank[r], reserved);
  for (const c of inventory.backpackSlots) addReservedDeckKey(c, reserved);
  for (const ec of entities.cards) addReservedDeckKey(ec.card, reserved);
  return reserved;
}

function forEachDeckCard(fn) {
  for (let r = 1; r <= 13; r++) {
    const c = inventory.deckByRank[r];
    if (c) fn(c, r);
  }
}

function rogueDiamondCooldownPctForRank(rank) {
  if (rank <= 2) return 0.05;
  if (rank <= 4) return 0.08;
  if (rank === 5) return 0.1;
  if (rank <= 8) return 0.12;
  if (rank <= 10) return 0.15;
  if (rank === 11) return 0.18;
  if (rank === 12) return 0.22;
  return 0.25;
}

function abilityLabelById(id) {
  return selectedCharacter.abilities[id]?.label ?? id;
}

function makeCardEffect(suit, rank) {
  if (rank === 1) {
    const pool = ["shield", "burst", "timelock", "heal"];
    return { kind: "ultimate", ultType: pool[Math.floor(Math.random() * pool.length)] };
  }
  if (suit === "diamonds") {
    const abilityPool = selectedCharacter.cooldownAbilityIds;
    const target = abilityPool[Math.floor(Math.random() * abilityPool.length)];
    if (selectedCharacter.id === "rogue") {
      return { kind: "cooldownPct", target, value: rogueDiamondCooldownPctForRank(rank) };
    }
    return { kind: "cooldown", target, value: 0.1 * rank };
  }
  if (suit === "hearts") {
    if (rank >= 11) return { kind: "frontShield", arc: 28 + rank * 4 };
    if (Math.random() < 0.5) return { kind: "maxHp", value: Math.ceil(rank * 0.5) };
    return { kind: "hitResist", cooldown: Math.max(3, 15 - 0.5 * rank) };
  }
  if (suit === "clubs") {
    const picks = ["dodge", "stun", "invisBurst"];
    const pick = picks[Math.floor(Math.random() * picks.length)];
    if (pick === "dodge") return { kind: "dodge", value: (5 + 0.1 * rank) / 100 };
    if (pick === "stun") return { kind: "stun", value: 0.2 * rank };
    return { kind: "invisBurst", value: 0.1 * rank };
  }
  if (rank >= 11) return { kind: "dashCharge", value: 1 };
  if (Math.random() < 0.5) return { kind: "speed", value: Math.min(0.18, 0.018 * rank) };
  return { kind: "terrainBoost", value: Math.min(0.36, 0.036 * rank) };
}

function makeRandomCard() {
  const reserved = getReservedDeckKeys();
  const suits = ["diamonds", "hearts", "clubs", "spades"];
  const candidates = [];
  for (const suit of suits) {
    for (let rank = 1; rank <= 13; rank++) {
      if (reserved.has(deckKey(suit, rank))) continue;
      candidates.push({ suit, rank, w: cardRankSpawnWeight(rank) });
    }
  }

  let suit;
  let rank;
  if (!candidates.length) {
    let found = null;
    outer: for (const s of suits) {
      for (let r = 1; r <= 13; r++) {
        if (!reserved.has(deckKey(s, r))) {
          found = { suit: s, rank: r };
          break outer;
        }
      }
    }
    if (!found) {
      suit = "hearts";
      rank = 2;
    } else {
      suit = found.suit;
      rank = found.rank;
    }
  } else {
    let total = 0;
    for (const c of candidates) total += c.w;
    let pick = Math.random() * total;
    let chosen = candidates[candidates.length - 1];
    for (const c of candidates) {
      pick -= c.w;
      if (pick <= 0) {
        chosen = c;
        break;
      }
    }
    suit = chosen.suit;
    rank = chosen.rank;
  }

  return {
    id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    suit,
    rank,
    effect: makeCardEffect(suit, rank),
  };
}

function describeCardEffect(card) {
  const e = card.effect;
  if (e.kind === "ultimate") {
    const names = { shield: "Orbiting shields", burst: "Push waves", timelock: "Timelock", heal: "Vitality (temp HP)" };
    return `Ultimate — ${names[e.ultType] ?? e.ultType}`;
  }
  if (e.kind === "cooldown") return `-${e.value.toFixed(1)}s ${abilityLabelById(e.target)} cooldown`;
  if (e.kind === "cooldownPct") return `-${Math.round(e.value * 100)}% ${abilityLabelById(e.target)} cooldown`;
  if (e.kind === "maxHp") return `+${e.value} max HP`;
  if (e.kind === "hitResist") return `Block one hit every ${e.cooldown.toFixed(1)}s`;
  if (e.kind === "frontShield") return `Front shield arc +${Math.round(e.arc)}deg`;
  if (e.kind === "dodge") return `${Math.round(e.value * 1000) / 10}% dodge while dash is cooling down`;
  if (e.kind === "stun") return `Stun nearby enemies ${e.value.toFixed(1)}s on hit`;
  if (e.kind === "invisBurst") return `Burst grants ${e.value.toFixed(1)}s invisibility`;
  if (e.kind === "speed") return `+${Math.round(e.value * 100)}% passive speed`;
  if (e.kind === "terrainBoost") return `+${Math.round(e.value * 100)}% terrain-touch speed boost`;
  if (e.kind === "dashCharge") return `+${e.value} dash charge`;
  return "Passive effect";
}

function fillDeckSlotEl(el, rank, card) {
  if (!el) return;
  for (const c of CARD_SET_GLOW_CLASSES) el.classList.remove(c);
  el.classList.toggle("filled", !!card);
  el.dataset.rank = String(rank);
  if (!card) {
    el.innerHTML = `<span class="deck-rank-label">${cardRankText(rank)}</span><span class="deck-slot-empty">—</span>`;
    return;
  }
  const glow = suitInventoryGlowClass(card);
  if (glow) el.classList.add(glow);
  el.innerHTML = `<span class="deck-rank-label">${cardRankText(rank)}</span><div><span class="title">${formatCardName(
    card
  )}</span><span class="meta">${describeCardEffect(card)}</span></div>`;
}

function renderCardSlots() {
  if (deckRankSlotEls && deckRankSlotEls.length) {
    for (let r = 1; r <= 13; r++) {
      const el = deckRankSlotEls[r - 1];
      fillDeckSlotEl(el, r, inventory.deckByRank[r] || null);
    }
  }
  if (backpackSlotEls && backpackSlotEls.length) {
    for (let i = 0; i < 3; i++) {
      const slot = backpackSlotEls[i];
      if (!slot) continue;
      const card = inventory.backpackSlots[i] || null;
      for (const c of CARD_SET_GLOW_CLASSES) slot.classList.remove(c);
      slot.classList.toggle("filled", !!card);
      slot.dataset.bpIdx = String(i);
      if (!card) {
        slot.innerHTML = `Pack ${i + 1}<span class="deck-slot-empty">Empty</span>`;
        continue;
      }
      const glow = suitInventoryGlowClass(card);
      if (glow) slot.classList.add(glow);
      slot.innerHTML = `<span class="deck-rank-label">Pack ${i + 1}</span><div><span class="title">${formatCardName(
        card
      )}</span><span class="meta">${describeCardEffect(card)}</span></div>`;
    }
  }
}

/** R ability: ult type comes from the Ace (rank 1) in the rank deck only. */
function syncUltimateFromAceDeck() {
  const ace = inventory.deckByRank[1];
  const e = ace?.effect;
  if (!e || e.kind !== "ultimate") {
    abilities.random.type = null;
    abilities.random.maxAmmo = 0;
    abilities.random.ammo = 0;
    abilities.random.nextReadyAt = 0;
    entities.shields = [];
    return;
  }
  const ultType = e.ultType;
  const prevType = abilities.random.type;
  if (prevType != null && prevType !== ultType) entities.shields = [];
  abilities.random.type = ultType;
  abilities.random.maxAmmo = 1;
  if (state.elapsed >= abilities.random.nextReadyAt) abilities.random.ammo = 1;
  else abilities.random.ammo = 0;
}

function recalcCardPassives() {
  passive.cooldownFlat = makeCooldownFlatForCharacter(selectedCharacter);
  passive.cooldownPct = makeCooldownPctForCharacter(selectedCharacter);
  passive.speedMult = 1;
  passive.obstacleTouchMult = 1;
  passive.dodgeChanceWhenDashCd = 0;
  passive.stunOnHitSecs = 0;
  passive.invisOnBurst = 0;
  passive.dashChargesBonus = 0;
  passive.heartsShieldArc = 0;
  inventory.heartsRegenPerSec = 0;
  inventory.clubsPhaseThroughTerrain = false;
  inventory.rogueDiamondRangeBoost = false;
  let maxHpBonus = 0;
  const suits = { diamonds: 0, hearts: 0, clubs: 0, spades: 0 };
  forEachDeckCard((card) => {
    suits[card.suit] += 1;
    const e = card.effect;
    if (e.kind === "cooldown") passive.cooldownFlat[e.target] += e.value;
    else if (e.kind === "cooldownPct") passive.cooldownPct[e.target] += e.value;
    else if (e.kind === "maxHp") maxHpBonus += e.value;
    else if (e.kind === "dodge") passive.dodgeChanceWhenDashCd += e.value;
    else if (e.kind === "stun") passive.stunOnHitSecs += e.value;
    else if (e.kind === "invisBurst") passive.invisOnBurst += e.value;
    else if (e.kind === "speed") passive.speedMult += e.value;
    else if (e.kind === "terrainBoost") passive.obstacleTouchMult += e.value;
    else if (e.kind === "dashCharge") passive.dashChargesBonus += e.value;
    else if (e.kind === "frontShield") passive.heartsShieldArc += e.arc;
  });
  deckSuitCounts = { ...suits };
  player.r = suits.clubs >= SET_BONUS_SUIT_MAX ? PLAYER_BASE_HITBOX_R * CLUBS_13_HITBOX_MULT : PLAYER_BASE_HITBOX_R;
  if (suits.hearts >= SET_BONUS_SUIT_THRESHOLD) inventory.heartsRegenPerSec = 0.3;
  if (suits.clubs >= SET_BONUS_SUIT_THRESHOLD) inventory.clubsPhaseThroughTerrain = true;
  if (selectedCharacter.id === "rogue" && suits.diamonds >= SET_BONUS_SUIT_THRESHOLD) {
    inventory.rogueDiamondRangeBoost = true;
  }
  if (suits.spades >= SET_BONUS_SUIT_THRESHOLD) {
    // Spades set: Rogue stealth refresh on dash landing — see tryDash(). Knight: ult world slow — see useRandomAbility() + update().
  }
  if (suits.diamonds >= SET_BONUS_SUIT_MAX && state.setBonusChoicePendingSuit === "diamonds") {
    state.setBonusChoicePendingSuit = null;
  }
  if (
    selectedCharacter.id !== "rogue" &&
    suits.diamonds >= SET_BONUS_SUIT_THRESHOLD &&
    suits.diamonds < SET_BONUS_SUIT_MAX &&
    !inventory.diamondEmpower &&
    !state.setBonusChoicePendingSuit
  ) {
    state.setBonusChoicePendingSuit = "diamonds";
  }
  dashState.maxCharges = 1 + passive.dashChargesBonus;
  dashState.charges = Math.min(dashState.charges || dashState.maxCharges, dashState.maxCharges);
  player.maxHp = Math.max(1, selectedCharacter.baseHp + maxHpBonus);
  player.hp = Math.min(player.hp, player.maxHp);
  renderCardSlots();
  syncUltimateFromAceDeck();
  updateSetBonusStatus();
}

function effectiveAbilityCooldown(abilityId, baseCooldown, minCooldown, extraFlatReduction = 0) {
  const flat = (passive.cooldownFlat[abilityId] || 0) + extraFlatReduction;
  const pct = clamp(passive.cooldownPct[abilityId] || 0, 0, 0.85);
  return Math.max(minCooldown, Math.max(0, baseCooldown - flat) * (1 - pct));
}

function updateSetBonusStatus() {
  const lines = getSetBonusLines();
  if (setBonusStatusEl) setBonusStatusEl.textContent = lines.join(" ");
}

function getSetBonusLines() {
  const suits = { diamonds: 0, hearts: 0, clubs: 0, spades: 0 };
  forEachDeckCard((card) => {
    suits[card.suit] += 1;
  });
  const lines = [];
  if (suits.diamonds >= SET_BONUS_SUIT_THRESHOLD) {
    if (selectedCharacter.id === "rogue") {
      lines.push("Set bonus! Diamonds: dash range and smoke radius increased.");
    } else {
    const pick =
      suits.diamonds >= SET_BONUS_SUIT_MAX
      ? "dash, burst, and decoy all empowered"
      : inventory.diamondEmpower === "dash2x"
        ? "dash goes twice as far"
        : inventory.diamondEmpower === "speedPassive"
          ? selectedCharacter.id === "knight"
            ? "speed burst: +30% boost, +1.5s on W (always on)"
            : "speed burst is passive"
          : inventory.diamondEmpower === "decoyLead"
            ? "decoy drifts away, cooldown -2s, duration +1s"
            : "choose your empowerment in inventory";
    lines.push(`Set bonus! Diamonds: ${pick}.`);
    }
  }
  if (suits.hearts >= SET_BONUS_SUIT_THRESHOLD) lines.push("Set bonus! Hearts: passive HP regeneration.");
  if (suits.clubs >= SET_BONUS_SUIT_THRESHOLD) {
    lines.push(
      selectedCharacter.id === "rogue"
        ? "Set bonus! Clubs: phase through terrain while inside smoke."
        : "Set bonus! Clubs: burst phase-through terrain."
    );
  }
  if (suits.spades >= SET_BONUS_SUIT_THRESHOLD) {
    lines.push(
      selectedCharacter.id === "rogue"
        ? "Set bonus! Spades: dash from stealth snaps you back into stealth on landing (extra grace to hug cover)."
        : "Set bonus! Spades: using your ultimate (R) slows hunters, shots, and hazards to 30% speed for 2 seconds."
    );
  }
  if (suits.diamonds >= SET_BONUS_SUIT_MAX && selectedCharacter.id === "rogue") {
    lines.push("Set bonus! Diamonds (13): maximum dash, smoke, and consume tuning.");
  }
  if (suits.hearts >= SET_BONUS_SUIT_MAX) {
    lines.push("Set bonus! Hearts (13): death defiance — survive a lethal hit at 5 HP (30s cooldown).");
  }
  if (suits.clubs >= SET_BONUS_SUIT_MAX) {
    lines.push("Set bonus! Clubs (13): smaller hitbox; 1s untargetable after taking a hit.");
  }
  if (suits.spades >= SET_BONUS_SUIT_MAX) {
    lines.push(
      "Set bonus! Spades (13): hostiles near you (~2in) move and shoot ~30% slower while in the aura."
    );
  }
  return lines;
}

const MODAL_SET_SUIT_ORDER = ["hearts", "diamonds", "clubs", "spades"];
const CARD_SET_GLOW_CLASSES = [
  "card-set-glow-red",
  "card-set-glow-yellow",
  "card-set-glow-green",
  "card-set-glow-blue",
];

function countSuitsAcrossAllStowed() {
  const suits = { diamonds: 0, hearts: 0, clubs: 0, spades: 0 };
  const add = (card) => {
    if (card && card.suit) suits[card.suit] += 1;
  };
  add(state.pendingCard);
  forEachDeckCard((c) => add(c));
  for (const c of inventory.backpackSlots) add(c);
  return suits;
}

/**
 * Suit highlight across pickup + 13-rank deck + 3 backpack slots (♥♦♣♠ order among suits with 2+ copies):
 * 1st such suit → red, 2nd → yellow, 3rd → green, 4th → blue.
 * Only one suit over-represented (4+ of that suit, no other pair): yellow for that stack.
 */
function suitInventoryGlowClass(card) {
  if (!card?.suit) return "";
  const suits = countSuitsAcrossAllStowed();
  const n = suits[card.suit];
  if (n < 2) return "";

  const suitsWithPair = MODAL_SET_SUIT_ORDER.filter((s) => suits[s] >= 2);
  const idx = suitsWithPair.indexOf(card.suit);
  if (idx < 0) return "";

  if (suitsWithPair.length === 1 && n >= 4) return "card-set-glow-yellow";

  const glowByPairOrder = [
    "card-set-glow-red",
    "card-set-glow-yellow",
    "card-set-glow-green",
    "card-set-glow-blue",
  ];
  return glowByPairOrder[Math.min(idx, glowByPairOrder.length - 1)];
}

/** Suit counts in the 13-rank deck only (backpack excluded from set progress). */
function countSuitsInActiveSlots() {
  const suits = { diamonds: 0, hearts: 0, clubs: 0, spades: 0 };
  forEachDeckCard((card) => {
    if (card?.suit) suits[card.suit] += 1;
  });
  return suits;
}

function diamondsOmniEmpowerActive() {
  return deckSuitCounts.diamonds >= SET_BONUS_SUIT_MAX;
}

function knightDiamondBurstEmpowerActive() {
  return selectedCharacter.id === "knight" && (inventory.diamondEmpower === "speedPassive" || diamondsOmniEmpowerActive());
}

/** Spades 13: scale hostile simulation `dt` near the player (permanent while in range). */
function spades13AuraEnemyDtMult(worldX, worldY) {
  if (deckSuitCounts.spades < SET_BONUS_SUIT_MAX) return 1;
  const dx = worldX - player.x;
  const dy = worldY - player.y;
  if (dx * dx + dy * dy <= SPADES_13_AURA_RADIUS_PX * SPADES_13_AURA_RADIUS_PX) return SPADES_13_ENEMY_DT_MULT;
  return 1;
}

function suitDisplayNameForModal(suit) {
  return { diamonds: "Diamonds", hearts: "Hearts", clubs: "Clubs", spades: "Spades" }[suit] ?? suit;
}

/** Short label for inventory modal: what completing 3-of-suit does (character-aware). */
function suitSetBonusGoalLabel(suit) {
  if (suit === "hearts") return "continuous health regen";
  if (suit === "diamonds") {
    return selectedCharacter.id === "rogue" ? "larger dash & smoke radius" : "ability empowerment";
  }
  if (suit === "clubs") {
    return selectedCharacter.id === "rogue" ? "phase through terrain in smoke" : "burst phases through terrain";
  }
  if (suit === "spades") {
    return selectedCharacter.id === "rogue"
      ? "stealth refresh on stealth-dash landing"
      : "after ultimate: world (except you) at 30% speed for 2s";
  }
  return "";
}

function diamondsActiveSummary() {
  if (diamondsOmniEmpowerActive()) {
    return selectedCharacter.id === "rogue"
      ? "maximum dash, smoke, and consume tuning"
      : "all three diamond empowerments active";
  }
  if (selectedCharacter.id === "rogue") return "larger dash & smoke radius";
  if (inventory.diamondEmpower === "dash2x") return "dash goes twice as far";
  if (inventory.diamondEmpower === "speedPassive") {
    return selectedCharacter.id === "knight"
      ? "speed burst: +30% boost, +1.5s burst duration (always on)"
      : "speed burst is passive";
  }
  if (inventory.diamondEmpower === "decoyLead") return "decoy drifts, shorter cooldown, longer life";
  return "choose empowerment below";
}

function suitSetBonusSevenActiveShort(suit) {
  if (suit === "diamonds") return diamondsActiveSummary();
  if (suit === "hearts") return "passive HP regeneration";
  if (suit === "clubs") {
    return selectedCharacter.id === "rogue"
      ? "phase through terrain while inside smoke"
      : "burst phase-through terrain";
  }
  return selectedCharacter.id === "rogue"
    ? "stealth refresh on stealth-dash landing"
    : "after ultimate: 30% world speed for 2s";
}

/** Shown toward 13 only after the 7-card line is complete (`n >= 7`). */
function suitSetBonusTierTwoGoalLabel(suit) {
  if (suit === "hearts") return "death defiance on 30s cooldown (lethal → 5 HP)";
  if (suit === "diamonds") {
    return selectedCharacter.id === "rogue"
      ? "stronger dash, smoke, and consume together"
      : "all three abilities empowered at once";
  }
  if (suit === "clubs") return "30% smaller hitbox; 1s untargetable after a hit";
  if (suit === "spades") return "~2in aura: hostiles inside slowed ~30%";
  return "";
}

function suitSetBonusTierTwoActiveShort(suit) {
  if (suit === "hearts") return "death defiance (30s CD → 5 HP)";
  if (suit === "diamonds") {
    return selectedCharacter.id === "rogue" ? "maximum diamond mobility" : "all three empowerments active";
  }
  if (suit === "clubs") return "smaller hitbox; untargetable 1s on hit";
  if (suit === "spades") return "nearby hostiles slowed ~30% in aura";
  return "";
}

/** Per-suit progress lines for the loadout manager (deck only). Tier-two (13) text only appears once 7/7 is done. */
function getModalSetBonusProgressLines() {
  const suits = countSuitsInActiveSlots();
  const lines = [];
  const T7 = SET_BONUS_SUIT_THRESHOLD;
  const T13 = SET_BONUS_SUIT_MAX;
  for (const suit of MODAL_SET_SUIT_ORDER) {
    const n = suits[suit];
    if (n < 1) continue;
    const name = suitDisplayNameForModal(suit);
    if (n < T7) {
      lines.push(`${name} ${n}/${T7} (${suitSetBonusGoalLabel(suit)})`);
      continue;
    }
    lines.push(`${name} ${T7}/${T7} (${suitSetBonusSevenActiveShort(suit)})`);
    if (n < T13) {
      lines.push(`${name} ${n}/${T13} (${suitSetBonusTierTwoGoalLabel(suit)})`);
    } else {
      lines.push(`${name} ${T13}/${T13} (${suitSetBonusTierTwoActiveShort(suit)})`);
    }
  }
  return lines;
}

function parseDeckZoneId(zoneId) {
  const m = /^deck-(\d+)$/.exec(zoneId);
  if (!m) return null;
  const r = Number(m[1]);
  return r >= 1 && r <= 13 ? r : null;
}

function parseBpZoneId(zoneId) {
  const m = /^bp-(\d+)$/.exec(zoneId);
  if (!m) return null;
  const i = Number(m[1]);
  return i >= 0 && i < 3 ? i : null;
}

function wireDropZone(zoneEl, zoneId) {
  zoneEl.dataset.zoneId = zoneId;
  zoneEl.addEventListener("dragover", (event) => {
    event.preventDefault();
    zoneEl.classList.add("over");
  });
  zoneEl.addEventListener("dragleave", () => zoneEl.classList.remove("over"));
  zoneEl.addEventListener("drop", (event) => {
    event.preventDefault();
    zoneEl.classList.remove("over");
    const from = event.dataTransfer?.getData("text/plain");
    if (!from) return;
    swapCardsBetweenZones(from, zoneId);
  });
}

function appendCardToZone(zoneEl, zoneId, card, compact) {
  if (card) {
    const cardEl = document.createElement("div");
    cardEl.className = "zone-card";
    cardEl.draggable = true;
    const glow = suitInventoryGlowClass(card);
    if (glow) cardEl.classList.add(glow);
    cardEl.textContent = compact ? formatCardName(card) : `${formatCardName(card)} — ${describeCardEffect(card)}`;
    cardEl.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData("text/plain", zoneId);
    });
    zoneEl.appendChild(cardEl);
  } else {
    const emptyEl = document.createElement("div");
    emptyEl.className = "zone-empty";
    emptyEl.textContent = "Empty";
    zoneEl.appendChild(emptyEl);
  }
}

/** Read-only cell in the modal deck strip (not a drop target). */
function appendModalDeckDisplayCell(parent, rank, card, extraClass = "") {
  const cell = document.createElement("div");
  cell.className = ["modal-deck-cell", extraClass].filter(Boolean).join(" ");
  for (const c of CARD_SET_GLOW_CLASSES) cell.classList.remove(c);
  cell.innerHTML = `<div class="modal-deck-cell-label">${cardRankText(rank)}</div>`;
  if (card) {
    const glow = suitInventoryGlowClass(card);
    if (glow) cell.classList.add(glow);
    const t = document.createElement("div");
    t.className = "modal-deck-cell-card";
    t.textContent = formatCardName(card);
    cell.appendChild(t);
  } else {
    const e = document.createElement("div");
    e.className = "modal-deck-cell-empty";
    e.textContent = "—";
    cell.appendChild(e);
  }
  parent.appendChild(cell);
}

/** Read-only backpack pack in the modal strip (matches HUD wing). */
function appendModalBackpackDisplayCell(parent, packIndex, card) {
  const cell = document.createElement("div");
  cell.className = "modal-deck-cell modal-deck-cell--bp";
  for (const c of CARD_SET_GLOW_CLASSES) cell.classList.remove(c);
  cell.innerHTML = `<div class="modal-deck-cell-label">Pack ${packIndex + 1}</div>`;
  if (card) {
    const glow = suitInventoryGlowClass(card);
    if (glow) cell.classList.add(glow);
    const t = document.createElement("div");
    t.className = "modal-deck-cell-card";
    t.textContent = formatCardName(card);
    cell.appendChild(t);
  } else {
    const e = document.createElement("div");
    e.className = "modal-deck-cell-empty";
    e.textContent = "—";
    cell.appendChild(e);
  }
  parent.appendChild(cell);
}

function rankDeckIsCompletelyEmpty() {
  for (let rank = 1; rank <= 13; rank++) {
    if (inventory.deckByRank[rank]) return false;
  }
  return true;
}

/** First-card pickup: show drag-and-drop help beside the card in the modal face. */
function cardModalInventoryDragHintHtml() {
  return `<aside class="card-face-hint" aria-label="How to use inventory">
    <strong>Using inventory</strong>
    <p><strong>Click and hold</strong> a card, then <b>drag</b> it to a slot and <b>release</b> to drop, either in the relevant card slot, or the <b>backpack</b>. Cards in the backpack have no effect but are stored for later.</p>
  </aside>`;
}

function renderCardModal() {
  if (!cardModal || !cardModalFace || !cardSwapRow) return;
  if (modalDeckStripEl) modalDeckStripEl.innerHTML = "";
  if (!state.inventoryModalOpen) {
    cardModal.classList.remove("open");
    if (modalSetBonusStatusEl) modalSetBonusStatusEl.textContent = "";
    cardSwapRow.innerHTML = "";
    cardModalFace.classList.remove("compact");
    cardModalFace.innerHTML = "";
    renderCardSlots();
    return;
  }
  cardModal.classList.add("open");

  if (modalDeckStripEl) {
    const labelRow = document.createElement("div");
    labelRow.className = "player-deck-label-row";
    labelRow.innerHTML =
      '<span class="deck-slots-label">Deck (one card per rank)</span><span class="deck-slots-label deck-slots-label--sub">Backpack (3)</span>';
    modalDeckStripEl.appendChild(labelRow);
    const wings = document.createElement("div");
    wings.className = "modal-deck-wings-grid";
    wings.setAttribute("aria-label", "Read-only deck and backpack preview");
    const aceWing = document.createElement("div");
    aceWing.className = "modal-deck-ace-wing";
    appendModalDeckDisplayCell(aceWing, 1, inventory.deckByRank[1] || null, "modal-deck-cell--ace");
    const mid = document.createElement("div");
    mid.className = "modal-deck-middle-twelve";
    for (let r = 2; r <= 13; r++) {
      appendModalDeckDisplayCell(mid, r, inventory.deckByRank[r] || null);
    }
    const bpWing = document.createElement("div");
    bpWing.className = "modal-deck-backpack-wing";
    for (let i = 0; i < 3; i++) {
      appendModalBackpackDisplayCell(bpWing, i, inventory.backpackSlots[i] || null);
    }
    wings.appendChild(aceWing);
    wings.appendChild(mid);
    wings.appendChild(bpWing);
    modalDeckStripEl.appendChild(wings);
  }

  if (state.cardPickupFlowActive) {
    const r = state.pendingCard?.rank ?? state.pickupTargetRank;
    if (r != null) {
      const showCard = state.pendingCard || inventory.deckByRank[r] || null;
      const showFirstCardHint = rankDeckIsCompletelyEmpty();
      if (showCard) {
        cardModalFace.classList.remove("compact");
        if (showFirstCardHint) {
          cardModalFace.innerHTML = `<div class="card-face-layout"><div class="card-face-primary"><div class="big">${formatCardName(
            showCard
          )}</div><div class="desc">${describeCardEffect(showCard)}</div></div>${cardModalInventoryDragHintHtml()}</div>`;
        } else {
          cardModalFace.innerHTML = `<div class="big">${formatCardName(showCard)}</div><div class="desc">${describeCardEffect(showCard)}</div>`;
        }
      } else {
        if (showFirstCardHint) {
          cardModalFace.classList.remove("compact");
          cardModalFace.innerHTML = `<div class="card-face-layout"><div class="card-face-primary"><div class="desc">Rank <strong>${cardRankText(
            r
          )}</strong> — empty. Use <strong>New pickup</strong> or a backpack slot below, or <strong>Leave</strong>.</div></div>${cardModalInventoryDragHintHtml()}</div>`;
        } else {
          cardModalFace.classList.add("compact");
          cardModalFace.innerHTML = `<div class="desc">Rank <strong>${cardRankText(r)}</strong> — empty. Use <strong>New pickup</strong> or a backpack slot below, or <strong>Leave</strong>.</div>`;
        }
      }
    } else {
      const showFirstHintNoRank = state.cardPickupFlowActive && rankDeckIsCompletelyEmpty();
      if (showFirstHintNoRank) {
        cardModalFace.classList.remove("compact");
        cardModalFace.innerHTML = `<div class="card-face-layout"><div class="card-face-primary"><div class="desc">Drag a card into <strong>New pickup</strong> from a backpack slot or the rank row above, or <strong>Leave</strong>.</div></div>${cardModalInventoryDragHintHtml()}</div>`;
      } else {
        cardModalFace.classList.add("compact");
        cardModalFace.innerHTML =
          '<div class="desc">Drag a card into <strong>New pickup</strong> from a backpack slot or the rank row above, or <strong>Leave</strong>.</div>';
      }
    }
  } else if (state.pendingCard) {
    const card = state.pendingCard;
    cardModalFace.classList.remove("compact");
    cardModalFace.innerHTML = `<div class="big">${formatCardName(card)}</div><div class="desc">${describeCardEffect(card)}</div>`;
  } else {
    cardModalFace.classList.add("compact");
    cardModalFace.innerHTML =
      '<div class="desc">Drag between rank slots and the three backpack packs. Leave closes without taking a new pickup.</div>';
  }
  cardSwapRow.innerHTML = "";

  const zones = [];
  if (state.cardPickupFlowActive) {
    zones.push({ id: "pickup", label: "New pickup", card: state.pendingCard, kind: "pickup" });
    const deckR = state.pendingCard?.rank ?? state.pickupTargetRank;
    if (deckR != null) {
      zones.push({
        id: `deck-${deckR}`,
        label: `Card slot: ${cardRankText(deckR)}`,
        card: inventory.deckByRank[deckR] || null,
        kind: "rank",
      });
    }
  } else if (state.pendingCard) {
    zones.push({ id: "pickup", label: "New pickup", card: state.pendingCard, kind: "pickup" });
  }
  for (let i = 0; i < 3; i++) zones.push({ id: `bp-${i}`, label: `Backpack ${i + 1}`, card: inventory.backpackSlots[i] || null, kind: "bp" });

  for (const zone of zones) {
    const zoneEl = document.createElement("div");
    let zc = "drop-zone drop-zone--swap";
    if (zone.kind === "pickup" || zone.kind === "rank") zc += " drop-zone--main-slot";
    if (zone.kind === "bp") zc += " drop-zone--backpack-sm";
    zoneEl.className = zc;
    zoneEl.innerHTML = `<div class="zone-label">${zone.label}</div>`;
    wireDropZone(zoneEl, zone.id);
    appendCardToZone(zoneEl, zone.id, zone.card, false);
    cardSwapRow.appendChild(zoneEl);
  }

  if (state.setBonusChoicePendingSuit === "diamonds" && !inventory.diamondEmpower) {
    const mk = (id, text) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "leave-button";
      btn.textContent = `Set bonus! ${text}`;
      btn.addEventListener("click", () => {
        inventory.diamondEmpower = id;
        state.setBonusChoicePendingSuit = null;
        updateSetBonusStatus();
        renderCardModal();
      });
      return btn;
    };
    cardSwapRow.appendChild(mk("dash2x", "Dash goes twice as far"));
    cardSwapRow.appendChild(
      mk(
        "speedPassive",
        selectedCharacter.id === "knight"
          ? "Burst: +30% speed boost, +1.5s duration (passive)"
          : "Speed burst is passive"
      )
    );
    cardSwapRow.appendChild(mk("decoyLead", "Decoy drifts away, -2s cooldown, +1s duration"));
  }

  const leaveBtn = document.createElement("button");
  leaveBtn.type = "button";
  leaveBtn.className = "leave-button";
  leaveBtn.textContent = "Leave";
  leaveBtn.addEventListener("click", () => continueAfterLoadout());
  cardSwapRow.appendChild(leaveBtn);
  if (modalSetBonusStatusEl) {
    const progress = getModalSetBonusProgressLines();
    modalSetBonusStatusEl.textContent = progress.length ? progress.join("\n") : "";
  }
  renderCardSlots();
}

function getCardByZone(zoneId) {
  if (zoneId === "pickup") return state.pendingCard;
  const dr = parseDeckZoneId(zoneId);
  if (dr != null) return inventory.deckByRank[dr] || null;
  const bi = parseBpZoneId(zoneId);
  if (bi != null) return inventory.backpackSlots[bi] || null;
  return null;
}

function setCardByZone(zoneId, card) {
  if (zoneId === "pickup") state.pendingCard = card;
  else {
    const dr = parseDeckZoneId(zoneId);
    if (dr != null) inventory.deckByRank[dr] = card || null;
    else {
      const bi = parseBpZoneId(zoneId);
      if (bi != null) inventory.backpackSlots[bi] = card || null;
    }
  }
}

/** Keeps the modal "Card slot" row aligned with New pickup; when pickup is empty, infer rank from where the card went. */
function syncPickupTargetRankAfterSwap(fromZoneId, toZoneId, fromCardBefore, toCardBefore) {
  if (!state.cardPickupFlowActive) return;
  if (state.pendingCard) {
    state.pickupTargetRank = state.pendingCard.rank;
    return;
  }
  if (fromZoneId === "pickup") {
    const dTo = parseDeckZoneId(toZoneId);
    if (dTo != null) {
      state.pickupTargetRank = dTo;
      return;
    }
    const bTo = parseBpZoneId(toZoneId);
    if (bTo != null && !toCardBefore && fromCardBefore) {
      state.pickupTargetRank = fromCardBefore.rank;
      return;
    }
  }
  state.pickupTargetRank = null;
}

function swapCardsBetweenZones(fromZoneId, toZoneId) {
  if (!fromZoneId || !toZoneId || fromZoneId === toZoneId) return;

  const dFrom = parseDeckZoneId(fromZoneId);
  const dTo = parseDeckZoneId(toZoneId);
  const bFrom = parseBpZoneId(fromZoneId);
  const bTo = parseBpZoneId(toZoneId);
  const toPickup = toZoneId === "pickup";

  if (dFrom != null && dTo != null && dFrom !== dTo) return;

  const fromCard = getCardByZone(fromZoneId);
  const toCard = getCardByZone(toZoneId);
  if (!fromCard && !toCard) return;

  const allowStageToEmptyPickup =
    toPickup &&
    !state.pendingCard &&
    state.cardPickupFlowActive &&
    fromCard &&
    (bFrom != null ||
      (dFrom != null &&
        fromCard.rank === dFrom &&
        (state.pickupTargetRank == null || dFrom === state.pickupTargetRank)));
  if (toPickup && !state.pendingCard && !allowStageToEmptyPickup) return;
  if (toPickup && !fromCard) return;

  if (dFrom != null && fromCard && fromCard.rank !== dFrom) return;
  if (dTo != null && fromCard && fromCard.rank !== dTo) return;
  if (dTo != null && toCard && toCard.rank !== dTo) return;
  if (dFrom != null && toPickup && toCard && toCard.rank !== dFrom) return;
  if (dFrom != null && bTo != null && toCard && toCard.rank !== dFrom) return;

  setCardByZone(fromZoneId, toCard || null);
  setCardByZone(toZoneId, fromCard || null);
  syncPickupTargetRankAfterSwap(fromZoneId, toZoneId, fromCard, toCard);
  recalcCardPassives();
  renderCardModal();
}

function closeCardModal() {
  state.inventoryModalOpen = false;
  state.pendingCard = null;
  state.cardPickupFlowActive = false;
  state.pickupTargetRank = null;
  state.pausedForCard = true;
  state.waitingForMovementResume = true;
  state.playerHeadstartUntil = state.elapsed + 0.3;
  renderCardModal();
}

function continueAfterLoadout() {
  // Any unplaced pickup is discarded when continuing.
  state.pendingCard = null;
  closeCardModal();
}

function showSetBonusChoice() {
  // Set bonus selection now lives inside the inventory manager modal.
}

function outOfBoundsCircle(c) {
  // Infinite world in all directions.
  return false;
}

function collidesAnyObstacle(circle) {
  for (const obstacle of obstacles) {
    if (intersectsRectCircle(circle, obstacle)) return true;
  }
  return false;
}

/** After clubs burst (or any) phase-through ends inside a wall, snap to nearest free spot. */
function ejectPlayerFromObstaclesIfStuck() {
  const c = { x: player.x, y: player.y, r: player.r };
  if (!collidesAnyObstacle(c)) return;
  const STEP = 3;
  const ANGLES = 28;
  const MAX_R = 220;
  for (let rad = STEP; rad <= MAX_R; rad += STEP) {
    for (let i = 0; i < ANGLES; i++) {
      const ang = (i / ANGLES) * TAU;
      const cand = { x: player.x + Math.cos(ang) * rad, y: player.y + Math.sin(ang) * rad, r: player.r };
      if (!collidesAnyObstacle(cand)) {
        player.x = cand.x;
        player.y = cand.y;
        return;
      }
    }
  }
}

function isPointNearTerrain(x, y, extraRadius = 40) {
  const rr = extraRadius * extraRadius;
  for (const obstacle of obstacles) {
    const cx = clamp(x, obstacle.x, obstacle.x + obstacle.w);
    const cy = clamp(y, obstacle.y, obstacle.y + obstacle.h);
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy <= rr) return true;
  }
  return false;
}

function nearestTerrainInfo(x, y) {
  let bestDist = Infinity;
  let bestPoint = null;
  for (const obstacle of obstacles) {
    const cx = clamp(x, obstacle.x, obstacle.x + obstacle.w);
    const cy = clamp(y, obstacle.y, obstacle.y + obstacle.h);
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy);
    if (d < bestDist) {
      bestDist = d;
      bestPoint = { x: cx, y: cy };
    }
  }
  return { dist: bestDist, point: bestPoint };
}

function playerInsideSmoke() {
  for (const smoke of entities.smokeZones) {
    if (state.elapsed >= smoke.expiresAt) continue;
    const dx = player.x - smoke.x;
    const dy = player.y - smoke.y;
    if (dx * dx + dy * dy <= smoke.r * smoke.r) return true;
  }
  return false;
}

function isPlayerHuggingTerrain(margin = 20) {
  const probe = { x: player.x, y: player.y, r: player.r + margin };
  for (const obstacle of obstacles) {
    if (intersectsRectCircle(probe, obstacle)) return true;
  }
  return false;
}

function pointToSegmentDistanceSq(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const wx = px - x1;
  const wy = py - y1;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return (px - x1) ** 2 + (py - y1) ** 2;
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return (px - x2) ** 2 + (py - y2) ** 2;
  const b = c1 / c2;
  const bx = x1 + b * vx;
  const by = y1 + b * vy;
  return (px - bx) ** 2 + (py - by) ** 2;
}

function segmentIntersectsSmoke(x1, y1, x2, y2) {
  for (const smoke of entities.smokeZones) {
    if (state.elapsed >= smoke.expiresAt) continue;
    const d2 = pointToSegmentDistanceSq(smoke.x, smoke.y, x1, y1, x2, y2);
    if (d2 <= smoke.r * smoke.r) return true;
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

function hasLineOfSight(from, target, opts = {}) {
  const ignoreObstacles = !!opts.ignoreObstacles;
  if (segmentIntersectsSmoke(from.x, from.y, target.x, target.y)) return false;
  if (!ignoreObstacles) {
    for (const obstacle of obstacles) {
      if (lineIntersectsRect(from.x, from.y, target.x, target.y, obstacle)) return false;
    }
  }
  return true;
}

function getLaserEndpoint(x, y, dx, dy, maxLen = 900, opts = {}) {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  if (opts.throughObstacles) {
    return { x: x + ux * maxLen, y: y + uy * maxLen };
  }
  let lastX = x;
  let lastY = y;
  for (let d = 8; d <= maxLen; d += 8) {
    const px = x + ux * d;
    const py = y + uy * d;
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

function moveCircleWithCollisions(entity, vx, vy, dt, opts = {}) {
  const ignoreObstacles = !!opts.ignoreObstacles;
  let touchedObstacle = false;
  const nx = { x: entity.x + vx * dt, y: entity.y, r: entity.r };
  const nxBlocked = outOfBoundsCircle(nx) || (!ignoreObstacles && collidesAnyObstacle(nx));
  if (!nxBlocked) entity.x = nx.x;
  else if (!ignoreObstacles) touchedObstacle = true;
  const ny = { x: entity.x, y: entity.y + vy * dt, r: entity.r };
  const nyBlocked = outOfBoundsCircle(ny) || (!ignoreObstacles && collidesAnyObstacle(ny));
  if (!nyBlocked) entity.y = ny.y;
  else if (!ignoreObstacles) touchedObstacle = true;
  return { touchedObstacle };
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

function separatedFromExistingLoot(x, y, r, minGap = 68) {
  for (const p of entities.pickups) {
    if (Math.hypot(p.x - x, p.y - y) < p.r + r + minGap) return false;
  }
  for (const c of entities.cards) {
    if (Math.hypot(c.x - x, c.y - y) < c.r + r + minGap) return false;
  }
  return true;
}

function spawnLootPointClear(candidate) {
  if (collidesAnyObstacle(candidate)) return false;
  if (!separatedFromExistingLoot(candidate.x, candidate.y, candidate.r)) return false;
  const rr = candidate.r + player.r + 44;
  if (distSq(candidate, player) <= rr * rr) return false;
  return true;
}

/** Heals / cards: mix ring-around-player (readable spread) with hex-local picks. */
function randomOpenPoint(radius, attempts = 96) {
  const dMin = 96 + radius;
  const dMax = Math.min(VIEW_W, VIEW_H) * 0.66;
  const sourceHexes = activeHexes.length ? activeHexes : [{ q: 0, r: 0 }];

  for (let i = 0; i < attempts; i++) {
    let candidate;
    if (i % 2 === 0) {
      const ang = Math.random() * TAU;
      const d = rand(dMin, dMax);
      candidate = {
        x: player.x + Math.cos(ang) * d,
        y: player.y + Math.sin(ang) * d,
        r: radius,
      };
    } else {
      const h = sourceHexes[Math.floor(Math.random() * sourceHexes.length)];
      const c = hexToWorld(h.q, h.r);
      candidate = {
        x: c.x + rand(-TILE_W * 0.46, TILE_W * 0.46),
        y: c.y + rand(-TILE_W * 0.46, TILE_W * 0.46),
        r: radius,
      };
    }
    if (spawnLootPointClear(candidate)) return candidate;
  }
  for (let j = 0; j < 40; j++) {
    const ang = Math.random() * TAU;
    const d = rand(dMin, dMax * 0.92);
    const candidate = { x: player.x + Math.cos(ang) * d, y: player.y + Math.sin(ang) * d, r: radius };
    if (!collidesAnyObstacle(candidate)) return candidate;
  }
  return { x: player.x + rand(-100, 100), y: player.y + rand(-100, 100), r: radius };
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
    x: cx,
    y: cy,
    r,
  };
}

/** Nearest non-obstacle point for a small hunter (e.g. air-spawner swarm) from a preferred center. */
function nearestLegalPointForSmallHunter(cx, cy, r) {
  const center = { x: cx, y: cy, r };
  if (!collidesAnyObstacle(center) && !outOfBoundsCircle(center)) return center;
  const STEP = 5;
  const ANGLES = 32;
  const MAX_R = 260;
  for (let rad = STEP; rad <= MAX_R; rad += STEP) {
    for (let i = 0; i < ANGLES; i++) {
      const ang = (i / ANGLES) * TAU;
      const cand = { x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad, r };
      if (!outOfBoundsCircle(cand) && !collidesAnyObstacle(cand)) return cand;
    }
  }
  return randomOpenPoint(r);
}

function resolveFastSpawnNearAirSpawner(h, fastR) {
  const ideal = randomOpenPointAround(h.x, h.y, h.r + 12, h.r + 40, fastR, 56);
  return nearestLegalPointForSmallHunter(ideal.x, ideal.y, fastR);
}

function selectCharacter(id) {
  const picked = CHARACTERS[id];
  if (!picked) return;
  selectedCharacter = picked;
  abilities = makeAbilitiesForCharacter(selectedCharacter);
  passive.cooldownFlat = makeCooldownFlatForCharacter(selectedCharacter);
  passive.cooldownPct = makeCooldownPctForCharacter(selectedCharacter);
  refreshControlsHint();
}

function formatControlsHintLine() {
  if (selectedCharacter.id === "rogue") {
    return "Move: Arrows | Abilities: Q dash, W smoke bomb, E point to food | Pause: Space | Retry: R (character select)";
  }
  return "Move: Arrows | Abilities: Q dash, W speed burst, E decoy | Pause: Space | Retry: R (character select)";
}

function refreshControlsHint() {
  if (controlsHintEl) controlsHintEl.textContent = formatControlsHintLine();
}

function startGameWithCharacter(id) {
  selectCharacter(id);
  gameStarted = true;
  if (characterSelectModal) characterSelectModal.classList.remove("open");
  resetGame();
}

function characterTutorialHtml(id) {
  const k = CHARACTERS.knight.abilities;
  const r = CHARACTERS.rogue.abilities;
  if (id === "knight") {
    return `
      <p class="character-detail-lead">The <strong>Knight</strong> is a sturdy all-rounder: forgiving HP and a simple rhythm for learning waves, spacing, and how the arena moves.</p>
      <ul>
        <li><strong>Q — ${k.dash.label}:</strong> quick dart through gaps to slip out of pressure.</li>
        <li><strong>W — ${k.burst.label}:</strong> short speed surge that shoves hunters aside—break chokes or sprint to safety.</li>
        <li><strong>E — ${k.decoy.label}:</strong> drops a lure so hunters fixate elsewhere while you reposition.</li>
      </ul>
      <p class="character-detail-lead" style="margin-top:10px">Pause: Space · Retry: R returns to character select.</p>
    `;
  }
  if (id === "rogue") {
    return `
      <p class="character-detail-lead">The <strong>Hungry Rogue</strong> is always hungry and dies if he is not fed. Chase food across the arena to stay alive.</p>
      <ul>
        <li><strong>Passive:</strong> when you break line of sight on pursuers, you can enter stealth. Hug a wall while stealthed and you can stay hidden even across open sightlines—use corners and cover to slip past danger.</li>
        <li><strong>Q — ${r.dash.label}:</strong> hold to aim a direction, release to snap forward in a quick dash—your main burst of movement to dodge shots, round corners, or close distance.</li>
        <li><strong>W — ${r.burst.label}:</strong> throws a smoke bomb that leaves a lingering cloud—fight inside it or chain it with walls to control where you are visible.</li>
        <li><strong>E — ${r.decoy.label}:</strong> for a short window, on-screen cues point toward nearby food—use it when you are low and need to find the next bite fast.</li>
      </ul>
      <p class="character-detail-lead" style="margin-top:10px">The top-left <strong>Fed</strong> bar and the arcs around your hero show hunger and stealth grace. Pause: Space · Retry: R returns to character select.</p>
    `;
  }
  return "";
}

function wireCharacterSelect() {
  if (!characterSelectModal || !characterSelectOptions?.length) {
    afterDeathRetry = () => {
      resetGame();
      gameStarted = true;
    };
    startGameWithCharacter("knight");
    return;
  }

  const flowPickEl = characterSelectModal.querySelector("#character-select-flow-pick");
  const howtoPanelEl = characterSelectModal.querySelector("#character-select-howto-panel");
  const howtoOpenBtn = characterSelectModal.querySelector("#character-how-to-play-button");
  const howtoBackBtn = characterSelectModal.querySelector("#character-howto-back-button");
  const pick = characterSelectModal.querySelector("#character-select-pick");
  const confirm = characterSelectModal.querySelector("#character-select-confirm");
  const detailEl = characterSelectModal.querySelector("#character-detail");
  const confirmBtn = characterSelectModal.querySelector("#character-confirm-button");
  const backBtn = characterSelectModal.querySelector("#character-back-button");
  const titleEl = characterSelectModal.querySelector("#character-confirm-title");

  let pendingCharacterId = null;

  function showPick() {
    pendingCharacterId = null;
    if (flowPickEl) flowPickEl.hidden = false;
    if (howtoPanelEl) howtoPanelEl.hidden = true;
    if (confirm) confirm.hidden = true;
  }

  function showHowToPlay() {
    if (flowPickEl) flowPickEl.hidden = true;
    if (howtoPanelEl) howtoPanelEl.hidden = false;
    if (confirm) confirm.hidden = true;
    if (howtoBackBtn) howtoBackBtn.focus();
  }

  function showConfirm(id) {
    const ch = CHARACTERS[id];
    if (!ch) return;
    if (!pick || !confirm || !detailEl || !titleEl) {
      startGameWithCharacter(id);
      return;
    }
    pendingCharacterId = id;
    titleEl.textContent = `Confirm — ${ch.name}`;
    detailEl.innerHTML = characterTutorialHtml(id);
    if (flowPickEl) flowPickEl.hidden = true;
    if (howtoPanelEl) howtoPanelEl.hidden = true;
    confirm.hidden = false;
    if (confirmBtn) confirmBtn.focus();
  }

  characterSelectModal.classList.add("open");

  if (pick && confirm && detailEl && titleEl && confirmBtn && backBtn) {
    showPick();
    for (const btn of characterSelectOptions) {
      btn.addEventListener("click", () => {
        showConfirm(btn.dataset.characterId || "knight");
      });
    }
    confirmBtn.addEventListener("click", () => {
      if (pendingCharacterId) startGameWithCharacter(pendingCharacterId);
    });
    backBtn.addEventListener("click", showPick);
    if (howtoOpenBtn) howtoOpenBtn.addEventListener("click", showHowToPlay);
    if (howtoBackBtn) howtoBackBtn.addEventListener("click", showPick);
    afterDeathRetry = () => {
      showPick();
      characterSelectModal.classList.add("open");
    };
  } else {
    for (const btn of characterSelectOptions) {
      btn.addEventListener("click", () => {
        startGameWithCharacter(btn.dataset.characterId || "knight");
      });
    }
    afterDeathRetry = () => {
      resetGame();
      gameStarted = true;
    };
  }
}

function lootSpawnIntervalScale() {
  const activeCount = Math.max(1, activeHexes.length || 1);
  // Spawn slower as visible hex count rises to keep perceived loot density stable.
  return Math.max(1, Math.sqrt(activeCount / LOOT_DENSITY_BASE_ACTIVE_HEXES));
}

/** 0 at run start → 1 after DANGER_RAMP_SECONDS of survival (game time). */
function getDangerRamp01() {
  return clamp(state.elapsed / DANGER_RAMP_SECONDS, 0, 1);
}

function getSpawnIntervalFromRunTime() {
  const t = getDangerRamp01();
  return SPAWN_INTERVAL_START + (SPAWN_INTERVAL_FLOOR - SPAWN_INTERVAL_START) * t;
}

function resetGame() {
  if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
    if (cardModal?.contains(document.activeElement)) document.activeElement.blur();
  }
  state.keys.clear();
  tileCache.clear();
  state.running = true;
  state.elapsed = 0;
  state.lastTime = 0;
  state.wave = 0;
  state.spawnInterval = 8;
  state.nextSpawnAt = 3;
  state.spawnScheduled = [];
  state.nextPickupAt = 2.2;
  state.nextCardAt = 6.5;
  state.hurtFlash = 0;
  state.damageEvents = [];
  state.snapshotPending = false;
  state.playerInvulnerableUntil = 0;
  state.playerUntargetableUntil = 0;
  state.heartsDeathDefyReadyAt = 0;
  state.playerLaserSlowUntil = 0;
  state.playerTimelockUntil = 0;
  state.tempHp = 0;
  state.tempHpExpiry = 0;
  state.ultimateBurstWaves = [];
  state.timelockEnemyFrom = 0;
  state.timelockEnemyUntil = 0;
  state.timelockWorldShakeAt = 0;
  state.knightSpadesWorldSlowUntil = 0;
  state.screenShakeUntil = 0;
  state.screenShakeStrength = 0;
  state.deathStartedAtMs = 0;
  state.manualPause = false;
  state.pausedForCard = false;
  state.inventoryModalOpen = false;
  state.waitingForMovementResume = false;
  state.pendingCard = null;
  state.cardPickupFlowActive = false;
  state.pickupTargetRank = null;
  state.setBonusChoicePendingSuit = null;
  state.playerHeadstartUntil = 0;
  state.rogueHungerMax = 60;
  state.rogueHunger = state.rogueHungerMax;
  state.rogueLastSeenAt = 0;
  state.rogueAlertUntil = 0;
  state.rogueStealthActive = false;
  state.rogueStealthOpenUntil = 0;
  state.rogueFoodSenseUntil = 0;
  state.rogueNextFoodAt = 6;
  state.rogueNextHungryPopupAt = 8;
  state.rogueDashAiming = false;
  state.rogueLastKnownPlayerPos = { x: player.x, y: player.y };
  player.x = 96;
  player.y = 340;
  obstacles = [];
  activePlayerHex = { q: 0, r: 0 };
  activeHexes = [];
  lastPlayerHexKey = null;
  // Reset base survivability before deriving HP from cards/effects.
  player.maxHp = selectedCharacter.baseHp;
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
  abilities.random.nextReadyAt = 0;
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
  entities.cards = [];
  entities.healPopups = [];
  entities.smokeZones = [];
  entities.foods = [];
  inventory.deckByRank = makeEmptyDeckByRank();
  inventory.backpackSlots = [null, null, null];
  inventory.diamondEmpower = null;
  inventory.heartsRegenPerSec = 0;
  inventory.spadesLandingStealthUntil = 0;
  inventory.spadesObstacleBoostUntil = 0;
  inventory.clubsInvisUntil = 0;
  inventory.clubsPhaseThroughTerrain = false;
  inventory.rogueDiamondRangeBoost = false;
  inventory.heartsResistanceReadyAt = 0;
  inventory.heartsResistanceCooldownDuration = 0;
  inventory.heartsRegenBank = 0;
  inventory.dodgeTextUntil = 0;
  passive.cooldownFlat = makeCooldownFlatForCharacter(selectedCharacter);
  passive.cooldownPct = makeCooldownPctForCharacter(selectedCharacter);
  passive.speedMult = 1;
  passive.obstacleTouchMult = 1;
  passive.dodgeChanceWhenDashCd = 0;
  passive.stunOnHitSecs = 0;
  passive.invisOnBurst = 0;
  passive.dashChargesBonus = 0;
  passive.heartsShieldArc = 0;
  dashState.maxCharges = 1;
  dashState.charges = 1;
  dashState.nextRechargeAt = 0;

  recalcCardPassives();

  ensureTilesForPlayer();
  cameraX = player.x - VIEW_W / 2;
  cameraY = player.y - VIEW_H / 2;
  renderCardSlots();
  updateSetBonusStatus();
  renderCardModal();
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

function hunterPalette(type) {
  switch (type) {
    case "chaser":
      return { light: "#fecaca", core: "#dc2626", shadow: "#7f1d1d", rim: "#fca5a5", mark: "#fff1f2" };
    case "cutter":
      return { light: "#fde68a", core: "#d97706", shadow: "#78350f", rim: "#fcd34d", mark: "#fffbeb" };
    case "sniper":
      return { light: "#fbcfe8", core: "#db2777", shadow: "#831843", rim: "#f9a8d4", mark: "#fdf2f8" };
    case "laser":
      return { light: "#fecaca", core: "#ef4444", shadow: "#7f1d1d", rim: "#f87171", mark: "#fef2f2" };
    case "laserBlue":
      return { light: "#bfdbfe", core: "#2563eb", shadow: "#1e3a8a", rim: "#60a5fa", mark: "#eff6ff" };
    case "spawner":
      return { light: "#fecdd3", core: "#e11d48", shadow: "#881337", rim: "#fb7185", mark: "#fff1f2" };
    case "airSpawner":
      return { light: "#ddd6fe", core: "#7c3aed", shadow: "#4c1d95", rim: "#a78bfa", mark: "#f5f3ff" };
    case "ranged":
      return { light: "#bae6fd", core: "#0284c7", shadow: "#0c4a6e", rim: "#38bdf8", mark: "#f0f9ff" };
    case "fast":
      return { light: "#fed7aa", core: "#ea580c", shadow: "#7c2d12", rim: "#fb923c", mark: "#fff7ed" };
    default:
      return { light: "#ddd6fe", core: "#7c3aed", shadow: "#3b0764", rim: "#c4b5fd", mark: "#f5f3ff" };
  }
}

function drawHunterBody(ctx, h) {
  const pal = hunterPalette(h.type);
  const { x, y, r } = h;
  const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.08, x, y, r);
  g.addColorStop(0, pal.light);
  g.addColorStop(0.55, pal.core);
  g.addColorStop(1, pal.shadow);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = pal.rim;
  ctx.lineWidth = 2;
  ctx.stroke();
  const mx = h.dir.x * r * 0.38;
  const my = h.dir.y * r * 0.38;
  ctx.fillStyle = pal.mark;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.arc(x + mx, y + my, r * 0.22, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawDecoyBody(ctx, d) {
  const { x, y, r } = d;
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.05, x, y, r);
  g.addColorStop(0, "#ede9fe");
  g.addColorStop(0.5, "#a78bfa");
  g.addColorStop(1, "#5b21b6");
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(196, 181, 253, 0.85)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawProjectileBody(ctx, p) {
  const g = ctx.createRadialGradient(p.x - 1, p.y - 1, 0.5, p.x, p.y, p.r);
  g.addColorStop(0, "#fef3c7");
  g.addColorStop(0.4, "#f59e0b");
  g.addColorStop(1, "#b45309");
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(251, 191, 36, 0.9)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

function drawPlayerBody(ctx, invulnAlpha) {
  const px = player.x;
  const py = player.y;
  const pr = player.r;
  const core = playerColorByHealth();
  const g = ctx.createRadialGradient(px - pr * 0.42, py - pr * 0.48, pr * 0.06, px, py, pr);
  g.addColorStop(0, "rgba(248, 250, 252, 0.95)");
  g.addColorStop(0.38, core);
  g.addColorStop(1, "rgba(15, 23, 42, 0.88)");
  ctx.save();
  ctx.globalAlpha = invulnAlpha;
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(56, 189, 248, 0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();
  const fx = player.facing.x;
  const fy = player.facing.y;
  const tipX = px + fx * pr * 0.72;
  const tipY = py + fy * pr * 0.72;
  const ox = -fy * pr * 0.28;
  const oy = fx * pr * 0.28;
  ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(px + fx * pr * 0.15 + ox, py + fy * pr * 0.15 + oy);
  ctx.lineTo(px + fx * pr * 0.15 - ox, py + fy * pr * 0.15 - oy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPlayerHpHud(ctx) {
  const px = player.x;
  const py = player.y;
  const pr = player.r;
  const main = player.hp + " / " + player.maxHp;
  const extra = state.tempHp > 0 ? "+" + state.tempHp + " temp" : "";
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  const hpLift = selectedCharacter.id === "rogue" ? 7 : 0;
  const yMain = py - pr - 10 - hpLift;
  const yExtra = yMain - (extra ? 14 : 0);
  ctx.font = "bold 15px ui-sans-serif, system-ui, Segoe UI, sans-serif";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(2, 6, 23, 0.82)";
  ctx.strokeText(main, px, yMain);
  ctx.fillStyle = player.hp <= player.maxHp * 0.35 ? "#fca5a5" : "#f8fafc";
  ctx.fillText(main, px, yMain);
  if (extra) {
    ctx.font = "11px ui-sans-serif, system-ui, Segoe UI, sans-serif";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(2, 6, 23, 0.82)";
    ctx.strokeText(extra, px, yExtra);
    ctx.fillStyle = "#6ee7b7";
    ctx.fillText(extra, px, yExtra);
  }
  ctx.restore();
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

function triggerUltScreenShake(strength = 10, durationSec = 0.22) {
  state.screenShakeUntil = state.elapsed + durationSec;
  state.screenShakeStrength = Math.max(state.screenShakeStrength, strength);
}

/** Impact moment: bright flash + clean concentric shockwaves; `u` is 0..1. */
function drawArtilleryDetonationBang(ctx, zone, u) {
  const { x, y, r } = zone;
  const fade = 1 - u * u;
  const coreR = r * (0.5 + 0.2 * (1 - u));
  drawCircle(ctx, x, y, coreR, "#fef3c7", 0.38 * fade);
  drawCircle(ctx, x, y, coreR * 0.42, "#fffbeb", 0.48 * fade);

  const ringR = r * (0.4 + u * 1.25);
  ctx.strokeStyle = `rgba(254, 215, 170, ${0.72 * fade})`;
  ctx.lineWidth = 2.6 * (1 - u * 0.45);
  ctx.beginPath();
  ctx.arc(x, y, ringR, 0, TAU);
  ctx.stroke();

  const u2 = clamp((u - 0.1) / 0.9, 0, 1);
  if (u2 > 0) {
    const ringR2 = r * (0.32 + u2 * 1.05);
    ctx.strokeStyle = `rgba(248, 113, 113, ${0.58 * (1 - u2 * u2)})`;
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.arc(x, y, ringR2, 0, TAU);
    ctx.stroke();
  }

  const haloR = r * (0.72 + u * 0.8);
  ctx.strokeStyle = `rgba(255, 247, 237, ${0.36 * fade})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, haloR, 0, TAU);
  ctx.stroke();

  if (u < 0.28) {
    const sparkleT = 1 - u / 0.28;
    drawCircle(ctx, x, y, r * 0.28, "#fff7ed", 0.2 * sparkleT);
  }
}

/**
 * @param {object} [opts] Optional `bornAt` / `expiresAt` (otherwise `bornAt = now`, `expiresAt = bornAt + duration`).
 */
function spawnUltimateEffect(type, x, y, color, duration, radius, opts = {}) {
  const o = opts || {};
  const bornAt = o.bornAt != null ? o.bornAt : state.elapsed;
  const expiresAt = o.expiresAt != null ? o.expiresAt : bornAt + duration;
  const { bornAt: _b, expiresAt: _e, ...extra } = o;
  entities.ultimateEffects.push({
    type,
    x,
    y,
    color,
    bornAt,
    expiresAt,
    radius,
    ...extra,
  });
}

function setSnapshotStatus(text) {
  if (!deathSnapshotsEnabled || !snapshotStatus) return;
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
  if (!deathSnapshotsEnabled) return;
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
  if (!deathSnapshotsEnabled) return;
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
  } else if (type === "laserBlue") {
    r = 13;
    life = 8;
    lastShotAt = state.elapsed + rand(0.5, 1.0);
    h.laserState = "move";
    h.aimStartedAt = 0;
    h.nextLaserReadyAt = state.elapsed + rand(0.55, 1.1);
    h.laserCooldown = LASER_BLUE_COOLDOWN_SEC;
    h.laserWarning = LASER_BLUE_WARN_SEC;
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
  } else if (type === "airSpawner") {
    r = 26;
    life = 9;
    lastShotAt = state.elapsed + 999;
    // Swarms immediately (no charge delay); same active window as ground spawner after its charge.
    h.spawnDelayUntil = state.elapsed;
    h.spawnActiveUntil = state.elapsed + 9;
    h.nextSwarmAt = state.elapsed;
    h.swarmInterval = 0.62;
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

  const ang = Math.random() * TAU;
  const d = rand(320, 760);
  h.x = player.x + Math.cos(ang) * d;
  h.y = player.y + Math.sin(ang) * d;
  entities.hunters.push(h);
}

function midgameEscalationTicks() {
  if (state.elapsed < MIDGAME_ESCALATION_START_SEC) return 0;
  return 1 + Math.floor((state.elapsed - MIDGAME_ESCALATION_START_SEC) / MIDGAME_ESCALATION_INTERVAL_SEC);
}

/** Multiplier on hunter base speeds and similar (chaser dash, ranged shots). */
function midgameEnemySpeedMult() {
  const n = midgameEscalationTicks();
  if (n <= 0) return 1;
  return Math.pow(MIDGAME_ESCALATION_SPEED_FACTOR, n);
}

function pickRegularHunterType() {
  if (state.elapsed >= LATE_GAME_ELITE_SPAWN_SEC) {
    const er = Math.random();
    if (er < 0.055) return "airSpawner";
    if (er < 0.11) return "laserBlue";
  }
  const roll = Math.random();
  if (roll < 0.25) return "chaser";
  if (roll < 0.44) return "cutter";
  if (roll < 0.61) return "sniper";
  if (roll < 0.78) return "ranged";
  if (roll < 0.93) return "laser";
  return "spawner";
}

function hunterRadiusForType(type) {
  if (type === "sniper") return 12;
  if (type === "spawner") return 18;
  if (type === "airSpawner") return 26;
  if (type === "laser" || type === "laserBlue") return 13;
  if (type === "fast") return 9;
  return 10;
}

function scheduleWaveSpawns() {
  const jobs = [];
  const nJobs = BASE_WAVE_SPAWN_JOBS + midgameEscalationTicks();
  for (let i = 0; i < nJobs; i++) {
    jobs.push(() => {
      const type = pickRegularHunterType();
      const r = hunterRadiusForType(type);
      const ang = Math.random() * TAU;
      const d = rand(300, 780);
      const x = player.x + Math.cos(ang) * d;
      const y = player.y + Math.sin(ang) * d;
      spawnHunter(type, x, y);
    });
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
  state.spawnInterval = getSpawnIntervalFromRunTime();
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
    expiresAt: state.elapsed + 7.2,
    life: 7.2,
    heal: 3,
  });
}

function spawnCardPickup() {
  const point = randomOpenPoint(16);
  entities.cards.push({
    x: point.x,
    y: point.y,
    r: 16,
    card: makeRandomCard(),
    bornAt: state.elapsed,
    expiresAt: state.elapsed + 12,
  });
}

function spawnRogueFood() {
  const point = randomOpenPoint(13);
  entities.foods.push({
    x: point.x,
    y: point.y,
    r: 13,
    bornAt: state.elapsed,
    expiresAt: state.elapsed + ROGUE_FOOD_LIFETIME,
    nutrition: ROGUE_FOOD_HUNGER_RESTORE,
  });
}

function updateRogueNeeds(simDt, moving, touchedObstacle) {
  if (selectedCharacter.id !== "rogue") return;

  state.rogueHunger = Math.max(0, state.rogueHunger - simDt);
  if (state.rogueHunger <= 0) {
    player.hp = 0;
    state.running = false;
    state.deathStartedAtMs = state.lastTime;
    state.bestSurvival = Math.max(state.bestSurvival, state.elapsed);
    return;
  }

  while (state.elapsed >= state.rogueNextFoodAt) {
    spawnRogueFood();
    state.rogueNextFoodAt += rand(4.8, 7.8);
  }

  const inSmoke = playerInsideSmoke();
  const huggingTerrain = touchedObstacle || isPlayerHuggingTerrain(20) || isPointNearTerrain(player.x, player.y, 56);

  const canEnterStealth = state.elapsed - state.rogueLastSeenAt >= ROGUE_STEALTH_AFTER_LOS_BREAK || inSmoke;
  if (canEnterStealth && (huggingTerrain || inSmoke)) {
    state.rogueStealthActive = true;
    state.rogueStealthOpenUntil = state.elapsed + ROGUE_STEALTH_OPEN_GRACE;
  }
  if (state.rogueStealthActive) {
    // Stealth persists while hugging terrain (small margin) or while in smoke.
    if (huggingTerrain || inSmoke) {
      state.rogueStealthOpenUntil = state.elapsed + ROGUE_STEALTH_OPEN_GRACE;
    } else if (state.elapsed >= state.rogueStealthOpenUntil) {
      state.rogueStealthActive = false;
    }
  }

  const hungryRatio = 1 - clamp(state.rogueHunger / Math.max(0.001, state.rogueHungerMax), 0, 1);
  if (hungryRatio >= 0.25 && state.elapsed >= state.rogueNextHungryPopupAt) {
    spawnHealPopup(player.x, player.y - player.r - 12, "I'm hungry", "#67e8f9");
    const cadence = hungryRatio >= 0.7 ? 3.2 : hungryRatio >= 0.45 ? 5.2 : 7.0;
    state.rogueNextHungryPopupAt = state.elapsed + cadence;
  }

  for (let i = entities.foods.length - 1; i >= 0; i--) {
    const f = entities.foods[i];
    if (state.elapsed >= f.expiresAt) {
      entities.foods.splice(i, 1);
      continue;
    }
    const rr = f.r + player.r;
    if (distSq(f, player) <= rr * rr) {
      // Food restores hunger up to ROGUE_FOOD_HUNGER_RESTORE (not a full max refill).
      state.rogueHunger = Math.min(
        state.rogueHungerMax,
        Math.max(state.rogueHunger, f.nutrition ?? ROGUE_FOOD_HUNGER_RESTORE)
      );
      spawnHealPopup(player.x, player.y - player.r - 8, "Fed", "#fcd34d");
      entities.foods.splice(i, 1);
    }
  }
}

function updateRogueLineOfSightState() {
  if (selectedCharacter.id !== "rogue") {
    state.rogueHasEnemyLos = false;
    return;
  }
  let seen = false;
  for (const h of entities.hunters) {
    if (h.type === "spawner" || h.type === "airSpawner") continue;
    if (state.elapsed < (h.stunnedUntil || 0)) continue;
    if (hasLineOfSight(h, player)) {
      seen = true;
      break;
    }
  }
  state.rogueHasEnemyLos = seen;
  if (seen) state.rogueLastSeenAt = state.elapsed;
}

function anyOtherEnemyHasLineOfSightToPlayer(excludedHunter) {
  for (const h of entities.hunters) {
    if (h === excludedHunter) continue;
    if (h.type === "spawner" || h.type === "airSpawner") continue;
    if (state.elapsed < (h.stunnedUntil || 0)) continue;
    if (hasLineOfSight(h, player)) return true;
  }
  return false;
}

function spawnHealPopup(x, y, text = "+1", color = "#86efac", life = 0.6, fontPx = 14) {
  entities.healPopups.push({
    x,
    y,
    text,
    color,
    fontPx,
    bornAt: state.elapsed,
    expiresAt: state.elapsed + life,
  });
}

function forEachActiveCard(fn) {
  forEachDeckCard((card) => fn(card));
}

function getHeartsResistanceCardCount() {
  let n = 0;
  forEachActiveCard((card) => {
    if (card.effect?.kind === "hitResist") n++;
  });
  return n;
}

/** Same rule as `makeCardEffect` hearts hitResist, but active-slot ranks stack (two 9s → 18 → 6s). */
function getHeartsResistanceCooldown() {
  let totalRank = 0;
  forEachActiveCard((card) => {
    if (card.effect?.kind === "hitResist") totalRank += card.rank;
  });
  if (totalRank <= 0) return 15;
  return Math.max(3, 15 - 0.5 * totalRank);
}

function openCardPickupModal(card) {
  state.pausedForCard = true;
  state.inventoryModalOpen = true;
  state.waitingForMovementResume = false;
  state.pendingCard = card;
  state.cardPickupFlowActive = true;
  state.pickupTargetRank = card.rank;
  state.keys.clear();
  renderCardModal();
}

function updateCardPickups() {
  for (let i = entities.cards.length - 1; i >= 0; i--) {
    const c = entities.cards[i];
    if (state.elapsed >= c.expiresAt) {
      entities.cards.splice(i, 1);
      continue;
    }
    const rr = c.r + player.r;
    if (distSq(c, player) <= rr * rr) {
      openCardPickupModal(c.card);
      entities.cards.splice(i, 1);
      break;
    }
  }
}

function tryDash() {
  const ability = abilities.dash;
  if (!state.running) return;
  if (dashState.charges <= 0) return;
  let spadesCount = 0;
  forEachDeckCard((c) => {
    if (c.suit === "spades") spadesCount += 1;
  });
  /** Rogue: true stealth; Knight: Clubs burst invisibility only (no rogue stealth). */
  const qualifiesForSpadesDashBonus =
    (selectedCharacter.id === "rogue" && state.rogueStealthActive) ||
    state.elapsed < inventory.clubsInvisUntil;
  dashState.charges -= 1;
  if (dashState.charges < dashState.maxCharges) {
    const cd = effectiveAbilityCooldown("dash", ability.cooldown, ability.minCooldown ?? 0.25);
    dashState.nextRechargeAt = Math.max(dashState.nextRechargeAt, state.elapsed + cd);
  }
  const target = computeDashTarget();
  if (target.progressed) {
    player.x = target.x;
    player.y = target.y;
    if (selectedCharacter.id === "rogue" && spadesCount >= SET_BONUS_SUIT_THRESHOLD && qualifiesForSpadesDashBonus) {
      // Spades set bonus: actually re-enter stealth so patrol AI / HUD / contact rules match "stealth landing".
      state.rogueStealthActive = true;
      state.rogueStealthOpenUntil = Math.max(
        state.rogueStealthOpenUntil,
        state.elapsed + ROGUE_STEALTH_OPEN_GRACE + 0.12
      );
      inventory.spadesLandingStealthUntil = Math.max(
        inventory.spadesLandingStealthUntil,
        state.rogueStealthOpenUntil
      );
    }
  }
}

function currentDashDirection() {
  let mx = 0;
  let my = 0;
  if (state.keys.has("arrowleft")) mx -= 1;
  if (state.keys.has("arrowright")) mx += 1;
  if (state.keys.has("arrowup")) my -= 1;
  if (state.keys.has("arrowdown")) my += 1;
  if (mx || my) {
    const len = Math.hypot(mx, my) || 1;
    return { x: mx / len, y: my / len };
  }
  return { x: player.facing.x || 1, y: player.facing.y || 0 };
}

function currentDashRange() {
  if (selectedCharacter.id === "rogue") {
    if (deckSuitCounts.diamonds >= SET_BONUS_SUIT_MAX) return 220;
    return inventory.rogueDiamondRangeBoost ? 180 : 120;
  }
  return inventory.diamondEmpower === "dash2x" || diamondsOmniEmpowerActive() ? 240 : 120;
}

function computeDashTarget() {
  const dir = currentDashDirection();
  const step = 12;
  const dashRange = currentDashRange();
  let tx = player.x;
  let ty = player.y;
  let progressed = false;
  for (let d = step; d <= dashRange; d += step) {
    const test = { x: player.x + dir.x * d, y: player.y + dir.y * d, r: player.r };
    if (outOfBoundsCircle(test)) break;
    if (collidesAnyObstacle(test)) {
      if (selectedCharacter.id === "rogue") break;
      continue;
    }
    tx = test.x;
    ty = test.y;
    progressed = true;
  }
  return { x: tx, y: ty, progressed, dir, range: dashRange };
}

function startRogueDashAim() {
  if (selectedCharacter.id !== "rogue") return;
  if (!state.running || state.pausedForCard || state.inventoryModalOpen) return;
  if (dashState.charges <= 0) return;
  state.rogueDashAiming = true;
}

function releaseRogueDashAim() {
  if (selectedCharacter.id !== "rogue") return;
  if (!state.rogueDashAiming) return;
  state.rogueDashAiming = false;
  tryDash();
}

function tryBurst() {
  const ability = abilities.burst;
  if (state.elapsed < ability.nextReadyAt || !state.running) return;
  if (selectedCharacter.id === "rogue") {
    ability.nextReadyAt = state.elapsed + effectiveAbilityCooldown("burst", ability.cooldown, ability.minCooldown ?? 1);
    entities.smokeZones.push({
      x: player.x,
      y: player.y,
      r: deckSuitCounts.diamonds >= SET_BONUS_SUIT_MAX ? 300 : inventory.rogueDiamondRangeBoost ? 260 : 180,
      bornAt: state.elapsed,
      expiresAt: state.elapsed + (ability.duration ?? 3),
    });
    spawnAttackRing(player.x, player.y, 72, "#94a3b8", 0.2);
    spawnAttackRing(player.x, player.y, 128, "#cbd5e1", 0.28);
    return;
  }
  const burstCd = effectiveAbilityCooldown("burst", ability.cooldown, ability.minCooldown ?? 0.4);
  ability.nextReadyAt = state.elapsed + burstCd;
  const burstDurBonus = knightDiamondBurstEmpowerActive() ? KNIGHT_DIAMOND_BURST_DURATION_BONUS_SEC : 0;
  player.burstUntil = state.elapsed + ability.duration + burstDurBonus;
  if (selectedCharacter.id !== "rogue" && passive.invisOnBurst > 0) {
    inventory.clubsInvisUntil = Math.max(inventory.clubsInvisUntil, state.elapsed + passive.invisOnBurst);
  }
}

function tryDecoy() {
  const ability = abilities.decoy;
  if (state.elapsed < ability.nextReadyAt || !state.running) return;
  if (selectedCharacter.id === "rogue") {
    ability.nextReadyAt = state.elapsed + Math.max(ability.minCooldown ?? 0.5, ability.cooldown);
    state.rogueFoodSenseUntil = Math.max(state.rogueFoodSenseUntil, state.elapsed + ROGUE_FOOD_SENSE_DURATION);
    return;
  }
  const decoyEmpower = inventory.diamondEmpower === "decoyLead" || diamondsOmniEmpowerActive();
  const decoyCd = effectiveAbilityCooldown("decoy", ability.cooldown, ability.minCooldown ?? 0.4, decoyEmpower ? 2 : 0);
  ability.nextReadyAt = state.elapsed + decoyCd;
  entities.decoys.push({
    x: player.x,
    y: player.y,
    r: player.r,
    hp: 3,
    invulnerableUntil: state.elapsed + 0.4,
    expiresAt: state.elapsed + 6 + (decoyEmpower ? 1 : 0),
  });
}

function applyUltimateBurstWavePush(burstRadius) {
  for (const h of entities.hunters) {
    const d2 = distSq(player, h);
    if (d2 > burstRadius * burstRadius) continue;
    const away = vectorToTarget(player, h);
    const push = h.type === "spawner" || h.type === "airSpawner" ? 0 : 95;
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
}

function processUltimateBurstWaves() {
  const waves = state.ultimateBurstWaves;
  if (!waves.length) return;
  const r = ULT_BURST_RADIUS;
  while (waves.length && state.elapsed >= waves[0]) {
    waves.shift();
    applyUltimateBurstWavePush(r);
    triggerUltScreenShake(11, 0.16);
    spawnAttackRing(player.x, player.y, r * 0.92, "#e0f2fe", 0.26);
    spawnAttackRing(player.x, player.y, r * 0.72, "#93c5fd", 0.22);
    spawnAttackRing(player.x, player.y, r * 0.48, "#bfdbfe", 0.18);
    spawnUltimateEffect("burstWave", player.x, player.y, "#93c5fd", 0.52, r);
  }
}

function useRandomAbility() {
  const ability = abilities.random;
  if (!state.running || !ability.type || ability.ammo <= 0) return;
  if (state.elapsed < ability.nextReadyAt) return;
  if (state.playerTimelockUntil > state.elapsed) return;

  if (ability.type === "shield") {
    triggerUltScreenShake(9, 0.2);
    spawnAttackRing(player.x, player.y, player.r + 28, "#ffffff", 0.12);
    spawnAttackRing(player.x, player.y, player.r + 52, "#bfdbfe", 0.34);
    spawnAttackRing(player.x, player.y, player.r + 88, "#60a5fa", 0.42);
    spawnUltimateEffect("shieldSummon", player.x, player.y, "#93c5fd", 0.95, 88);
    entities.shields = [];
    const orbitR = player.r + ULT_ORBIT_SHIELD_RADIUS_EXTRA;
    const t0 = state.elapsed;
    for (let i = 0; i < 4; i++) {
      entities.shields.push({
        angle: (TAU / 4) * i,
        radius: orbitR,
        r: 10,
        bornAt: t0,
        expiresAt: state.elapsed + ULT_ORBIT_SHIELD_STAGGER_SEC * (i + 1),
      });
    }
  } else if (ability.type === "burst") {
    player.ultimateSpeedUntil = state.elapsed + ULT_BURST_WAVE_SPAN_SEC;
    state.ultimateBurstWaves = [];
    for (let i = 0; i < ULT_BURST_WAVE_COUNT; i++) {
      state.ultimateBurstWaves.push(state.elapsed + (i * ULT_BURST_WAVE_SPAN_SEC) / ULT_BURST_WAVE_COUNT);
    }
    triggerUltScreenShake(13, 0.24);
    spawnAttackRing(player.x, player.y, ULT_BURST_RADIUS * 0.35, "#ffffff", 0.14);
    spawnAttackRing(player.x, player.y, ULT_BURST_RADIUS * 0.72, "#bfdbfe", 0.24);
    spawnAttackRing(player.x, player.y, ULT_BURST_RADIUS * 0.95, "#93c5fd", 0.28);
    spawnUltimateEffect("burstWave", player.x, player.y, "#e0f2fe", 0.4, ULT_BURST_RADIUS * 0.6);
  } else if (ability.type === "timelock") {
    state.playerTimelockUntil = Math.max(state.playerTimelockUntil, state.elapsed + 2);
    state.playerInvulnerableUntil = Math.max(state.playerInvulnerableUntil, state.elapsed + 2);
    state.timelockEnemyFrom = state.elapsed + 2;
    state.timelockEnemyUntil = state.elapsed + 4;
    state.timelockWorldShakeAt = state.elapsed + 2;
    triggerUltScreenShake(6, 0.18);
    spawnAttackRing(player.x, player.y, player.r + 18, "#faf5ff", 0.22);
    spawnAttackRing(player.x, player.y, player.r + 36, "#e9d5ff", 0.32);
    spawnAttackRing(player.x, player.y, player.r + 58, "#c084fc", 0.4);
    spawnUltimateEffect("timelock", player.x, player.y, "#c084fc", 4, 56);
    spawnUltimateEffect(
      "timelockWorld",
      player.x,
      player.y,
      "#c4b5fd",
      2,
      ULT_BURST_RADIUS * 1.05,
      { bornAt: state.elapsed + 2, expiresAt: state.elapsed + 4 }
    );
  } else if (ability.type === "heal") {
    state.tempHp = 3;
    state.tempHpExpiry = state.elapsed + 20;
    triggerUltScreenShake(7, 0.18);
    spawnAttackRing(player.x, player.y, player.r + 18, "#ecfdf5", 0.2);
    spawnAttackRing(player.x, player.y, player.r + 38, "#bbf7d0", 0.34);
    spawnAttackRing(player.x, player.y, player.r + 62, "#34d399", 0.42);
    spawnUltimateEffect("healVitality", player.x, player.y, "#34d399", 1.15, 72);
    spawnHealPopup(player.x, player.y - player.r - 20, "+3", "#6ee7b7", 1.0, 16);
    spawnHealPopup(player.x, player.y - player.r - 36, "VITALITY", "#a7f3d0", 0.85, 12);
  }

  ability.ammo -= 1;
  ability.nextReadyAt = state.elapsed + ULTIMATE_ABILITY_COOLDOWN_SEC;

  if (
    selectedCharacter.id === "knight" &&
    countSuitsInActiveSlots().spades >= SET_BONUS_SUIT_THRESHOLD
  ) {
    state.knightSpadesWorldSlowUntil = state.elapsed + KNIGHT_SPADES_WORLD_SLOW_SEC;
  }
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
  if (state.elapsed < state.playerUntargetableUntil) {
    return nearestDecoy(hunter) || { x: hunter.x + hunter.dir.x * 40, y: hunter.y + hunter.dir.y * 40 };
  }
  if (selectedCharacter.id === "rogue") {
    if (state.elapsed < inventory.spadesLandingStealthUntil) {
      return nearestDecoy(hunter) || { x: hunter.x + hunter.dir.x * 40, y: hunter.y + hunter.dir.y * 40 };
    }
    if (state.rogueStealthActive) {
      return nearestDecoy(hunter) || { x: hunter.x + hunter.dir.x * 40, y: hunter.y + hunter.dir.y * 40 };
    }
    const hasLosToPlayer = hasLineOfSight(hunter, player);
    if (hasLosToPlayer) {
      state.rogueLastSeenAt = state.elapsed;
      state.rogueAlertUntil = Math.max(state.rogueAlertUntil, state.elapsed + 1.4);
      state.rogueLastKnownPlayerPos = { x: player.x, y: player.y };
      return player;
    }
    // Broken LoS: pursue last known location only (do not live-track player).
    return state.rogueLastKnownPlayerPos || { x: hunter.x + hunter.dir.x * 40, y: hunter.y + hunter.dir.y * 40 };
  }
  let target = player;
  if (
    state.elapsed < inventory.clubsInvisUntil ||
    (selectedCharacter.id === "rogue" && state.elapsed < inventory.spadesLandingStealthUntil)
  ) {
    return nearestDecoy(hunter) || { x: hunter.x + hunter.dir.x * 40, y: hunter.y + hunter.dir.y * 40 };
  }
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
    if (h.type === "spawner") continue;
    if (state.elapsed < (h.stunnedUntil || 0)) continue;
    const spDt = dt * spades13AuraEnemyDtMult(h.x, h.y);

    if (h.type === "airSpawner") {
      const target = pickTargetForHunter(h);
      const desired = vectorToTarget(h, target);
      const airSpeed = AIR_SPAWNER_CHASE_SPEED * midgameEnemySpeedMult();
      // Crow-flies toward target; ignore terrain (no wall avoidance).
      h.dir.x = h.dir.x * 0.22 + desired.x * 0.78;
      h.dir.y = h.dir.y * 0.22 + desired.y * 0.78;
      const alen = Math.hypot(h.dir.x, h.dir.y) || 1;
      h.dir.x /= alen;
      h.dir.y /= alen;
      moveCircleWithCollisions(h, h.dir.x * airSpeed, h.dir.y * airSpeed, spDt, { ignoreObstacles: true });
      continue;
    }

    const lifeSpan = h.life || Math.max(0.0001, h.dieAt - h.bornAt);
    const age = clamp((state.elapsed - h.bornAt) / lifeSpan, 0, 1);
    const speedFactor = 1 + age * HUNTER_SPEED_AGE_COEFF;
    const baseSpeed =
      h.type === "sniper"
        ? 100
        : h.type === "cutter"
          ? 116
          : h.type === "laser" || h.type === "laserBlue"
            ? h.type === "laserBlue"
              ? 156
              : 138
          : h.type === "ranged"
            ? 85
            : h.type === "fast"
              ? 150
              : 110;
    let speed = baseSpeed * speedFactor * midgameEnemySpeedMult();
    const rogueInSeekMode = selectedCharacter.id === "rogue" && state.elapsed > state.rogueAlertUntil;
    if (rogueInSeekMode) speed *= 0.58;

    if (selectedCharacter.id === "rogue" && state.rogueStealthActive) {
      // While rogue is stealthed, enemies drift/patrol rather than collapse onto the player.
      if (!h.patrolDir || state.elapsed >= (h.patrolTurnAt ?? 0)) {
        const ang = Math.random() * TAU;
        h.patrolDir = { x: Math.cos(ang), y: Math.sin(ang) };
        h.patrolTurnAt = state.elapsed + rand(0.8, 1.8);
      }
      const patrolSteer = avoidObstacles(h, h.patrolDir);
      h.dir.x = h.dir.x * 0.7 + patrolSteer.x * 0.3;
      h.dir.y = h.dir.y * 0.7 + patrolSteer.y * 0.3;
      const plen = Math.hypot(h.dir.x, h.dir.y) || 1;
      h.dir.x /= plen;
      h.dir.y /= plen;
      moveCircleWithCollisions(h, h.dir.x * speed * 0.38, h.dir.y * speed * 0.38, spDt);
      continue;
    }

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
      const target = pickTargetForHunter(h);
      const away = vectorToTarget(target, h);
      const toward = vectorToTarget(h, target);
      const d2 = distSq(h, target);
      desired = d2 < 210 * 210 ? away : toward;
    } else if (h.type === "ranged") {
      const target = pickTargetForHunter(h);
      const d2 = distSq(h, target);
      const away = vectorToTarget(target, h);
      const toward = vectorToTarget(h, target);
      desired = d2 < 240 * 240 ? away : toward;
    } else if (h.type === "laser" || h.type === "laserBlue") {
      const isBlue = h.type === "laserBlue";
      const target = pickTargetForHunter(h);
      const los = isBlue ? hasLineOfSight(h, target, { ignoreObstacles: true }) : hasLineOfSight(h, target);

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
            blueLaser: isBlue,
          });
          spawnAttackRing(h.x, h.y, h.r + 9, isBlue ? "#3b82f6" : "#ef4444", 0.16);
          if (!hitDecoyAlongSegment(aim.x1, aim.y1, aim.x2, aim.y2, 5)) {
            const hitDist = pointToSegmentDistance(player.x, player.y, aim.x1, aim.y1, aim.x2, aim.y2);
            if (hitDist <= player.r + 5) damagePlayer(2, isBlue ? { laserBlueSlow: true } : {});
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
        const endpoint = isBlue
          ? getLaserEndpoint(h.x, h.y, aimDirX, aimDirY, 900, { throughObstacles: true })
          : getLaserEndpoint(h.x, h.y, aimDirX, aimDirY);
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
          blueLaser: isBlue,
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
        const dashSpeed = 405 * speedFactor * midgameEnemySpeedMult();
        const stepLen = Math.min(dashSpeed * spDt, 24);
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
    moveCircleWithCollisions(h, h.dir.x * speed, h.dir.y * speed, spDt);
  }
}

function updateRangedAttackers(dt) {
  for (const h of entities.hunters) {
    if (h.type !== "ranged") continue;
    if (state.elapsed - h.lastShotAt < h.shotInterval) continue;
    const target = pickTargetForHunter(h);
    if (selectedCharacter.id === "rogue" && target !== player) continue;
    h.lastShotAt = state.elapsed;
    spawnAttackRing(h.x, h.y, h.r + 7, "#fb923c", 0.14);

    const to = vectorToTarget(h, target);
    const speed = (h.shotSpeed || 360) * midgameEnemySpeedMult();
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
    const sp = spades13AuraEnemyDtMult(p.x, p.y);
    p.x += p.vx * dt * sp;
    p.y += p.vy * dt * sp;

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
    if (h.type !== "spawner" && h.type !== "airSpawner") continue;
    if (state.elapsed < h.spawnDelayUntil) continue;
    if (state.elapsed >= h.spawnActiveUntil) continue;
    if (state.elapsed < h.nextSwarmAt) continue;

    // If the framerate hiccups, catch up by spawning at most a few times.
    let safety = 0;
    while (state.elapsed >= h.nextSwarmAt && safety < 4) {
      h.nextSwarmAt += h.swarmInterval;
      safety++;

      spawnAttackRing(h.x, h.y, h.r + 12, h.type === "airSpawner" ? "#a78bfa" : "#fb7185", 0.12);

      const fastR = h.fastR || 10;
      const swarmN = h.swarmN || 5;
      for (let i = 0; i < swarmN; i++) {
        const open =
          h.type === "airSpawner"
            ? resolveFastSpawnNearAirSpawner(h, fastR)
            : randomOpenPointAround(h.x, h.y, h.r + 16, h.r + 34, fastR, 25);
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

function damagePlayer(amount, opts = {}) {
  if (!state.running) return;
  if (selectedCharacter.id === "rogue" && state.rogueStealthActive) return;
  if (selectedCharacter.id === "rogue" && state.elapsed < inventory.spadesLandingStealthUntil) return;
  if (state.elapsed < state.playerInvulnerableUntil) return;
  if (state.elapsed < state.playerUntargetableUntil) return;
  if (amount <= 0) return;
  if (state.elapsed < inventory.clubsInvisUntil) return;
  if (cdr(abilities.dash) > 0 && Math.random() < passive.dodgeChanceWhenDashCd) {
    inventory.dodgeTextUntil = state.elapsed + 0.8;
    return;
  }
  const heartsResistanceCount = getHeartsResistanceCardCount();
  if (heartsResistanceCount > 0 && state.elapsed >= inventory.heartsResistanceReadyAt) {
    const cd = getHeartsResistanceCooldown();
    inventory.heartsResistanceCooldownDuration = cd;
    inventory.heartsResistanceReadyAt = state.elapsed + cd;
    return;
  }
  let rem = amount;
  if (state.tempHp > 0) {
    const absorbed = Math.min(rem, state.tempHp);
    state.tempHp -= absorbed;
    rem -= absorbed;
    if (state.tempHp <= 0) clearTempHp();
  }
  if (rem > 0) player.hp = Math.max(0, player.hp - rem);
  if (rem > 0 && deckSuitCounts.clubs >= SET_BONUS_SUIT_MAX) {
    state.playerUntargetableUntil = state.elapsed + CLUBS_13_UNTARGETABLE_SEC;
  }
  if (opts.laserBlueSlow) {
    state.playerLaserSlowUntil = state.elapsed + LASER_BLUE_PLAYER_SLOW_SEC;
  }
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
  if (passive.stunOnHitSecs > 0) {
    for (const h of entities.hunters) {
      if (distSq(h, player) <= 220 * 220) h.stunnedUntil = Math.max(h.stunnedUntil || 0, state.elapsed + passive.stunOnHitSecs);
    }
  }
  if (player.hp <= 0) {
    if (
      deckSuitCounts.hearts >= SET_BONUS_SUIT_MAX &&
      state.elapsed >= state.heartsDeathDefyReadyAt
    ) {
      player.hp = 5;
      state.heartsDeathDefyReadyAt = state.elapsed + HEARTS_13_DEATH_DEFY_CD_SEC;
      state.playerInvulnerableUntil = state.elapsed + 0.55;
      spawnHealPopup(player.x, player.y - player.r - 16, "DEFIED", "#fb7185", 1.1, 17);
      return;
    }
    state.deathCount += 1;
    if (deathSnapshotsEnabled) state.snapshotPending = true;
    state.running = false;
    state.deathStartedAtMs = state.lastTime;
    state.bestSurvival = Math.max(state.bestSurvival, state.elapsed);
  }
}

function updateSnipers(dt) {
  for (const h of entities.hunters) {
    if (h.type !== "sniper") continue;
    if (state.elapsed - h.lastShotAt < 2.1) continue;
    const target = pickTargetForHunter(h);
    if (selectedCharacter.id === "rogue" && target !== player) continue;
    // Rogue stealth rule: artillery requires another enemy currently seeing the rogue.
    if (selectedCharacter.id === "rogue" && !anyOtherEnemyHasLineOfSightToPlayer(h)) continue;
    h.lastShotAt = state.elapsed;
    spawnAttackRing(h.x, h.y, h.r + 6, "#fb7185", 0.2);
    const windup = SNIPER_ARTILLERY_WINDUP;
    const leadT = windup * SNIPER_ARTILLERY_LEAD;
    const tvx = target === player ? player.velX : 0;
    const tvy = target === player ? player.velY : 0;
    let aimX = target.x + tvx * leadT + rand(-12, 12);
    let aimY = target.y + tvy * leadT + rand(-12, 12);
    aimX = clamp(aimX, player.x - VIEW_W * 0.9, player.x + VIEW_W * 0.9);
    aimY = clamp(aimY, player.y - VIEW_H * 0.9, player.y + VIEW_H * 0.9);
    entities.dangerZones.push({
      x: aimX,
      y: aimY,
      r: 28,
      bornAt: state.elapsed,
      detonateAt: state.elapsed + windup,
      lingerUntil: state.elapsed + windup + 1.8,
      nextTickAt: state.elapsed + windup + 0.25,
      tickInterval: 0.3,
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
    if (zone.exploded && state.elapsed < (zone.lingerUntil ?? zone.detonateAt) && state.elapsed >= (zone.nextTickAt ?? Infinity)) {
      zone.nextTickAt += zone.tickInterval ?? 0.3;
      if (!hitDecoyIfAny(zone, zone.r * 0.92)) {
        const rr = zone.r * 0.92 + player.r;
        if (distSq(zone, player) <= rr * rr) damagePlayer(1);
      }
    }
    const zu = zone.windup != null ? zone.windup : 0.8;
    const lingerTotal = Math.max(zu + 0.48, (zone.lingerUntil ?? zone.bornAt) - zone.bornAt);
    if (state.elapsed - zone.bornAt > lingerTotal) entities.dangerZones.splice(i, 1);
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
      entities.pickups.splice(i, 1);
    }
  }
}

function cdr(ability) {
  if (ability === abilities.dash) {
    if (dashState.charges >= dashState.maxCharges) return 0;
    return Math.max(0, dashState.nextRechargeAt - state.elapsed);
  }
  return Math.max(0, ability.nextReadyAt - state.elapsed);
}

function updateSpecialAbilityEffects(dt) {
  if (inventory.diamondEmpower === "decoyLead" || diamondsOmniEmpowerActive()) {
    for (const d of entities.decoys) {
      const away = vectorToTarget(player, d);
      moveCircleWithCollisions(d, away.x * 110, away.y * 110, dt * spades13AuraEnemyDtMult(d.x, d.y));
    }
  }

  for (let i = entities.shields.length - 1; i >= 0; i--) {
    if (state.elapsed >= entities.shields[i].expiresAt) {
      entities.shields.splice(i, 1);
      continue;
    }
  }
  for (const shield of entities.shields) {
    shield.angle += dt * 3.8;
    shield.x = player.x + Math.cos(shield.angle) * shield.radius;
    shield.y = player.y + Math.sin(shield.angle) * shield.radius;
  }

  for (const shield of entities.shields) {
    for (const h of entities.hunters) {
      if (h.type === "spawner" || h.type === "airSpawner") continue;
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

  if (passive.heartsShieldArc > 0) {
    const facingAngle = Math.atan2(player.facing.y, player.facing.x);
    const halfArc = (passive.heartsShieldArc * Math.PI) / 360;
    const shieldR = player.r + 30;
    for (const h of entities.hunters) {
      if (h.type === "spawner" || h.type === "airSpawner") continue;
      const dx = h.x - player.x;
      const dy = h.y - player.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > shieldR + h.r) continue;
      const ang = Math.atan2(dy, dx);
      let delta = ang - facingAngle;
      while (delta > Math.PI) delta -= TAU;
      while (delta < -Math.PI) delta += TAU;
      if (Math.abs(delta) > halfArc) continue;
      const away = vectorToTarget(player, h);
      const test = { x: h.x + away.x * 34, y: h.y + away.y * 34, r: h.r };
      if (!outOfBoundsCircle(test) && !collidesAnyObstacle(test)) {
        h.x = test.x;
        h.y = test.y;
      }
      h.dir.x = away.x;
      h.dir.y = away.y;
    }
    for (let i = entities.projectiles.length - 1; i >= 0; i--) {
      const p = entities.projectiles[i];
      const dx = p.x - player.x;
      const dy = p.y - player.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > shieldR + p.r) continue;
      const ang = Math.atan2(dy, dx);
      let delta = ang - facingAngle;
      while (delta > Math.PI) delta -= TAU;
      while (delta < -Math.PI) delta += TAU;
      if (Math.abs(delta) > halfArc) continue;
      entities.projectiles.splice(i, 1);
      spawnAttackRing(player.x + dx * 0.65, player.y + dy * 0.65, 12, "#fda4af", 0.12);
    }
  }
}

function updateLaserHazards() {
  for (const beam of entities.laserBeams) {
    if (beam.warning || !beam.active) continue;
    if (!hitDecoyAlongSegment(beam.x1, beam.y1, beam.x2, beam.y2, 5)) {
      const hitDist = pointToSegmentDistance(player.x, player.y, beam.x1, beam.y1, beam.x2, beam.y2);
      if (hitDist <= player.r + 5) damagePlayer(2, beam.blueLaser ? { laserBlueSlow: true } : {});
    }
  }
}

function update(dt) {
  if (!gameStarted) return;
  if (!state.running) return;
  if (state.manualPause) return;
  if (state.pausedForCard) return;
  const simDt = dt;
  state.elapsed += simDt;
  updateRogueLineOfSightState();
  const enemiesFrozen = state.elapsed < state.playerHeadstartUntil;
  const timelockWorldFrozen =
    state.timelockEnemyUntil > state.elapsed && state.elapsed >= state.timelockEnemyFrom;
  const pauseHostiles = enemiesFrozen || timelockWorldFrozen;
  const knightSpadesWorldSlowActive =
    selectedCharacter.id === "knight" && state.elapsed < state.knightSpadesWorldSlowUntil;
  const enemySimDt = knightSpadesWorldSlowActive ? simDt * KNIGHT_SPADES_WORLD_SLOW_MULT : simDt;
  state.hurtFlash = Math.max(0, state.hurtFlash - simDt);
  state.screenShakeStrength = Math.max(0, state.screenShakeStrength - simDt * 30);
  if (state.elapsed >= state.playerTimelockUntil) state.playerTimelockUntil = 0;
  if (state.timelockEnemyUntil > 0 && state.elapsed >= state.timelockEnemyUntil) {
    state.timelockEnemyFrom = 0;
    state.timelockEnemyUntil = 0;
  }
  if (state.timelockWorldShakeAt > 0 && state.elapsed >= state.timelockWorldShakeAt) {
    state.timelockWorldShakeAt = 0;
    triggerUltScreenShake(20, 0.38);
  }
  processUltimateBurstWaves();
  if (
    abilities.random.type &&
    state.elapsed >= abilities.random.nextReadyAt &&
    abilities.random.ammo < abilities.random.maxAmmo
  ) {
    abilities.random.ammo = abilities.random.maxAmmo;
  }
  if (state.tempHp > 0 && state.tempHpExpiry > 0 && state.elapsed >= state.tempHpExpiry) clearTempHp();
  if (inventory.heartsRegenPerSec > 0 && player.hp > 0) {
    inventory.heartsRegenBank += inventory.heartsRegenPerSec * simDt;
    while (inventory.heartsRegenBank >= 1 && player.hp < player.maxHp) {
      inventory.heartsRegenBank -= 1;
      player.hp = Math.min(player.maxHp, player.hp + 1);
      spawnHealPopup(player.x, player.y - player.r - 8, "+1", "#86efac");
    }
    if (player.hp >= player.maxHp) inventory.heartsRegenBank = 0;
  }
  if (dashState.charges < dashState.maxCharges && state.elapsed >= dashState.nextRechargeAt) {
    // Dash recharge refills all charges together.
    dashState.charges = dashState.maxCharges;
    dashState.nextRechargeAt = 0;
  }

  // Ensure procedural hex chunks + obstacle cache are valid for the player.
  ensureTilesForPlayer();
  const targetCameraX = player.x - VIEW_W / 2;
  const targetCameraY = player.y - VIEW_H / 2;
  const cameraBlend = 1 - Math.pow(1 - CAMERA_FOLLOW_LERP, simDt * 60);
  cameraX += (targetCameraX - cameraX) * cameraBlend;
  cameraY += (targetCameraY - cameraY) * cameraBlend;

  while (state.spawnScheduled.length && state.spawnScheduled[0].at <= state.elapsed) {
    state.spawnScheduled.shift().fn();
  }
  if (state.elapsed >= state.nextSpawnAt) advanceSpawnWave();
  if (state.elapsed >= state.nextPickupAt) {
    spawnPickup();
    const lootScale = lootSpawnIntervalScale();
    state.nextPickupAt = state.elapsed + (PICKUP_SPAWN_INTERVAL + rand(-0.45, 0.85)) * lootScale;
  }
  if (state.elapsed >= state.nextCardAt) {
    spawnCardPickup();
    const lootScale = lootSpawnIntervalScale();
    state.nextCardAt = state.elapsed + (CARD_SPAWN_INTERVAL + rand(-1.6, 3.4)) * lootScale;
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
  for (let i = entities.healPopups.length - 1; i >= 0; i--) {
    if (state.elapsed >= entities.healPopups[i].expiresAt) entities.healPopups.splice(i, 1);
  }
  for (let i = entities.smokeZones.length - 1; i >= 0; i--) {
    if (state.elapsed >= entities.smokeZones[i].expiresAt) entities.smokeZones.splice(i, 1);
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

  if (selectedCharacter.id === "rogue" && state.rogueDashAiming) {
    // Hold-to-aim dash: freeze movement while arrows still rotate aim direction.
    mx = 0;
    my = 0;
  }

  if (state.playerTimelockUntil > 0) {
    mx = 0;
    my = 0;
  }

  const burstSpeedLeg =
    inventory.diamondEmpower === "speedPassive" || diamondsOmniEmpowerActive() || state.elapsed < player.burstUntil;
  const wBurstMult = burstSpeedLeg ? (knightDiamondBurstEmpowerActive() ? KNIGHT_DIAMOND_BURST_SPEED_MULT : 2) : 1;
  const ultSpeedMult = state.elapsed < player.ultimateSpeedUntil ? 1.75 : 1;
  const terrainMult = state.elapsed < inventory.spadesObstacleBoostUntil ? 1 + passive.obstacleTouchMult : 1;
  const burstBonus = Math.max(0, Math.max(wBurstMult, ultSpeedMult) - 1);
  const passiveBonus = Math.max(0, passive.speedMult - 1);
  const terrainBonus = Math.max(0, terrainMult - 1);
  const hungerLeftRatio =
    selectedCharacter.id === "rogue"
      ? clamp(state.rogueHunger / Math.max(0.001, state.rogueHungerMax), 0, 1)
      : 1;
  const rogueDesperationSpeed =
    selectedCharacter.id === "rogue" ? (1 - hungerLeftRatio) * ROGUE_DESPERATION_SPEED_MAX : 0;
  const speedMult = 1 + burstBonus + passiveBonus + terrainBonus + rogueDesperationSpeed;
  const laserSlowMult = state.elapsed < state.playerLaserSlowUntil ? LASER_BLUE_PLAYER_SLOW_MULT : 1;
  const effectiveSpeed = player.speed * speedMult * playerSpeedHealthMultiplier() * laserSlowMult;
  const moving = mx !== 0 || my !== 0;
  const phaseThrough =
    inventory.clubsPhaseThroughTerrain &&
    (selectedCharacter.id === "rogue" ? playerInsideSmoke() : state.elapsed < player.burstUntil);
  const moveRes = moveCircleWithCollisions(player, mx * effectiveSpeed, my * effectiveSpeed, dt, {
    ignoreObstacles: phaseThrough,
  });
  if (!phaseThrough && collidesAnyObstacle(player)) {
    ejectPlayerFromObstaclesIfStuck();
  }
  if (moving && moveRes.touchedObstacle && passive.obstacleTouchMult > 1) {
    inventory.spadesObstacleBoostUntil = state.elapsed + TERRAIN_SPEED_BOOST_LINGER;
  }
  updateRogueNeeds(simDt, moving, moveRes.touchedObstacle);
  if (!state.running) return;
  updatePlayerVelocity(dt);
  if (!pauseHostiles) {
    moveHunters(enemySimDt);
    updateSnipers(enemySimDt);
    updateRangedAttackers(enemySimDt);
    updateSpawners(enemySimDt);
  }
  updateSpecialAbilityEffects(enemySimDt);
  if (!pauseHostiles) {
    updateLaserHazards();
    updateCollisions();
  }
  updateCardPickups();
  if (state.setBonusChoicePendingSuit && state.inventoryModalOpen) showSetBonusChoice();
}

function drawHud() {
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "15px Arial";
  ctx.fillText("Survival: " + state.elapsed.toFixed(1) + "s", 14, 12);
  ctx.fillText("Best: " + state.bestSurvival.toFixed(1) + "s", 14, 32);
  ctx.fillText("Wave: " + state.wave, 14, 52);
  ctx.fillText("Hunters: " + entities.hunters.length, 14, 72);
  if (selectedCharacter.id === "rogue") {
    const ratio = clamp(state.rogueHunger / Math.max(0.001, state.rogueHungerMax), 0, 1);
    const x = 14;
    const y = 94;
    const w = 160;
    const h = 10;
    ctx.fillStyle = "rgba(51, 65, 85, 0.9)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = ratio > 0.35 ? "#f59e0b" : "#ef4444";
    ctx.fillRect(x, y, w * ratio, h);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.6)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    ctx.fillStyle = "#fde68a";
    ctx.fillText(`Fed: ${state.rogueHunger.toFixed(1)}s`, x, y + 14);
    if (state.rogueStealthActive) {
      ctx.fillStyle = "#bbf7d0";
      ctx.fillText("Stealthed", x, y + 31);
    } else if (state.elapsed <= state.rogueAlertUntil) {
      ctx.fillStyle = "#fca5a5";
      ctx.fillText("Alerted", x, y + 31);
    } else {
      ctx.fillStyle = "#93c5fd";
      ctx.fillText("Seeking", x, y + 31);
    }
  }
}

/** Rogue-only in-player arcs: hunger below + stealth grace above. */
function drawRogueSurvivalHud(ctx) {
  if (selectedCharacter.id !== "rogue") return;

  const arcR = player.r + 12;
  const trackStroke = "rgba(148, 163, 184, 0.42)";
  const trackStrokeWide = "rgba(30, 41, 59, 0.55)";

  ctx.save();
  ctx.lineCap = "round";

  // Stealth grace (above): mirror hunger's bottom arc — same span, negated angles = upper semicircle.
  // Track is clockwise along the top; fill uses anticlockwise so it *shrinks* from the right end inward.
  if (state.rogueStealthActive) {
    const graceRem = state.rogueStealthOpenUntil - state.elapsed;
    const graceRatio = clamp(graceRem / Math.max(0.001, ROGUE_STEALTH_OPEN_GRACE), 0, 1);
    if (graceRatio > 0.02) {
      const sCx = player.x;
      const sCy = player.y;
      const sLeft = -Math.PI * 0.8;
      const sRight = -Math.PI * 0.2;
      const stealthFill = graceRatio > 0.35 ? "#6ee7b7" : "#34d399";

      ctx.strokeStyle = trackStrokeWide;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sCx, sCy, arcR, sLeft, sRight);
      ctx.stroke();
      ctx.strokeStyle = trackStroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sCx, sCy, arcR, sLeft, sRight);
      ctx.stroke();

      ctx.strokeStyle = stealthFill;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const stealthEnd = sLeft + (sRight - sLeft) * graceRatio;
      ctx.arc(sCx, sCy, arcR, stealthEnd, sLeft, true);
      ctx.stroke();
    }
  }

  // Hunger (below): full->empty clockwise (right-to-left).
  const ratio = clamp(state.rogueHunger / Math.max(0.001, state.rogueHungerMax), 0, 1);
  const hungerFill = ratio > 0.35 ? "#f59e0b" : "#ef4444";

  const hCx = player.x;
  const hCy = player.y;
  const hLeft = Math.PI * 0.2;
  const hRight = Math.PI * 0.8;

  ctx.strokeStyle = trackStrokeWide;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(hCx, hCy, arcR, hLeft, hRight);
  ctx.stroke();
  ctx.strokeStyle = trackStroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(hCx, hCy, arcR, hLeft, hRight);
  ctx.stroke();

  if (ratio > 0.001) {
    ctx.strokeStyle = hungerFill;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const hungerStart = hRight - (hRight - hLeft) * ratio;
    ctx.arc(hCx, hCy, arcR, hungerStart, hRight);
    ctx.stroke();
  }

  ctx.restore();
}

function updateAbilityButtons() {
  if (!abilitySlots) return;
  const dashReduction = Math.max(0, passive.cooldownFlat.dash || 0);
  const burstReduction = Math.max(0, passive.cooldownFlat.burst || 0);
  const decoyReduction = Math.max(
    0,
    (passive.cooldownFlat.decoy || 0) +
    (selectedCharacter.id === "knight" && (inventory.diamondEmpower === "decoyLead" || diamondsOmniEmpowerActive()) ? 2 : 0)
  );
  const dashPct = Math.max(0, passive.cooldownPct.dash || 0);
  const burstPct = Math.max(0, passive.cooldownPct.burst || 0);
  const decoyPct = Math.max(0, passive.cooldownPct.decoy || 0);
  const cdrSuffix = (base, reduction) => {
    if (!(reduction > 0.001) || !(base > 0.001)) return "";
    const pct = Math.round((reduction / base) * 100);
    return ` -${reduction.toFixed(1)}s -${pct}%`;
  };
  const cdrPctSuffix = (pct) => (pct > 0.001 ? ` -${Math.round(pct * 100)}%` : "");
  const abilitiesUi = [
    {
      key: abilities.dash.key.toUpperCase(),
      label:
        `${abilities.dash.label}` +
        (dashPct > 0.001 ? cdrPctSuffix(dashPct) : cdrSuffix(abilities.dash.cooldown, dashReduction)),
      color: "#38bdf8",
      remaining: cdr(abilities.dash),
      duration: effectiveAbilityCooldown("dash", abilities.dash.cooldown, abilities.dash.minCooldown ?? 0.25),
      extra: `${dashState.charges}/${dashState.maxCharges}`,
    },
    {
      key: abilities.burst.key.toUpperCase(),
      label:
        `${abilities.burst.label}` +
        (burstPct > 0.001 ? cdrPctSuffix(burstPct) : cdrSuffix(abilities.burst.cooldown, burstReduction)),
      color: "#22d3ee",
      remaining: cdr(abilities.burst),
      duration: effectiveAbilityCooldown("burst", abilities.burst.cooldown, abilities.burst.minCooldown ?? 0.4),
      extra: "",
    },
    {
      key: abilities.decoy.key.toUpperCase(),
      label:
        `${abilities.decoy.label}` +
        (decoyPct > 0.001 ? cdrPctSuffix(decoyPct) : cdrSuffix(abilities.decoy.cooldown, decoyReduction)),
      color: "#a78bfa",
      remaining: cdr(abilities.decoy),
      duration: effectiveAbilityCooldown(
        "decoy",
        abilities.decoy.cooldown,
        abilities.decoy.minCooldown ?? 0.4,
        selectedCharacter.id === "knight" && (inventory.diamondEmpower === "decoyLead" || diamondsOmniEmpowerActive())
          ? 2
          : 0
      ),
      extra: "",
    },
    (() => {
      const ult = abilities.random;
      const type = ult.type;
      const hasAbility = !!type;
      const displayName = type === "burst" ? "Push" : hasAbility ? type[0].toUpperCase() + type.slice(1) : "None";
      const cdRem = hasAbility ? Math.max(0, ult.nextReadyAt - state.elapsed) : 0;
      const ready = hasAbility && ult.ammo > 0 && cdRem <= 0.001;
      let color = "#64748b";
      if (type === "shield") color = "#60a5fa";
      if (type === "burst") color = "#fde68a";
      if (type === "timelock") color = "#c084fc";
      if (type === "heal") color = "#4ade80";
      return {
        key: ult.key.toUpperCase(),
        label: displayName,
        color,
        remaining: ready ? 0 : hasAbility ? cdRem : 0,
        duration: hasAbility ? ULTIMATE_ABILITY_COOLDOWN_SEC : 1,
        extra: hasAbility ? `${ult.ammo}/${ult.maxAmmo}` : "0/0",
      };
    })(),
  ];

  for (let i = 0; i < abilitiesUi.length; i++) {
    const info = abilitiesUi[i];
    const slot = abilitySlots[i];
    if (!slot) continue;
    const fill = slot.querySelector(".ability-fill");
    const keyEl = slot.querySelector(".ability-key");
    const labelEl = slot.querySelector(".ability-label");
    const valueEl = slot.querySelector(".ability-value");
    if (!fill || !keyEl || !labelEl || !valueEl) continue;
    const cooldownProgress = clamp(1 - info.remaining / Math.max(0.001, info.duration), 0, 1);
    fill.style.width = `${Math.round(cooldownProgress * 100)}%`;
    fill.style.background = info.color;
    fill.style.opacity = String(0.2 + cooldownProgress * 0.75);
    keyEl.textContent = info.key;
    labelEl.textContent = info.label;
    const cooldownText = info.remaining > 0.01 ? info.remaining.toFixed(1) + "s" : info.extra || "READY";
    valueEl.textContent = cooldownText;
  }
}

function rogueFoodBurgerStackHalfHeight(rr) {
  return (rr * 1.92) / 2;
}

/**
 * Oval-ish rogue snack: round elliptical buns + elliptical fillings; hitbox stays `food.r` circle.
 */
function drawRogueFoodBurger(ctx, cx, cy, rr, foodVis, freshness, sense, near) {
  const aBase = foodVis * (0.42 + 0.58 * freshness);
  const pulse = sense > 0 ? 0.12 * (0.45 + near * 0.35) : 0;
  const fillA = (opacity) => clamp(aBase * opacity + pulse, 0, 1);

  const H = rr * 1.92;
  const rxOuter = rr * 0.98;
  const ryOuter = H / 2;

  const ryTop = rr * 0.36;
  const ryBot = rr * 0.34;
  const ryPat = rr * 0.19;
  const ryLet = rr * 0.055;
  const ryCh = rr * 0.048;

  const rxTop = rxOuter * 0.96;
  const rxBot = rxOuter * 0.94;
  const rxPat = rxOuter * 0.88;
  const rxLet = rxOuter * 0.72;
  const rxCh = rxOuter * 0.76;

  const yTop = cy - ryOuter;
  const cyTopBun = yTop + ryTop;
  const yBot = cy + ryOuter;
  const cyBotBun = yBot - ryBot;

  const midY = (cyTopBun + ryTop + (cyBotBun - ryBot)) / 2;
  const cyPat = midY;
  const cyLet = midY - ryPat * 0.62 - ryLet * 0.5;
  const cyCh = midY - ryPat * 0.22;

  // Soft outer oval (warm undertone, ties silhouette)
  ctx.fillStyle = `rgba(245, 158, 11, ${fillA(0.1)})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rxOuter * 1.02, ryOuter * 1.02, 0, 0, TAU);
  ctx.fill();

  // Bottom bun (full ellipse — round)
  ctx.fillStyle = `rgba(217, 119, 6, ${fillA(0.88)})`;
  ctx.beginPath();
  ctx.ellipse(cx, cyBotBun, rxBot, ryBot, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(251, 191, 36, ${fillA(0.35)})`;
  ctx.beginPath();
  ctx.ellipse(cx, cyBotBun - ryBot * 0.22, rxBot * 0.62, ryBot * 0.38, 0, 0, TAU);
  ctx.fill();

  // Patty
  ctx.fillStyle = `rgba(78, 42, 16, ${fillA(0.92)})`;
  ctx.beginPath();
  ctx.ellipse(cx, cyPat, rxPat, ryPat, 0, 0, TAU);
  ctx.fill();

  // Cheese
  ctx.fillStyle = `rgba(253, 224, 71, ${fillA(0.72)})`;
  ctx.beginPath();
  ctx.ellipse(cx, cyCh, rxCh, ryCh, 0, 0, TAU);
  ctx.fill();

  // Lettuce
  ctx.fillStyle = `rgba(52, 211, 153, ${fillA(0.5)})`;
  ctx.beginPath();
  ctx.ellipse(cx, cyLet, rxLet, ryLet, 0, 0, TAU);
  ctx.fill();

  // Top bun (full ellipse — round dome)
  ctx.fillStyle = `rgba(254, 243, 199, ${fillA(0.92)})`;
  ctx.beginPath();
  ctx.ellipse(cx, cyTopBun, rxTop, ryTop, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(255, 251, 235, ${fillA(0.45)})`;
  ctx.beginPath();
  ctx.ellipse(cx, cyTopBun - ryTop * 0.28, rxTop * 0.55, ryTop * 0.42, 0, 0, TAU);
  ctx.fill();

  if (sense > 0) {
    const pd = 4 + near * 3.5;
    ctx.strokeStyle = `rgba(252, 211, 77, ${(0.45 + near * 0.35) * (0.42 + 0.58 * freshness)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rxOuter + pd, ryOuter + pd * 0.85, 0, 0, TAU);
    ctx.stroke();
  }
}

/** Laser beam warning + active strike: gradient, glow, layered strokes (red / blue). */
function drawLaserBeamFancy(ctx, beam) {
  const x1 = beam.x1;
  const y1 = beam.y1;
  const x2 = beam.x2;
  const y2 = beam.y2;
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const blue = !!beam.blueLaser;
  const pulse = 0.5 + 0.5 * Math.sin(state.elapsed * (beam.warning ? 26 : 16));

  ctx.save();
  ctx.translate(x1, y1);
  ctx.rotate(ang);
  ctx.lineCap = "round";

  if (beam.warning) {
    const t = clamp((state.elapsed - beam.bornAt) / Math.max(0.001, beam.expiresAt - beam.bornAt), 0, 1);
    const fade = 0.42 + 0.48 * (1 - t * 0.4);
    ctx.shadowBlur = blue ? 20 : 16;
    ctx.shadowColor = blue ? "rgba(56, 189, 248, 0.75)" : "rgba(248, 113, 113, 0.7)";
    const gWide = ctx.createLinearGradient(0, 0, len, 0);
    if (blue) {
      gWide.addColorStop(0, `rgba(191, 219, 254, ${0.12 * fade})`);
      gWide.addColorStop(0.35, `rgba(96, 165, 250, ${0.38 * fade + 0.12 * pulse})`);
      gWide.addColorStop(1, `rgba(30, 64, 175, ${0.35 * fade})`);
    } else {
      gWide.addColorStop(0, `rgba(254, 226, 226, ${0.14 * fade})`);
      gWide.addColorStop(0.35, `rgba(248, 113, 113, ${0.42 * fade + 0.18 * pulse})`);
      gWide.addColorStop(1, `rgba(127, 29, 29, ${0.38 * fade})`);
    }
    ctx.strokeStyle = gWide;
    ctx.lineWidth = 11 + pulse * 5;
    ctx.setLineDash([16, 9]);
    ctx.lineDashOffset = -state.elapsed * 130;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();

    ctx.strokeStyle = blue
      ? `rgba(224, 242, 254, ${0.35 + 0.4 * pulse})`
      : `rgba(254, 249, 239, ${0.38 + 0.42 * pulse})`;
    ctx.lineWidth = 3.2 + pulse * 1.8;
    ctx.setLineDash([9, 11]);
    ctx.lineDashOffset = state.elapsed * 100;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
  } else {
    ctx.shadowBlur = blue ? 28 : 24;
    ctx.shadowColor = blue ? "rgba(56, 189, 248, 0.85)" : "rgba(251, 113, 133, 0.8)";
    const gBody = ctx.createLinearGradient(0, 0, len, 0);
    if (blue) {
      gBody.addColorStop(0, "rgba(224, 231, 255, 0.98)");
      gBody.addColorStop(0.22, "rgba(96, 165, 250, 0.98)");
      gBody.addColorStop(0.55, "rgba(37, 99, 235, 0.96)");
      gBody.addColorStop(1, "rgba(23, 37, 84, 0.9)");
    } else {
      gBody.addColorStop(0, "rgba(255, 251, 235, 0.98)");
      gBody.addColorStop(0.18, "rgba(251, 191, 36, 0.96)");
      gBody.addColorStop(0.48, "rgba(248, 113, 113, 0.98)");
      gBody.addColorStop(0.82, "rgba(220, 38, 38, 0.95)");
      gBody.addColorStop(1, "rgba(88, 28, 28, 0.88)");
    }
    ctx.strokeStyle = gBody;
    ctx.lineWidth = blue ? 9 : 10;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = blue ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 250, 250, 0.95)";
    ctx.lineWidth = blue ? 2.4 : 2.6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();
  }

  ctx.restore();
}

function render(tsMs) {
  const deathElapsed = state.running ? 0 : Math.max(0, (tsMs - state.deathStartedAtMs) / 1000);
  const deathAnimDone = !state.running && deathElapsed >= DEATH_ANIM_DURATION;
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
  ctx.translate(-cameraX + shake.x, -cameraY + shake.y);
  drawObstacles(ctx, obstacles);

  for (const smoke of entities.smokeZones) {
    const t = clamp((state.elapsed - smoke.bornAt) / Math.max(0.001, smoke.expiresAt - smoke.bornAt), 0, 1);
    const alpha = 0.26 * (1 - t * 0.55);
    drawCircle(ctx, smoke.x, smoke.y, smoke.r, "#1f2937", alpha);
    ctx.strokeStyle = `rgba(203, 213, 225, ${0.25 * (1 - t)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(smoke.x, smoke.y, smoke.r, 0, TAU);
    ctx.stroke();
  }

  for (const food of entities.foods) {
    const lifeTotal = Math.max(0.001, food.expiresAt - food.bornAt);
    const lifeLeft = clamp((food.expiresAt - state.elapsed) / lifeTotal, 0, 1);
    const freshness = lifeLeft;
    const foodVis = 0.55 + 0.45 * freshness;

    const d = Math.hypot(food.x - player.x, food.y - player.y);
    const near = clamp(1 - d / 360, 0, 1);
    const sense = state.elapsed < state.rogueFoodSenseUntil ? 1 : 0;
    const rr = food.r * (1 + near * 0.28 * sense);
    drawRogueFoodBurger(ctx, food.x, food.y, rr, foodVis, freshness, sense, near);

    const barW = 34;
    const barH = 4;
    const bx = food.x - barW / 2;
    const by = food.y + rogueFoodBurgerStackHalfHeight(rr) + 6;
    ctx.fillStyle = "rgba(148, 163, 184, 0.32)";
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = lifeLeft > 0.35 ? "#f59e0b" : "#ef4444";
    ctx.fillRect(bx, by, barW * lifeLeft, barH);
  }

  if (selectedCharacter.id === "rogue" && state.rogueStealthActive) {
    const safeRadius = 56;
    const info = nearestTerrainInfo(player.x, player.y);
    const terrainDist = Number.isFinite(info.dist) ? info.dist : safeRadius;
    const inSafeRange = terrainDist <= safeRadius;
    const ringColor = inSafeRange ? "rgba(110, 231, 183, 0.72)" : "rgba(248, 113, 113, 0.72)";

    // Safe hugging band: stay inside this radius to keep stealth.
    ctx.strokeStyle = "rgba(16, 185, 129, 0.22)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(player.x, player.y, safeRadius, 0, TAU);
    ctx.stroke();

    // Show only a direct tether to nearest terrain when it's relevant (inside safe ring).
    if (info.point && inSafeRange) {
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(info.point.x, info.point.y);
      ctx.stroke();
      drawCircle(ctx, info.point.x, info.point.y, 3.4, "#a7f3d0", 0.95);
    }
  }

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
  for (const c of entities.cards) {
    const bob = Math.sin((state.elapsed - c.bornAt) * 5) * 2;
    const w = 20;
    const h = 28;
    ctx.save();
    ctx.translate(c.x, c.y + bob);
    ctx.fillStyle = "#1d4ed8";
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = "#bfdbfe";
    ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = "rgba(191,219,254,0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 4, -h / 2 + 4);
    ctx.lineTo(w / 2 - 4, h / 2 - 4);
    ctx.moveTo(w / 2 - 4, -h / 2 + 4);
    ctx.lineTo(-w / 2 + 4, h / 2 - 4);
    ctx.stroke();
    ctx.restore();
  }
  for (const d of entities.decoys) drawDecoyBody(ctx, d);

  for (const zone of entities.dangerZones) {
    const zu = zone.windup != null ? zone.windup : 0.8;
    const life = clamp((state.elapsed - zone.bornAt) / zu, 0, 1);
    const lingering = zone.exploded && state.elapsed < (zone.lingerUntil ?? zone.detonateAt);
    const tSinceDet = state.elapsed - zone.detonateAt;
    const inBang = zone.exploded && lingering && tSinceDet < SNIPER_ARTILLERY_BANG_DURATION;

    if (!zone.exploded) {
      // Windup / targeting: pulse reads as "incoming"
      const pulse = 1 + Math.sin(state.elapsed * 20) * 0.08;
      const radius = zone.r * pulse;
      drawCircle(ctx, zone.x, zone.y, radius, "#ef4444", 0.25 + life * 0.4);
      ctx.strokeStyle = "#f87171";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, radius, 0, TAU);
      ctx.stroke();
    } else if (lingering) {
      // Lingering damage: fixed radius, no pulse — reads as "stay out"
      const r = zone.r;
      drawCircle(ctx, zone.x, zone.y, r, "#9f1239", 0.38);
      ctx.strokeStyle = "rgba(248, 113, 113, 0.95)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, r, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = "rgba(254, 202, 202, 0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, r * 0.72, 0, TAU);
      ctx.stroke();
      if (inBang) {
        const u = clamp(tSinceDet / SNIPER_ARTILLERY_BANG_DURATION, 0, 1);
        drawArtilleryDetonationBang(ctx, zone, u);
      }
    }
  }

  for (const b of entities.bullets) {
    const life = clamp((state.elapsed - b.bornAt) / b.life, 0, 1);
    const x = b.x + (b.tx - b.x) * life;
    const y = b.y + (b.ty - b.y) * life;
    drawCircle(ctx, x, y, 2, "#fca5a5");
  }

  for (const p of entities.projectiles) {
    drawProjectileBody(ctx, p);
  }

  for (const fx of entities.ultimateEffects) {
    if (state.elapsed < fx.bornAt) continue;
    const span = Math.max(0.001, fx.expiresAt - fx.bornAt);
    const t = clamp((state.elapsed - fx.bornAt) / span, 0, 1);
    if (fx.type === "burstWave") {
      const ease = 1 - Math.pow(1 - t, 1.35);
      const rr = fx.radius * (0.1 + ease * 0.98);
      ctx.save();
      ctx.translate(fx.x, fx.y);
      ctx.rotate(state.elapsed * 6 + fx.bornAt * 3);
      if (t < 0.22) {
        const flash = 1 - t / 0.22;
        drawCircle(ctx, 0, 0, rr * 0.12 + flash * fx.radius * 0.1, "#ffffff", 0.5 * flash);
      }
      const segs = 40;
      for (let k = 0; k < 3; k++) {
        const rrk = rr * (1 - k * 0.1);
        const alpha = (0.62 - k * 0.14) * (1 - t);
        ctx.strokeStyle = `rgba(224, 242, 254, ${alpha})`;
        ctx.lineWidth = 11 - k * 2.5 - t * 5;
        ctx.beginPath();
        for (let i = 0; i <= segs; i++) {
          const ang = (i / segs) * TAU;
          const wobble = 1 + 0.045 * Math.sin(ang * 9 + state.elapsed * 24);
          const px = Math.cos(ang) * rrk * wobble;
          const py = Math.sin(ang) * rrk * wobble;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = `rgba(96, 165, 250, ${0.4 * (1 - t)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, rr + 10, 0, TAU);
      ctx.stroke();
    } else if (fx.type === "shieldSummon") {
      const rr = fx.radius * (0.2 + t * 1.05);
      ctx.save();
      ctx.translate(fx.x, fx.y);
      ctx.rotate(-state.elapsed * 2.2);
      const rays = 20;
      for (let i = 0; i < rays; i++) {
        const ang = (i / rays) * TAU;
        const len = rr * (0.55 + 0.45 * (1 - t));
        const alpha = (0.35 - i * 0.008) * (1 - t);
        ctx.strokeStyle = `rgba(191, 219, 254, ${Math.max(0, alpha)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * rr * 0.08, Math.sin(ang) * rr * 0.08);
        ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
        ctx.stroke();
      }
      ctx.restore();
      drawCircle(ctx, fx.x, fx.y, rr * 0.45, "#dbeafe", 0.28 * (1 - t * 0.6));
      drawCircle(ctx, fx.x, fx.y, rr, fx.color, 0.14 * (1 - t));
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.75 * (1 - t)})`;
      ctx.lineWidth = 5 - t * 2.5;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, rr * (0.92 - t * 0.08), 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = `rgba(59, 130, 246, ${0.45 * (1 - t)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, rr * 1.08, 0, TAU);
      ctx.stroke();
    } else if (fx.type === "timelockWorld") {
      const ease = 1 - Math.pow(1 - t, 0.85);
      const rr = fx.radius * (0.15 + ease * 1.05);
      const frost = 0.22 * (1 - t);
      drawCircle(ctx, fx.x, fx.y, rr, "#e0e7ff", frost * 0.5);
      ctx.strokeStyle = `rgba(196, 181, 253, ${0.55 * (1 - t * 0.5)})`;
      ctx.lineWidth = 5 + (1 - t) * 4;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, rr, 0, TAU);
      ctx.stroke();
      const ticks = 24;
      for (let i = 0; i < ticks; i++) {
        const ang = (i / ticks) * TAU - state.elapsed * 0.35;
        ctx.strokeStyle = `rgba(237, 233, 254, ${0.35 * (1 - t)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(fx.x + Math.cos(ang) * rr * 0.88, fx.y + Math.sin(ang) * rr * 0.88);
        ctx.lineTo(fx.x + Math.cos(ang) * rr * 1.02, fx.y + Math.sin(ang) * rr * 1.02);
        ctx.stroke();
      }
    } else if (fx.type === "timelock") {
      const phaseSelf = t < 0.5;
      const localSelf = phaseSelf ? t / 0.5 : 1;
      const fade = phaseSelf ? 1 : Math.max(0, 1 - (t - 0.5) * 2.2);
      const pulse = 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(state.elapsed * 14));
      const spiralR = fx.radius * (0.35 + localSelf * 0.9) + pulse * 8;
      drawCircle(ctx, fx.x, fx.y, spiralR, "#c084fc", (0.1 + (1 - localSelf) * 0.08) * fade);
      ctx.strokeStyle = `rgba(233, 213, 255, ${(0.5 + 0.25 * (1 - localSelf)) * fade})`;
      ctx.lineWidth = 3;
      const coils = 3;
      ctx.beginPath();
      for (let i = 0; i <= 72; i++) {
        const u = i / 72;
        const ang = u * coils * TAU + state.elapsed * 3;
        const rad = 8 + u * spiralR * 0.95;
        const px = fx.x + Math.cos(ang) * rad;
        const py = fx.y + Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      const tickN = 12;
      for (let i = 0; i < tickN; i++) {
        const ang = (i / tickN) * TAU - state.elapsed * 2;
        ctx.strokeStyle = `rgba(250, 245, 255, ${0.55 * fade})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(fx.x + Math.cos(ang) * (player.r + 6), fx.y + Math.sin(ang) * (player.r + 6));
        ctx.lineTo(fx.x + Math.cos(ang) * (player.r + 18), fx.y + Math.sin(ang) * (player.r + 18));
        ctx.stroke();
      }
    } else if (fx.type === "healVitality") {
      const pulse = 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(state.elapsed * 16));
      for (let ring = 0; ring < 3; ring++) {
        const lag = ring * 0.12;
        const tt = clamp((t - lag) / (1 - lag), 0, 1);
        const rr = fx.radius * (0.25 + tt * 0.82);
        drawCircle(ctx, fx.x, fx.y, rr, "#6ee7b7", 0.08 * (1 - tt) * (1 - ring * 0.2));
        ctx.strokeStyle = `rgba(52, 211, 153, ${0.45 * (1 - tt) * pulse})`;
        ctx.lineWidth = 4 - ring;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, rr, 0, TAU);
        ctx.stroke();
      }
      const rays = 14;
      for (let i = 0; i < rays; i++) {
        const ang = (i / rays) * TAU + state.elapsed * 0.8;
        const len = fx.radius * (0.4 + 0.55 * (1 - t));
        ctx.strokeStyle = `rgba(167, 243, 208, ${0.4 * (1 - t)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(fx.x, fx.y);
        ctx.lineTo(fx.x + Math.cos(ang) * len, fx.y + Math.sin(ang) * len);
        ctx.stroke();
      }
      if (t < 0.35) {
        const b = 1 - t / 0.35;
        drawCircle(ctx, fx.x, fx.y, player.r + 6 + b * 12, "#ecfdf5", 0.35 * b);
      }
    }
  }

  const timelockWorldFrozenDraw =
    state.timelockEnemyUntil > state.elapsed && state.elapsed >= state.timelockEnemyFrom;
  if (timelockWorldFrozenDraw) {
    const w = Math.max(VIEW_W, VIEW_H) * 0.85;
    const v = 0.028 + 0.018 * Math.sin(state.elapsed * 11);
    const g = ctx.createRadialGradient(player.x, player.y, player.r * 2, player.x, player.y, w);
    g.addColorStop(0, `rgba(224, 231, 255, ${v * 0.35})`);
    g.addColorStop(0.45, `rgba(99, 102, 241, ${v * 0.55})`);
    g.addColorStop(1, "rgba(15, 23, 42, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(player.x, player.y, w, 0, TAU);
    ctx.fill();
  }

  if (entities.shields.length) {
    const orbitR = entities.shields[0].radius;
    ctx.strokeStyle = "rgba(147, 197, 253, 0.2)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 10]);
    ctx.lineDashOffset = -state.elapsed * 40;
    ctx.beginPath();
    ctx.arc(player.x, player.y, orbitR, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const shield of entities.shields) {
    const spawnAge = shield.bornAt != null ? clamp((state.elapsed - shield.bornAt) / 0.34, 0, 1) : 1;
    const pop = 0.2 + 0.8 * (1 - Math.pow(1 - spawnAge, 2.4));
    const pulse = 0.9 + 0.1 * Math.sin(state.elapsed * 8 + shield.angle * 2.2);
    const drawR = shield.r * pop * pulse;
    const tx = -Math.sin(shield.angle);
    const ty = Math.cos(shield.angle);
    ctx.strokeStyle = "rgba(147, 197, 253, 0.35)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(shield.x - tx * (drawR + 6), shield.y - ty * (drawR + 6));
    ctx.lineTo(shield.x + tx * (drawR + 14), shield.y + ty * (drawR + 14));
    ctx.stroke();
    drawCircle(ctx, shield.x, shield.y, drawR + 9, "#bfdbfe", 0.28);
    drawCircle(ctx, shield.x, shield.y, drawR + 4, "#e0f2fe", 0.45);
    drawCircle(ctx, shield.x, shield.y, drawR, "#38bdf8", 0.95);
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(shield.x, shield.y, drawR + 1.2, 0, TAU);
    ctx.stroke();
  }

  for (const beam of entities.laserBeams) {
    drawLaserBeamFancy(ctx, beam);
  }

  // Spawner charging animation: large translucent clock at spawner position.
  for (const h of entities.hunters) {
    if (h.type !== "spawner" && h.type !== "airSpawner") continue;
    if (state.elapsed >= h.spawnDelayUntil) continue;

    const delayTotal = h.type === "airSpawner" ? 2.1 : 2;
    const elapsedSinceBorn = state.elapsed - h.bornAt;
    const progress = clamp(elapsedSinceBorn / delayTotal, 0, 1);
    const remaining = 1 - progress;

    const clockR = h.r + 28 + remaining * 6;
    const pulse = 1 + Math.sin(state.elapsed * 10) * 0.04;
    const alpha = 0.10 + remaining * 0.18;
    const ringCol = h.type === "airSpawner" ? "#a78bfa" : "#fb7185";
    const handCol = h.type === "airSpawner" ? "#7c3aed" : "#f43f5e";

    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = ringCol;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, clockR * pulse, 0, TAU);
    ctx.stroke();

    // Clock hands (one rotates fast as the countdown approaches).
    ctx.strokeStyle = handCol;
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
    drawHunterBody(ctx, h);
  }
  for (const h of entities.hunters) {
    const total = h.life || Math.max(0.0001, h.dieAt - h.bornAt);
    const lifeLeft = clamp((h.dieAt - state.elapsed) / total, 0, 1);
    const barW = h.r * 2.6;
    const barH = 5;
    const x = h.x - barW / 2;
    const y = h.y + h.r + 9;
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, 0.55)";
    ctx.fillRect(x - 1, y - 1, barW + 2, barH + 2);
    ctx.fillStyle = "rgba(51, 65, 85, 0.92)";
    ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = lifeLeft > 0.35 ? "#22c55e" : "#ef4444";
    ctx.fillRect(x, y, barW * lifeLeft, barH);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y - 0.5, barW + 1, barH + 1);
    ctx.restore();
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
  drawPlayerBody(ctx, playerInvuln);
  if (state.playerTimelockUntil > 0) {
    const timePulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(state.elapsed * 14));
    drawCircle(ctx, player.x, player.y, player.r + 10 + timePulse * 4, "#c084fc", 0.18);
    ctx.strokeStyle = `rgba(233, 213, 255, ${0.55 + 0.2 * timePulse})`;
    ctx.lineWidth = 3 + timePulse * 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 14 + timePulse * 5, 0, TAU);
    ctx.stroke();
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(state.elapsed * 1.8);
    const ticks = 16;
    for (let i = 0; i < ticks; i++) {
      const ang = (i / ticks) * TAU;
      ctx.strokeStyle = `rgba(250, 245, 255, ${0.35 + 0.2 * timePulse})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * (player.r + 4), Math.sin(ang) * (player.r + 4));
      ctx.lineTo(Math.cos(ang) * (player.r + 11 + timePulse * 3), Math.sin(ang) * (player.r + 11 + timePulse * 3));
      ctx.stroke();
    }
    ctx.restore();
    const sweep = (state.elapsed * 2.2) % TAU;
    ctx.strokeStyle = "rgba(196, 181, 253, 0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 9, sweep, sweep + Math.PI * 0.65);
    ctx.stroke();
  } else if (state.tempHp > 0) {
    const p = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(state.elapsed * 10));
    ctx.strokeStyle = `rgba(52, 211, 153, ${0.35 + 0.25 * p})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 7 + p * 3, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = `rgba(167, 243, 208, ${0.28 * p})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 11 + p * 4, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = `rgba(236, 253, 245, ${0.22 * p})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 15 + p * 2, 0, TAU);
    ctx.stroke();
  }
  const heartsResistanceCount = getHeartsResistanceCardCount();
  const heartsResistanceReady = heartsResistanceCount > 0 && state.elapsed >= inventory.heartsResistanceReadyAt;
  if (heartsResistanceReady) {
    ctx.strokeStyle = "rgba(252, 165, 165, 0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 4, 0, TAU);
    ctx.stroke();
  }
  if (heartsResistanceCount > 0 && !heartsResistanceReady) {
    const cdDur = Math.max(0.001, inventory.heartsResistanceCooldownDuration || getHeartsResistanceCooldown());
    const rem = Math.max(0, inventory.heartsResistanceReadyAt - state.elapsed);
    const t = clamp(1 - rem / cdDur, 0, 1);
    const iconX = player.x;
    const iconY = player.y + player.r + 20;
    const r = 7;
    const g = Math.round(148 + (191 - 148) * t);
    const b = Math.round(163 + (255 - 163) * t);
    ctx.strokeStyle = `rgb(${100},${g},${b})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(iconX, iconY, r, -Math.PI / 2, -Math.PI / 2 + TAU * t);
    ctx.stroke();
    ctx.strokeStyle = "rgba(100, 116, 139, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(iconX, iconY, r, -Math.PI / 2 + TAU * t, -Math.PI / 2 + TAU);
    ctx.stroke();
    ctx.strokeStyle = "rgba(226, 232, 240, 0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(iconX - 2, iconY - 2.5);
    ctx.lineTo(iconX + 2, iconY - 2.5);
    ctx.lineTo(iconX - 2, iconY + 2.5);
    ctx.lineTo(iconX + 2, iconY + 2.5);
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
  for (const popup of entities.healPopups) {
    const t = clamp((state.elapsed - popup.bornAt) / Math.max(0.001, popup.expiresAt - popup.bornAt), 0, 1);
    const y = popup.y - t * 20;
    const fp = popup.fontPx ?? 14;
    ctx.fillStyle = popup.color || "#86efac";
    ctx.globalAlpha = 1 - t;
    ctx.font = `bold ${fp}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(15, 23, 42, 0.55)";
    ctx.shadowBlur = 4;
    ctx.fillText(popup.text, popup.x, y);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
  if (passive.heartsShieldArc > 0) {
    const facing = Math.atan2(player.facing.y, player.facing.x);
    const arc = (passive.heartsShieldArc * Math.PI) / 180;
    ctx.strokeStyle = "rgba(248, 113, 113, 0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 30, facing - arc / 2, facing + arc / 2);
    ctx.stroke();
  }

  if (!state.running && !deathAnimDone) {
    const t = clamp(deathElapsed / DEATH_ANIM_DURATION, 0, 1);
    const burstR = player.r + 12 + t * 78;
    const alpha = (1 - t) * 0.55;
    ctx.strokeStyle = "#f43f5e";
    ctx.lineWidth = 6 - t * 3;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(player.x, player.y, burstR, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    drawCircle(ctx, player.x, player.y, player.r + 8 + t * 24, "#fca5a5", 0.18 * (1 - t));
  }

  drawPlayerHpHud(ctx);
  drawRogueSurvivalHud(ctx);

  if (selectedCharacter.id === "rogue" && state.rogueDashAiming) {
    const target = computeDashTarget();
    const tipX = target.x;
    const tipY = target.y;
    ctx.strokeStyle = "rgba(125, 211, 252, 0.9)";
    ctx.lineWidth = 2.4;
    ctx.setLineDash([9, 7]);
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.setLineDash([]);
    drawCircle(ctx, tipX, tipY, 7, "#7dd3fc", 0.3);
    ctx.strokeStyle = "rgba(186, 230, 253, 0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tipX, tipY, 7, 0, TAU);
    ctx.stroke();
  }

  ctx.restore();

  // Capture death snapshots from the clean gameplay frame before screen-space damage/death overlays.
  if (state.snapshotPending) {
    state.snapshotPending = false;
    saveDeathSnapshot().catch(() => {
      setSnapshotStatus("Death screenshots: save failed");
    });
  }

  if (state.hurtFlash > 0) {
    ctx.fillStyle = "rgba(220, 38, 38, 0.24)";
    ctx.fillRect(0, 0, world.w, world.h);
  }

  if (selectedCharacter.id === "rogue" && state.running) {
    const hungerMissing = 1 - clamp(state.rogueHunger / Math.max(0.001, state.rogueHungerMax), 0, 1);
    if (hungerMissing > 0) {
      const alpha = 0.04 + hungerMissing * 0.22;
      ctx.fillStyle = `rgba(20, 184, 166, ${alpha})`;
      ctx.fillRect(0, 0, world.w, world.h);
    }
  }

  if (selectedCharacter.id === "rogue" && state.running && !state.rogueHasEnemyLos) {
    ctx.fillStyle = "rgba(16, 185, 129, 0.08)";
    ctx.fillRect(0, 0, world.w, world.h);
    ctx.fillStyle = "#d1fae5";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "bold 14px Arial";
    ctx.fillText("LoS broken", 14, 130);
  }

  drawHud();
  if (selectedCharacter.id === "rogue" && state.elapsed < state.rogueFoodSenseUntil) {
    const px = player.x - cameraX + shake.x;
    const py = player.y - cameraY + shake.y;
    for (const food of entities.foods) {
      const lifeTotal = Math.max(0.001, food.expiresAt - food.bornAt);
      const freshness = clamp((food.expiresAt - state.elapsed) / lifeTotal, 0, 1);
      const dx = food.x - player.x;
      const dy = food.y - player.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const close =
        len <= ROGUE_FOOD_ARROW_CLOSE_PLATEAU
          ? 1
          : clamp(
              1 - (len - ROGUE_FOOD_ARROW_CLOSE_PLATEAU) / Math.max(0.001, ROGUE_FOOD_ARROW_FAR_LEN - ROGUE_FOOD_ARROW_CLOSE_PLATEAU),
              0,
              1
            );
      const reach = 44 + close * 22;
      const tipX = px + ux * reach;
      const tipY = py + uy * reach;
      const sideX = -uy;
      const sideY = ux;
      const s = 5.5 + close * 6.5;
      const freshAlpha = 0.54 + 0.4 * freshness;
      const a = Math.min(0.94, Math.max(0.48, freshAlpha));
      ctx.fillStyle = `rgba(252, 211, 77, ${a})`;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - ux * (s * 1.8) + sideX * s, tipY - uy * (s * 1.8) + sideY * s);
      ctx.lineTo(tipX - ux * (s * 1.8) - sideX * s, tipY - uy * (s * 1.8) - sideY * s);
      ctx.closePath();
      ctx.fill();
    }
  }
  updateAbilityButtons();
  if (dangerRampFillEl) {
    const p = gameStarted ? getDangerRamp01() : 0;
    dangerRampFillEl.style.width = `${p * 100}%`;
  }
  if (state.elapsed < inventory.dodgeTextUntil) {
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 22px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Dodge!", world.w / 2, 56);
  }

  if (state.manualPause && state.running) {
    ctx.fillStyle = "rgba(2, 6, 23, 0.45)";
    ctx.fillRect(0, 0, world.w, world.h);
    ctx.fillStyle = "#f8fafc";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 38px Arial";
    ctx.fillText("Paused", world.w / 2, world.h / 2 - 10);
    ctx.font = "16px Arial";
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText("Press any key to resume", world.w / 2, world.h / 2 + 24);
  }

  if (!state.running && deathAnimDone) {
    postFxCtx.clearRect(0, 0, world.w, world.h);
    postFxCtx.drawImage(canvas, 0, 0);
    ctx.save();
    ctx.clearRect(0, 0, world.w, world.h);
    ctx.filter = "grayscale(1)";
    ctx.drawImage(postFxCanvas, 0, 0);
    ctx.restore();
    ctx.fillStyle = "rgba(2, 6, 23, 0.72)";
    ctx.fillRect(0, 0, world.w, world.h);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 34px Arial";
    ctx.fillText("You Died", world.w / 2 - 76, world.h / 2 - 20);
    ctx.font = "18px Arial";
    ctx.fillText("Press R to restart", world.w / 2 - 76, world.h / 2 + 18);
  }
}

function getSimulationTimeScale() {
  const el = document.getElementById("game-speed");
  if (!el) return 1;
  const raw = typeof el.value === "string" ? el.value.trim() : String(el.value);
  const v = parseFloat(raw);
  if (!Number.isFinite(v) || v <= 0) return 1;
  return clamp(v, 0.1, 5);
}

function loop(ts) {
  if (!state.lastTime) state.lastTime = ts;
  const dt = Math.min((ts - state.lastTime) / 1000, 0.033);
  state.lastTime = ts;
  const scale = getSimulationTimeScale();
  update(dt * scale);
  render(ts);
  requestAnimationFrame(loop);
}

function onAbilityKey(key) {
  if (state.pausedForCard) return;
  if (key === abilities.dash.key) {
    if (selectedCharacter.id === "rogue") {
      startRogueDashAim();
      return;
    }
    tryDash();
  }
  if (key === abilities.burst.key) tryBurst();
  if (key === abilities.decoy.key) tryDecoy();
  if (key === abilities.random.key) useRandomAbility();
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (key.startsWith("arrow")) event.preventDefault();
  if (!gameStarted) return;
  // Restart must run before movement-resume / other guards so R never "sticks" after a card session.
  if (key === abilities.random.key && !state.running) {
    event.preventDefault();
    gameStarted = false;
    resetGame();
    afterDeathRetry();
    return;
  }
  if (state.manualPause) {
    const resumeGameplay =
      key.startsWith("arrow") || key === abilities.dash.key || key === abilities.burst.key || key === abilities.decoy.key || key === abilities.random.key;
    if (!resumeGameplay) {
      if (key === " ") event.preventDefault();
      return;
    }
    state.manualPause = false;
  }
  if (state.inventoryModalOpen && (key === "enter" || key === " " || key === "escape")) {
    continueAfterLoadout();
    return;
  }
  if (key === " " && !state.pausedForCard && !state.inventoryModalOpen) {
    state.manualPause = true;
    state.keys.clear();
    return;
  }
  if (state.waitingForMovementResume) {
    const movementInput = key.startsWith("arrow");
    if (!movementInput) return;
    state.waitingForMovementResume = false;
    state.pausedForCard = false;
  }
  if (key.startsWith("arrow")) state.keys.add(key);
  onAbilityKey(key);
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  if (key.startsWith("arrow")) event.preventDefault();
  if (key.startsWith("arrow")) state.keys.delete(key);
  if (key === abilities.dash.key) releaseRogueDashAim();
});

if (snapshotFolderButton) {
  snapshotFolderButton.addEventListener("click", () => {
    chooseSnapshotFolder();
  });
}

if (cardPickupButton) {
  cardPickupButton.addEventListener("click", () => continueAfterLoadout());
}
if (cardSkipButton) {
  cardSkipButton.addEventListener("click", () => continueAfterLoadout());
}
if (cardCloseButton) {
  cardCloseButton.addEventListener("click", () => continueAfterLoadout());
}

wireCharacterSelect();
refreshControlsHint();
requestAnimationFrame(loop);
    
}
