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
  characterSelectModal,
  characterSelectOptions,
  abilitySlots,
  cardSlotEls,
  backpackSlotEl,
  setBonusStatusEl,
  cardModal,
  cardModalFace,
  modalSetBonusStatusEl,
  cardCloseButton,
  cardPickupButton,
  cardSkipButton,
  cardSwapRow,
}) {
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
  nextPickupAt: 3.5,
  nextCardAt: 10,
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
  deathStartedAtMs: 0,
  manualPause: false,
  pausedForCard: false,
  inventoryModalOpen: false,
  waitingForMovementResume: false,
  pendingCard: null,
  setBonusChoicePendingSuit: null,
  setBonusChoiceCard: null,
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
    random: { ...spec.random, type: null, ammo: 0, maxAmmo: 0 },
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

const inventory = {
  cards: [],
  backpackCard: null,
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

function randomSuitForDraw() {
  const counts = { diamonds: 0, hearts: 0, clubs: 0, spades: 0 };
  for (const card of inventory.cards) counts[card.suit] += 1;
  const lockedSuit = Object.keys(counts).find((s) => counts[s] >= 2);
  if (lockedSuit) return lockedSuit;
  const suits = ["diamonds", "hearts", "clubs", "spades"];
  return suits[Math.floor(Math.random() * suits.length)];
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

/**
 * Weighted 1..13 roll where A(1) is 5x as likely as K(13),
 * with linear interpolation for ranks in between.
 */
function rollCardRankWeighted() {
  const minW = 0.2; // King weight
  const maxW = 1.0; // Ace weight
  const steps = 12;
  const totalW = ((maxW + minW) * 13) / 2;
  let pick = Math.random() * totalW;
  for (let rank = 1; rank <= 13; rank++) {
    const t = (rank - 1) / steps;
    const w = maxW + (minW - maxW) * t;
    pick -= w;
    if (pick <= 0) return rank;
  }
  return 13;
}

function makeRandomCard() {
  const suit = randomSuitForDraw();
  const rank = rollCardRankWeighted();
  return {
    id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    suit,
    rank,
    effect: makeCardEffect(suit, rank),
  };
}

function describeCardEffect(card) {
  const e = card.effect;
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

function renderCardSlots() {
  if (!cardSlotEls) return;
  for (let i = 0; i < Math.min(3, cardSlotEls.length); i++) {
    const slot = cardSlotEls[i];
    const card = inventory.cards[i];
    slot.classList.toggle("filled", !!card);
    if (!card) {
      slot.innerHTML = "Empty Slot";
      continue;
    }
    slot.innerHTML = `<div><span class="title">${formatCardName(card)}</span><span class="meta">${describeCardEffect(card)}</span></div>`;
  }
  if (backpackSlotEl) {
    backpackSlotEl.classList.toggle("filled", !!inventory.backpackCard);
    if (!inventory.backpackCard) {
      backpackSlotEl.innerHTML = "Backpack Empty";
    } else {
      backpackSlotEl.innerHTML = `<div><span class="title">Backpack: ${formatCardName(
        inventory.backpackCard
      )}</span><span class="meta">${describeCardEffect(inventory.backpackCard)}</span></div>`;
    }
  }
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
  for (const card of inventory.cards) {
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
  }
  if (suits.hearts >= 3) inventory.heartsRegenPerSec = 0.3;
  if (suits.clubs >= 3) inventory.clubsPhaseThroughTerrain = true;
  if (selectedCharacter.id === "rogue" && suits.diamonds >= 3) inventory.rogueDiamondRangeBoost = true;
  if (suits.spades >= 3) {
    // Spades 3-set: brief stealth pulse on stealth landing — see tryDash().
  }
  if (selectedCharacter.id !== "rogue" && suits.diamonds >= 3 && !inventory.diamondEmpower && !state.setBonusChoicePendingSuit) {
    state.setBonusChoicePendingSuit = "diamonds";
  }
  dashState.maxCharges = 1 + passive.dashChargesBonus;
  dashState.charges = Math.min(dashState.charges || dashState.maxCharges, dashState.maxCharges);
  player.maxHp = Math.max(1, selectedCharacter.baseHp + maxHpBonus);
  player.hp = Math.min(player.hp, player.maxHp);
  renderCardSlots();
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
  for (const card of inventory.cards) suits[card.suit] += 1;
  const lines = [];
  if (suits.diamonds >= 3) {
    if (selectedCharacter.id === "rogue") {
      lines.push("Set bonus! Diamonds: dash range and smoke radius increased.");
    } else {
    const pick =
      inventory.diamondEmpower === "dash2x"
        ? "dash goes twice as far"
        : inventory.diamondEmpower === "speedPassive"
          ? "speed burst is passive"
          : inventory.diamondEmpower === "decoyLead"
            ? "decoy drifts away, cooldown -2s, duration +1s"
            : "choose your empowerment in inventory";
    lines.push(`Set bonus! Diamonds: ${pick}.`);
    }
  }
  if (suits.hearts >= 3) lines.push("Set bonus! Hearts: passive HP regeneration.");
  if (suits.clubs >= 3) {
    lines.push(
      selectedCharacter.id === "rogue"
        ? "Set bonus! Clubs: phase through terrain while inside smoke."
        : "Set bonus! Clubs: burst phase-through terrain."
    );
  }
  if (suits.spades >= 3) {
    lines.push("Set bonus! Spades: on stealth landing, +0.1s stealth (dash that moves while hidden).");
  }
  return lines;
}

function renderCardModal() {
  if (!cardModal || !cardModalFace || !cardSwapRow) return;
  if (!state.inventoryModalOpen) {
    cardModal.classList.remove("open");
    if (modalSetBonusStatusEl) modalSetBonusStatusEl.textContent = "";
    return;
  }
  cardModal.classList.add("open");
  if (state.pendingCard) {
    const card = state.pendingCard;
    cardModalFace.classList.remove("compact");
    cardModalFace.innerHTML = `<div class="big">${formatCardName(card)}</div><div class="desc">${describeCardEffect(card)}</div>`;
  } else {
    cardModalFace.classList.add("compact");
    cardModalFace.innerHTML =
      '<div class="desc">Drag cards between Slot 1-3 and Backpack. Press X or Leave when done.</div>';
  }
  cardSwapRow.innerHTML = "";
  const zones = [
    { id: "pickup", label: "Pickup", card: state.pendingCard },
    { id: "slot0", label: "Slot 1", card: inventory.cards[0] || null },
    { id: "slot1", label: "Slot 2", card: inventory.cards[1] || null },
    { id: "slot2", label: "Slot 3", card: inventory.cards[2] || null },
    { id: "backpack", label: "Backpack", card: inventory.backpackCard || null },
  ];

  for (const zone of zones) {
    const zoneEl = document.createElement("div");
    zoneEl.className = "drop-zone";
    zoneEl.dataset.zoneId = zone.id;
    zoneEl.innerHTML = `<div class="zone-label">${zone.label}</div>`;
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
      swapCardsBetweenZones(from, zone.id);
    });
    if (zone.card) {
      const cardEl = document.createElement("div");
      cardEl.className = "zone-card";
      cardEl.draggable = true;
      cardEl.textContent = `${formatCardName(zone.card)} - ${describeCardEffect(zone.card)}`;
      cardEl.addEventListener("dragstart", (event) => {
        event.dataTransfer?.setData("text/plain", zone.id);
      });
      zoneEl.appendChild(cardEl);
    } else {
      const emptyEl = document.createElement("div");
      emptyEl.className = "zone-empty";
      emptyEl.textContent = "Empty";
      zoneEl.appendChild(emptyEl);
    }
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
    cardSwapRow.appendChild(mk("speedPassive", "Speed burst is passive"));
    cardSwapRow.appendChild(mk("decoyLead", "Decoy drifts away, -2s cooldown, +1s duration"));
  }

  const leaveBtn = document.createElement("button");
  leaveBtn.type = "button";
  leaveBtn.className = "leave-button";
  leaveBtn.textContent = "Leave";
  leaveBtn.addEventListener("click", () => continueAfterLoadout());
  cardSwapRow.appendChild(leaveBtn);
  if (modalSetBonusStatusEl) {
    const lines = getSetBonusLines();
    modalSetBonusStatusEl.textContent = lines.length ? lines.join(" ") : "";
  }
}

function getCardByZone(zoneId) {
  if (zoneId === "pickup") return state.pendingCard;
  if (zoneId === "backpack") return inventory.backpackCard;
  if (zoneId.startsWith("slot")) {
    const idx = Number(zoneId.slice(4));
    if (Number.isInteger(idx) && idx >= 0 && idx < 3) return inventory.cards[idx] || null;
  }
  return null;
}

function setCardByZone(zoneId, card) {
  if (zoneId === "pickup") state.pendingCard = card;
  else if (zoneId === "backpack") inventory.backpackCard = card;
  else if (zoneId.startsWith("slot")) {
    const idx = Number(zoneId.slice(4));
    if (Number.isInteger(idx) && idx >= 0 && idx < 3) inventory.cards[idx] = card;
  }
}

function swapCardsBetweenZones(fromZoneId, toZoneId) {
  if (!fromZoneId || !toZoneId || fromZoneId === toZoneId) return;
  const fromCard = getCardByZone(fromZoneId);
  if (!fromCard) return;
  const toCard = getCardByZone(toZoneId);
  setCardByZone(fromZoneId, toCard || null);
  setCardByZone(toZoneId, fromCard);
  recalcCardPassives();
  renderCardModal();
}

function closeCardModal() {
  state.inventoryModalOpen = false;
  state.pendingCard = null;
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

function pickPendingCard(swapIdx = -1) {
  if (!state.pendingCard) return;
  if (inventory.cards.length < 3) inventory.cards.push(state.pendingCard);
  else if (swapIdx >= 0 && swapIdx < inventory.cards.length) inventory.cards[swapIdx] = state.pendingCard;
  closeCardModal();
  recalcCardPassives();
}

function putPendingInActiveSlot(slotIdx) {
  if (!state.pendingCard) return;
  if (slotIdx < 0 || slotIdx >= 3) return;
  const prev = inventory.cards[slotIdx] || null;
  inventory.cards[slotIdx] = state.pendingCard;
  state.pendingCard = prev;
  recalcCardPassives();
  renderCardModal();
}

function putPendingInBackpack() {
  if (!state.pendingCard) return;
  const prev = inventory.backpackCard;
  inventory.backpackCard = state.pendingCard;
  state.pendingCard = prev;
  renderCardSlots();
  updateSetBonusStatus();
  renderCardModal();
}

function moveBackpackToSlot(slotIdx) {
  if (!inventory.backpackCard) return;
  if (slotIdx < 0 || slotIdx >= 3) return;
  const prev = inventory.cards[slotIdx] || null;
  inventory.cards[slotIdx] = inventory.backpackCard;
  inventory.backpackCard = prev;
  recalcCardPassives();
  renderCardModal();
}

function moveSlotToBackpack(slotIdx) {
  if (slotIdx < 0 || slotIdx >= 3) return;
  if (!inventory.cards[slotIdx]) return;
  const prev = inventory.backpackCard;
  inventory.backpackCard = inventory.cards[slotIdx];
  inventory.cards[slotIdx] = prev;
  recalcCardPassives();
  renderCardModal();
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

function hasLineOfSight(from, target) {
  if (segmentIntersectsSmoke(from.x, from.y, target.x, target.y)) return false;
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

function selectCharacter(id) {
  const picked = CHARACTERS[id];
  if (!picked) return;
  selectedCharacter = picked;
  abilities = makeAbilitiesForCharacter(selectedCharacter);
  passive.cooldownFlat = makeCooldownFlatForCharacter(selectedCharacter);
  passive.cooldownPct = makeCooldownPctForCharacter(selectedCharacter);
}

function startGameWithCharacter(id) {
  selectCharacter(id);
  gameStarted = true;
  if (characterSelectModal) characterSelectModal.classList.remove("open");
  resetGame();
}

function wireCharacterSelect() {
  if (!characterSelectModal || !characterSelectOptions?.length) {
    startGameWithCharacter("knight");
    return;
  }
  characterSelectModal.classList.add("open");
  for (const btn of characterSelectOptions) {
    btn.addEventListener("click", () => {
      const id = btn.dataset.characterId || "knight";
      startGameWithCharacter(id);
    });
  }
}

function lootSpawnIntervalScale() {
  const activeCount = Math.max(1, activeHexes.length || 1);
  // Spawn slower as visible hex count rises to keep perceived loot density stable.
  return Math.max(1, Math.sqrt(activeCount / LOOT_DENSITY_BASE_ACTIVE_HEXES));
}

function resetGame() {
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
  state.playerTimelockUntil = 0;
  state.tempHp = 0;
  state.tempHpExpiry = 0;
  state.ultimatePushbackReadyAt = 0;
  state.screenShakeUntil = 0;
  state.screenShakeStrength = 0;
  state.deathStartedAtMs = 0;
  state.manualPause = false;
  state.pausedForCard = false;
  state.inventoryModalOpen = false;
  state.waitingForMovementResume = false;
  state.pendingCard = null;
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
  inventory.cards = [];
  inventory.backpackCard = null;
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
    case "spawner":
      return { light: "#fecdd3", core: "#e11d48", shadow: "#881337", rim: "#fb7185", mark: "#fff1f2" };
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

  const ang = Math.random() * TAU;
  const d = rand(320, 760);
  h.x = player.x + Math.cos(ang) * d;
  h.y = player.y + Math.sin(ang) * d;
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
  const nJobs = 14;
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
  state.spawnInterval = Math.max(1.8, state.spawnInterval * 0.93);
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
    if (h.type === "spawner") continue;
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
    if (h.type === "spawner") continue;
    if (state.elapsed < (h.stunnedUntil || 0)) continue;
    if (hasLineOfSight(h, player)) return true;
  }
  return false;
}

function spawnHealPopup(x, y, text = "+1", color = "#86efac") {
  entities.healPopups.push({
    x,
    y,
    text,
    bornAt: state.elapsed,
    expiresAt: state.elapsed + 0.6,
  });
}

function forEachActiveCard(fn) {
  for (const card of inventory.cards) {
    if (card) fn(card);
  }
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
  const spadesCount = inventory.cards.filter((c) => c.suit === "spades").length;
  const wasStealthed =
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
    if (spadesCount >= 3 && wasStealthed) {
      inventory.spadesLandingStealthUntil = Math.max(
        inventory.spadesLandingStealthUntil,
        state.elapsed + 0.1
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
  return selectedCharacter.id === "rogue"
    ? inventory.rogueDiamondRangeBoost
      ? 180
      : 120
    : inventory.diamondEmpower === "dash2x"
      ? 240
      : 120;
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
      r: inventory.rogueDiamondRangeBoost ? 260 : 180,
      bornAt: state.elapsed,
      expiresAt: state.elapsed + (ability.duration ?? 3),
    });
    spawnAttackRing(player.x, player.y, 72, "#94a3b8", 0.2);
    spawnAttackRing(player.x, player.y, 128, "#cbd5e1", 0.28);
    return;
  }
  const burstCd = effectiveAbilityCooldown("burst", ability.cooldown, ability.minCooldown ?? 0.4);
  ability.nextReadyAt = state.elapsed + burstCd;
  player.burstUntil = state.elapsed + ability.duration;
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
  const decoyEmpower = inventory.diamondEmpower === "decoyLead";
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
  if (state.elapsed < inventory.clubsInvisUntil || state.elapsed < inventory.spadesLandingStealthUntil) {
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
    if (h.type === "spawner") continue; // immobile
    if (state.elapsed < (h.stunnedUntil || 0)) continue;

    const lifeSpan = h.life || Math.max(0.0001, h.dieAt - h.bornAt);
    const age = clamp((state.elapsed - h.bornAt) / lifeSpan, 0, 1);
    const speedFactor = 1 + age * 0.9;
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
    let speed = baseSpeed * speedFactor;
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
      moveCircleWithCollisions(h, h.dir.x * speed * 0.38, h.dir.y * speed * 0.38, dt);
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
    } else if (h.type === "laser") {
      const target = pickTargetForHunter(h);
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
    const target = pickTargetForHunter(h);
    if (selectedCharacter.id === "rogue" && target !== player) continue;
    h.lastShotAt = state.elapsed;
    spawnAttackRing(h.x, h.y, h.r + 7, "#fb923c", 0.14);

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
  if (selectedCharacter.id === "rogue" && state.rogueStealthActive) return;
  if (state.elapsed < inventory.spadesLandingStealthUntil) return;
  if (state.elapsed < state.playerInvulnerableUntil) return;
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
    state.deathCount += 1;
    state.snapshotPending = true;
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
      grantRandomAbility();
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
  if (inventory.diamondEmpower === "decoyLead") {
    for (const d of entities.decoys) {
      const away = vectorToTarget(player, d);
      moveCircleWithCollisions(d, away.x * 110, away.y * 110, dt);
    }
  }

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

  if (passive.heartsShieldArc > 0) {
    const facingAngle = Math.atan2(player.facing.y, player.facing.x);
    const halfArc = (passive.heartsShieldArc * Math.PI) / 360;
    const shieldR = player.r + 30;
    for (const h of entities.hunters) {
      if (h.type === "spawner") continue;
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
      if (hitDist <= player.r + 5) damagePlayer(2);
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
  state.hurtFlash = Math.max(0, state.hurtFlash - simDt);
  state.screenShakeStrength = Math.max(0, state.screenShakeStrength - simDt * 30);
  if (state.elapsed >= state.playerTimelockUntil) state.playerTimelockUntil = 0;
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

  const wBurstMult = inventory.diamondEmpower === "speedPassive" || state.elapsed < player.burstUntil ? 2 : 1;
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
  const effectiveSpeed = player.speed * speedMult * playerSpeedHealthMultiplier();
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
  if (!enemiesFrozen) {
    moveHunters(simDt);
    updateSnipers(simDt);
    updateRangedAttackers(simDt);
    updateSpawners(simDt);
  }
  updateSpecialAbilityEffects(simDt);
  if (!enemiesFrozen) {
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
    (passive.cooldownFlat.decoy || 0) + (selectedCharacter.id === "knight" && inventory.diamondEmpower === "decoyLead" ? 2 : 0)
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
        selectedCharacter.id === "knight" && inventory.diamondEmpower === "decoyLead" ? 2 : 0
      ),
      extra: "",
    },
    (() => {
      const type = abilities.random.type;
      const hasAbility = !!type;
      const displayName = type === "burst" ? "Push" : hasAbility ? type[0].toUpperCase() + type.slice(1) : "None";
      const lockRemaining =
        type === "burst" ? Math.max(0, state.ultimatePushbackReadyAt - state.elapsed) : 0;
      const locked = lockRemaining > 0;
      const outOfAmmo = hasAbility && abilities.random.ammo <= 0;
      let color = "#64748b";
      if (type === "shield") color = "#60a5fa";
      if (type === "burst") color = "#fde68a";
      if (type === "timelock") color = "#c084fc";
      if (type === "heal") color = "#4ade80";
      const ready = hasAbility && !locked && !outOfAmmo;
      return {
        key: abilities.random.key.toUpperCase(),
        label: displayName,
        color,
        remaining: ready ? 0 : lockRemaining || 1,
        duration: lockRemaining > 0 ? 8 : 1,
        extra: hasAbility ? `${abilities.random.ammo}/${abilities.random.maxAmmo}` : "0/0",
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
    drawCircle(ctx, food.x, food.y, rr, "#f59e0b", 0.9 * foodVis);
    drawCircle(ctx, food.x, food.y, rr * 0.45, "#fef3c7", 0.85 * foodVis);
    if (sense > 0) {
      ctx.strokeStyle = `rgba(252, 211, 77, ${(0.45 + near * 0.35) * (0.42 + 0.58 * freshness)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(food.x, food.y, rr + 5 + near * 4, 0, TAU);
      ctx.stroke();
    }

    const barW = 34;
    const barH = 4;
    const bx = food.x - barW / 2;
    const by = food.y + food.r + 8;
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
  } else if (state.tempHp > 0) {
    const p = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(state.elapsed * 10));
    ctx.strokeStyle = `rgba(52, 211, 153, ${0.35 + 0.25 * p})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 7 + p * 3, 0, TAU);
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
    const y = popup.y - t * 18;
    ctx.fillStyle = popup.color;
    ctx.globalAlpha = 1 - t;
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(popup.text, popup.x, y);
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
  if (key === abilities.random.key && !state.running) resetGame();
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  if (key.startsWith("arrow")) event.preventDefault();
  if (key.startsWith("arrow")) state.keys.delete(key);
  if (key === abilities.dash.key) releaseRogueDashAim();
});

snapshotFolderButton.addEventListener("click", () => {
  chooseSnapshotFolder();
});

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
requestAnimationFrame(loop);
    
}
