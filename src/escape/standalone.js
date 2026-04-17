(() => {
  // src/escape/constants.js
  var TAU = Math.PI * 2;
  var TILE_W = 560;
  var BLOCK = 35;
  var CAMERA_PAN_SPEED = 900;
  var HEAL_PICKUP_HIT_R = 24;
  var HEAL_PICKUP_PLUS_HALF = 13;
  var HEAL_PICKUP_ARM_THICK = 6;
  var SNIPER_ARTILLERY_WINDUP = 1.38;
  var SNIPER_ARTILLERY_LEAD = 0.94;
  function tileGridDims(viewH) {
    return {
      TILE_COLS: Math.floor(TILE_W / BLOCK),
      TILE_ROWS: Math.floor(viewH / BLOCK)
    };
  }

  // src/escape/math.js
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }
  function distSq(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }
  function pointToSegmentDistance(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const ab2 = abx * abx + aby * aby || 1;
    const apx = px - ax;
    const apy = py - ay;
    const t = clamp((apx * abx + apy * aby) / ab2, 0, 1);
    const cx = ax + abx * t;
    const cy = ay + aby * t;
    return Math.hypot(px - cx, py - cy);
  }
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }
  function intersectsRectCircle(circle, rect) {
    const nx = clamp(circle.x, rect.x, rect.x + rect.w);
    const ny = clamp(circle.y, rect.y, rect.y + rect.h);
    const dx = circle.x - nx;
    const dy = circle.y - ny;
    return dx * dx + dy * dy <= circle.r * circle.r;
  }

  // src/escape/rng.js
  function makeRng(seed) {
    let s = seed | 0;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }

  // src/escape/tiles.js
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
  function generateTileObstacles(tileIndex, d) {
    const { TILE_COLS, TILE_ROWS, TILE_W: TILE_W2, BLOCK: BLOCK2 } = d;
    const rng = makeRng(tileIndex * 2654435761);
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
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }]
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
      Math.floor(TILE_COLS * 0.8 + rng() * 2 - 2)
    ];
    for (const center of verticalCorridors) {
      for (let c = center - 1; c <= center + 1; c++) {
        if (c < 0 || c >= TILE_COLS) continue;
        for (let r = minRow; r <= maxRow; r++) grid[r][c] = false;
      }
    }
    const horizontalCorridors = [
      Math.floor(minRow + (maxRow - minRow) * 0.3),
      Math.floor(minRow + (maxRow - minRow) * 0.62)
    ];
    for (const center of horizontalCorridors) {
      for (let r = center; r <= center + 1; r++) {
        if (r < minRow || r > maxRow) continue;
        for (let c = 0; c < TILE_COLS; c++) grid[r][c] = false;
      }
    }
    const rects = [];
    const baseX = tileIndex * TILE_W2;
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = 0; c < TILE_COLS; c++) {
        if (!grid[r][c]) continue;
        rects.push({ x: baseX + c * BLOCK2, y: r * BLOCK2, w: BLOCK2, h: BLOCK2 });
      }
    }
    return rects;
  }

  // src/escape/draw.js
  function drawCircle(ctx, x, y, r, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  function drawHealPickup(ctx, p, elapsed) {
    const pulse = 0.94 + 0.06 * (0.5 + 0.5 * Math.sin(elapsed * 5));
    const h = (p.plusHalf ?? HEAL_PICKUP_PLUS_HALF) * pulse;
    const t = p.plusThick ?? HEAL_PICKUP_ARM_THICK;
    const { x, y } = p;
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = "rgba(52, 211, 153, 0.95)";
    ctx.shadowBlur = 20;
    ctx.fillStyle = "#047857";
    ctx.fillRect(-h, -t / 2, 2 * h, t);
    ctx.fillRect(-t / 2, -h, t, 2 * h);
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#10b981";
    ctx.fillRect(-h + 0.8, -t / 2 + 0.5, 2 * h - 1.6, t - 1);
    ctx.fillRect(-t / 2 + 0.5, -h + 0.8, t - 1, 2 * h - 1.6);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#d1fae5";
    ctx.fillRect(-h * 0.52, -t * 0.32, h * 1.04, t * 0.64);
    ctx.fillRect(-t * 0.32, -h * 0.52, t * 0.64, h * 1.04);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(236, 253, 245, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-h, -t / 2, 2 * h, t);
    ctx.strokeRect(-t / 2, -h, t, 2 * h);
    ctx.restore();
  }
  function drawObstacles(ctx, obstacles) {
    ctx.fillStyle = "#334155";
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    for (const o of obstacles) {
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeRect(o.x, o.y, o.w, o.h);
    }
  }

  // src/escape/game.js
  function mountEscape({
    canvas,
    snapshotFolderButton,
    snapshotStatus,
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
    cardSwapRow
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
    const CARD_SPAWN_INTERVAL = 12;
    let obstacles = [];
    let activeTileMinX = 0;
    let activeTileMaxX = VIEW_W;
    let activePlayerTile = 0;
    let cameraX = 0;
    let cameraPanDir = 0;
    let cameraOffset = 0;
    let lastTileIndex = null;
    const tileCache = /* @__PURE__ */ new Map();
    function ensureTilesForPlayer() {
      const tileIndex = Math.floor(player.x / TILE_W);
      activePlayerTile = tileIndex;
      if (lastTileIndex === tileIndex && obstacles.length) return;
      lastTileIndex = tileIndex;
      const needed = [tileIndex - 1, tileIndex, tileIndex + 1];
      for (const idx of needed) {
        if (!tileCache.has(idx)) tileCache.set(idx, generateTileObstacles(idx, { TILE_COLS, TILE_ROWS, TILE_W, BLOCK }));
      }
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
      _py: 340
    };
    const state = {
      keys: /* @__PURE__ */ new Set(),
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
      playerHeadstartUntil: 0
    };
    let snapshotDirectoryHandle = null;
    const abilities = {
      dash: { key: "q", cooldown: 2.2, nextReadyAt: 0 },
      burst: { key: "w", cooldown: 5, nextReadyAt: 0, duration: 3 },
      decoy: { key: "e", cooldown: 8, nextReadyAt: 0 },
      random: { key: "r", type: null, ammo: 0, maxAmmo: 0 }
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
      cards: [],
      healPopups: []
    };
    const inventory = {
      cards: [],
      backpackCard: null,
      diamondEmpower: null,
      heartsRegenPerSec: 0,
      spadesUltSlowUntil: 0,
      spadesObstacleBoostUntil: 0,
      clubsInvisUntil: 0,
      clubsPhaseThroughTerrain: false,
      heartsResistanceReadyAt: 0,
      heartsResistanceCooldownDuration: 0,
      heartsRegenBank: 0,
      dodgeTextUntil: 0
    };
    const passive = {
      cooldownFlat: { dash: 0, burst: 0, decoy: 0 },
      speedMult: 1,
      obstacleTouchMult: 1,
      dodgeChanceWhenDashCd: 0,
      stunOnHitSecs: 0,
      invisOnBurst: 0,
      dashChargesBonus: 0,
      heartsShieldArc: 0
    };
    const dashState = {
      charges: 1,
      maxCharges: 1,
      nextRechargeAt: 0
    };
    const suitGlyph = { diamonds: "\u2666", hearts: "\u2665", clubs: "\u2663", spades: "\u2660" };
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
    function makeCardEffect(suit, rank) {
      if (suit === "diamonds") {
        const abilityPool = ["dash", "burst", "decoy"];
        return { kind: "cooldown", target: abilityPool[Math.floor(Math.random() * abilityPool.length)], value: 0.1 * rank };
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
      if (Math.random() < 0.5) return { kind: "speed", value: Math.min(0.25, 0.025 * rank) };
      return { kind: "terrainBoost", value: Math.min(0.25, 0.025 * rank) };
    }
    function makeRandomCard() {
      const suit = randomSuitForDraw();
      const rank = Math.floor(rand(1, 14));
      return {
        id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        suit,
        rank,
        effect: makeCardEffect(suit, rank)
      };
    }
    function describeCardEffect(card) {
      const e = card.effect;
      if (e.kind === "cooldown") return `-${e.value.toFixed(1)}s ${e.target} cooldown`;
      if (e.kind === "maxHp") return `+${e.value} max HP`;
      if (e.kind === "hitResist") return `Block one hit every ${e.cooldown.toFixed(1)}s`;
      if (e.kind === "frontShield") return `Front shield arc +${Math.round(e.arc)}deg`;
      if (e.kind === "dodge") return `${Math.round(e.value * 1e3) / 10}% dodge while dash is cooling down`;
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
      passive.cooldownFlat = { dash: 0, burst: 0, decoy: 0 };
      passive.speedMult = 1;
      passive.obstacleTouchMult = 1;
      passive.dodgeChanceWhenDashCd = 0;
      passive.stunOnHitSecs = 0;
      passive.invisOnBurst = 0;
      passive.dashChargesBonus = 0;
      passive.heartsShieldArc = 0;
      inventory.heartsRegenPerSec = 0;
      inventory.clubsPhaseThroughTerrain = false;
      let maxHpBonus = 0;
      const suits = { diamonds: 0, hearts: 0, clubs: 0, spades: 0 };
      for (const card of inventory.cards) {
        suits[card.suit] += 1;
        const e = card.effect;
        if (e.kind === "cooldown") passive.cooldownFlat[e.target] += e.value;
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
      if (suits.spades >= 3) {
      }
      if (suits.diamonds >= 3 && !inventory.diamondEmpower && !state.setBonusChoicePendingSuit) {
        state.setBonusChoicePendingSuit = "diamonds";
      }
      dashState.maxCharges = 1 + passive.dashChargesBonus;
      dashState.charges = Math.min(dashState.charges || dashState.maxCharges, dashState.maxCharges);
      player.maxHp = Math.max(1, 10 + maxHpBonus);
      player.hp = Math.min(player.hp, player.maxHp);
      renderCardSlots();
      updateSetBonusStatus();
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
        const pick = inventory.diamondEmpower === "dash2x" ? "dash goes twice as far" : inventory.diamondEmpower === "speedPassive" ? "speed burst is passive" : inventory.diamondEmpower === "decoyLead" ? "decoy drifts away, cooldown -2s, duration +1s" : "choose your empowerment in inventory";
        lines.push(`Set bonus! Diamonds: ${pick}.`);
      }
      if (suits.hearts >= 3) lines.push("Set bonus! Hearts: passive HP regeneration.");
      if (suits.clubs >= 3) lines.push("Set bonus! Clubs: burst phase-through terrain.");
      if (suits.spades >= 3) lines.push("Set bonus! Spades: ult slows the world for 3s.");
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
        cardModalFace.innerHTML = '<div class="desc">Drag cards between Slot 1-3 and Backpack. Press X or Leave when done.</div>';
      }
      cardSwapRow.innerHTML = "";
      const zones = [
        { id: "pickup", label: "Pickup", card: state.pendingCard },
        { id: "slot0", label: "Slot 1", card: inventory.cards[0] || null },
        { id: "slot1", label: "Slot 2", card: inventory.cards[1] || null },
        { id: "slot2", label: "Slot 3", card: inventory.cards[2] || null },
        { id: "backpack", label: "Backpack", card: inventory.backpackCard || null }
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
    }
    function outOfBoundsCircle(c) {
      return c.y - c.r < 0 || c.y + c.r > world.h;
    }
    function collidesAnyObstacle(circle) {
      for (const obstacle of obstacles) {
        if (intersectsRectCircle(circle, obstacle)) return true;
      }
      return false;
    }
    function lineIntersectsRect2(x1, y1, x2, y2, rect) {
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
        if (lineIntersectsRect2(from.x, from.y, target.x, target.y, obstacle)) return false;
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
    function moveCircleWithCollisions(entity, vx, vy, dt, opts = {}) {
      const ignoreObstacles = !!opts.ignoreObstacles;
      let touchedObstacle = false;
      const nx = { x: entity.x + vx * dt, y: entity.y, r: entity.r };
      const nxBlocked = outOfBoundsCircle(nx) || !ignoreObstacles && collidesAnyObstacle(nx);
      if (!nxBlocked) entity.x = nx.x;
      else if (!ignoreObstacles) touchedObstacle = true;
      const ny = { x: entity.x, y: entity.y + vy * dt, r: entity.r };
      const nyBlocked = outOfBoundsCircle(ny) || !ignoreObstacles && collidesAnyObstacle(ny);
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
    function randomOpenPoint(radius, attempts = 80) {
      for (let i = 0; i < attempts; i++) {
        const candidate = {
          x: rand(activeTileMinX + radius + 6, activeTileMaxX - radius - 6),
          y: rand(radius + 6, world.h - radius - 6),
          r: radius
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
      return {
        x: clamp(cx, activeTileMinX + r + 2, activeTileMaxX - r - 2),
        y: clamp(cy, r + 2, world.h - r - 2),
        r
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
      state.nextPickupAt = 3.5;
      state.nextCardAt = 10;
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
      player.x = 96;
      player.y = 340;
      cameraOffset = 0;
      cameraPanDir = 0;
      obstacles = [];
      activeTileMinX = 0;
      activeTileMaxX = VIEW_W;
      activePlayerTile = 0;
      lastTileIndex = null;
      player.maxHp = 10;
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
      inventory.cards = [];
      inventory.backpackCard = null;
      inventory.diamondEmpower = null;
      inventory.heartsRegenPerSec = 0;
      inventory.spadesUltSlowUntil = 0;
      inventory.spadesObstacleBoostUntil = 0;
      inventory.clubsInvisUntil = 0;
      inventory.clubsPhaseThroughTerrain = false;
      inventory.heartsResistanceReadyAt = 0;
      inventory.heartsResistanceCooldownDuration = 0;
      inventory.heartsRegenBank = 0;
      inventory.dodgeTextUntil = 0;
      passive.cooldownFlat = { dash: 0, burst: 0, decoy: 0 };
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
      cameraX = clamp(player.x - VIEW_W / 2 + cameraOffset, activeTileMinX, activeTileMaxX - VIEW_W);
      renderCardSlots();
      updateSetBonusStatus();
      renderCardModal();
    }
    function playerMissingHealth01() {
      if (player.maxHp <= 0) return 0;
      return clamp(1 - player.hp / player.maxHp, 0, 1);
    }
    function playerSpeedHealthMultiplier() {
      return 1 + playerMissingHealth01() * 0.08;
    }
    function playerColorByHealth() {
      const t = playerMissingHealth01() * 0.65;
      const blue = { r: 96, g: 165, b: 250 };
      const red = { r: 239, g: 68, b: 68 };
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
    function drawHunterBody(ctx2, h) {
      const pal = hunterPalette(h.type);
      const { x, y, r } = h;
      const g = ctx2.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.08, x, y, r);
      g.addColorStop(0, pal.light);
      g.addColorStop(0.55, pal.core);
      g.addColorStop(1, pal.shadow);
      ctx2.save();
      ctx2.beginPath();
      ctx2.arc(x, y, r, 0, TAU);
      ctx2.fillStyle = g;
      ctx2.fill();
      ctx2.strokeStyle = pal.rim;
      ctx2.lineWidth = 2;
      ctx2.stroke();
      const mx = h.dir.x * r * 0.38;
      const my = h.dir.y * r * 0.38;
      ctx2.fillStyle = pal.mark;
      ctx2.globalAlpha = 0.45;
      ctx2.beginPath();
      ctx2.arc(x + mx, y + my, r * 0.22, 0, TAU);
      ctx2.fill();
      ctx2.globalAlpha = 1;
      ctx2.restore();
    }
    function drawDecoyBody(ctx2, d) {
      const { x, y, r } = d;
      const g = ctx2.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.05, x, y, r);
      g.addColorStop(0, "#ede9fe");
      g.addColorStop(0.5, "#a78bfa");
      g.addColorStop(1, "#5b21b6");
      ctx2.save();
      ctx2.beginPath();
      ctx2.arc(x, y, r, 0, TAU);
      ctx2.fillStyle = g;
      ctx2.fill();
      ctx2.strokeStyle = "rgba(196, 181, 253, 0.85)";
      ctx2.lineWidth = 2;
      ctx2.stroke();
      ctx2.restore();
    }
    function drawProjectileBody(ctx2, p) {
      const g = ctx2.createRadialGradient(p.x - 1, p.y - 1, 0.5, p.x, p.y, p.r);
      g.addColorStop(0, "#fef3c7");
      g.addColorStop(0.4, "#f59e0b");
      g.addColorStop(1, "#b45309");
      ctx2.save();
      ctx2.beginPath();
      ctx2.arc(p.x, p.y, p.r, 0, TAU);
      ctx2.fillStyle = g;
      ctx2.fill();
      ctx2.strokeStyle = "rgba(251, 191, 36, 0.9)";
      ctx2.lineWidth = 1.2;
      ctx2.stroke();
      ctx2.restore();
    }
    function drawPlayerBody(ctx2, invulnAlpha) {
      const px = player.x;
      const py = player.y;
      const pr = player.r;
      const core = playerColorByHealth();
      const g = ctx2.createRadialGradient(px - pr * 0.42, py - pr * 0.48, pr * 0.06, px, py, pr);
      g.addColorStop(0, "rgba(248, 250, 252, 0.95)");
      g.addColorStop(0.38, core);
      g.addColorStop(1, "rgba(15, 23, 42, 0.88)");
      ctx2.save();
      ctx2.globalAlpha = invulnAlpha;
      ctx2.beginPath();
      ctx2.arc(px, py, pr, 0, TAU);
      ctx2.fillStyle = g;
      ctx2.fill();
      ctx2.strokeStyle = "rgba(56, 189, 248, 0.55)";
      ctx2.lineWidth = 2;
      ctx2.stroke();
      const fx = player.facing.x;
      const fy = player.facing.y;
      const tipX = px + fx * pr * 0.72;
      const tipY = py + fy * pr * 0.72;
      const ox = -fy * pr * 0.28;
      const oy = fx * pr * 0.28;
      ctx2.fillStyle = "rgba(255, 255, 255, 0.88)";
      ctx2.beginPath();
      ctx2.moveTo(tipX, tipY);
      ctx2.lineTo(px + fx * pr * 0.15 + ox, py + fy * pr * 0.15 + oy);
      ctx2.lineTo(px + fx * pr * 0.15 - ox, py + fy * pr * 0.15 - oy);
      ctx2.closePath();
      ctx2.fill();
      ctx2.restore();
    }
    function drawPlayerHpHud(ctx2) {
      const px = player.x;
      const py = player.y;
      const pr = player.r;
      const main = player.hp + " / " + player.maxHp;
      const extra = state.tempHp > 0 ? "+" + state.tempHp + " temp" : "";
      ctx2.save();
      ctx2.textAlign = "center";
      ctx2.textBaseline = "bottom";
      const yMain = py - pr - 10;
      const yExtra = yMain - (extra ? 14 : 0);
      ctx2.font = "bold 15px ui-sans-serif, system-ui, Segoe UI, sans-serif";
      ctx2.lineWidth = 4;
      ctx2.strokeStyle = "rgba(2, 6, 23, 0.82)";
      ctx2.strokeText(main, px, yMain);
      ctx2.fillStyle = player.hp <= player.maxHp * 0.35 ? "#fca5a5" : "#f8fafc";
      ctx2.fillText(main, px, yMain);
      if (extra) {
        ctx2.font = "11px ui-sans-serif, system-ui, Segoe UI, sans-serif";
        ctx2.lineWidth = 3;
        ctx2.strokeStyle = "rgba(2, 6, 23, 0.82)";
        ctx2.strokeText(extra, px, yExtra);
        ctx2.fillStyle = "#6ee7b7";
        ctx2.fillText(extra, px, yExtra);
      }
      ctx2.restore();
    }
    function spawnAttackRing(x, y, r, color = "#fca5a5", duration = 0.18) {
      entities.attackRings.push({
        x,
        y,
        r,
        color,
        bornAt: state.elapsed,
        expiresAt: state.elapsed + duration
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
        radius
      });
    }
    function setSnapshotStatus(text) {
      snapshotStatus.textContent = text;
    }
    function makeSnapshotFilename() {
      const stamp = (/* @__PURE__ */ new Date()).toISOString().replaceAll(":", "-").replaceAll(".", "-");
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
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
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
        hitLockUntil: 0
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
        h.chaserDashNextReady = state.elapsed + rand(0.35, 1);
      } else if (type === "cutter") {
        r = 10;
        life = 8;
        lastShotAt = state.elapsed + rand(0.3, 1.1);
      } else if (type === "ranged") {
        r = 10;
        life = 8;
        lastShotAt = state.elapsed + rand(0.4, 1);
        h.shotInterval = 1.35;
        h.shotSpeed = 360;
      } else if (type === "laser") {
        r = 13;
        life = 8;
        lastShotAt = state.elapsed + rand(0.6, 1.2);
        h.laserState = "move";
        h.aimStartedAt = 0;
        h.nextLaserReadyAt = state.elapsed + rand(0.7, 1.4);
        h.laserCooldown = 1;
        h.laserWarning = 0.42;
        h.laserAim = null;
      } else if (type === "fast") {
        r = 9;
        life = 2;
        lastShotAt = state.elapsed + 999;
      } else if (type === "spawner") {
        r = 18;
        life = 8;
        lastShotAt = state.elapsed + 999;
        h.spawnDelayUntil = state.elapsed + 2;
        h.spawnActiveUntil = state.elapsed + 8;
        h.nextSwarmAt = h.spawnDelayUntil;
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
      state.spawnInterval = Math.max(2.5, state.spawnInterval * 0.93);
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
        heal: 3
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
        expiresAt: state.elapsed + 12
      });
    }
    function spawnHealPopup(x, y, text = "+1", color = "#86efac") {
      entities.healPopups.push({
        x,
        y,
        text,
        bornAt: state.elapsed,
        expiresAt: state.elapsed + 0.6
      });
    }
    function getHeartsResistanceCardCount() {
      let n = 0;
      for (const card of inventory.cards) {
        if (card?.effect?.kind === "hitResist") n++;
      }
      return n;
    }
    function getHeartsResistanceCooldown() {
      let totalReduction = 0;
      for (const card of inventory.cards) {
        const e = card?.effect;
        if (e?.kind !== "hitResist") continue;
        totalReduction += Math.max(0, 15 - e.cooldown);
      }
      return Math.max(1.5, 15 - totalReduction);
    }
    function openCardPickupModal(card) {
      state.pausedForCard = true;
      state.inventoryModalOpen = true;
      state.waitingForMovementResume = false;
      state.pendingCard = card;
      state.keys.clear();
      cameraPanDir = 0;
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
      dashState.charges -= 1;
      if (dashState.charges < dashState.maxCharges) {
        const cd = Math.max(0.25, ability.cooldown - passive.cooldownFlat.dash);
        dashState.nextRechargeAt = Math.max(dashState.nextRechargeAt, state.elapsed + cd);
      }
      const dir = player.facing;
      const step = 12;
      const dashRange = inventory.diamondEmpower === "dash2x" ? 240 : 120;
      let tx = player.x;
      let ty = player.y;
      let progressed = false;
      for (let d = step; d <= dashRange; d += step) {
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
      const burstCd = Math.max(0.4, ability.cooldown - passive.cooldownFlat.burst);
      ability.nextReadyAt = state.elapsed + burstCd;
      player.burstUntil = state.elapsed + ability.duration;
      if (passive.invisOnBurst > 0) inventory.clubsInvisUntil = Math.max(inventory.clubsInvisUntil, state.elapsed + passive.invisOnBurst);
    }
    function tryDecoy() {
      const ability = abilities.decoy;
      if (state.elapsed < ability.nextReadyAt || !state.running) return;
      const decoyEmpower = inventory.diamondEmpower === "decoyLead";
      const decoyCd = Math.max(0.4, ability.cooldown - passive.cooldownFlat.decoy - (decoyEmpower ? 2 : 0));
      ability.nextReadyAt = state.elapsed + decoyCd;
      entities.decoys.push({
        x: player.x,
        y: player.y,
        r: player.r,
        hp: 3,
        invulnerableUntil: state.elapsed + 0.4,
        expiresAt: state.elapsed + 6 + (decoyEmpower ? 1 : 0)
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
            r: 10
          }
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
        const spadesCount = inventory.cards.filter((c) => c.suit === "spades").length;
        if (spadesCount >= 3) {
          const delay = state.playerTimelockUntil > state.elapsed ? state.playerTimelockUntil - state.elapsed : 0;
          inventory.spadesUltSlowUntil = Math.max(inventory.spadesUltSlowUntil, state.elapsed + delay + 3);
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
      if (state.elapsed < inventory.clubsInvisUntil) {
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
        r: hunter.r
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
        ax += awayX / dist * influence;
        ay += awayY / dist * influence;
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
        const lifeSpan = h.life || Math.max(1e-4, h.dieAt - h.bornAt);
        const age = clamp((state.elapsed - h.bornAt) / lifeSpan, 0, 1);
        const speedFactor = 1 + age * 0.9;
        const baseSpeed = h.type === "sniper" ? 100 : h.type === "cutter" ? 116 : h.type === "laser" ? 138 : h.type === "ranged" ? 85 : h.type === "fast" ? 150 : 110;
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
                active: true
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
              active: false
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
          damage: 1
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
        expiresAt: state.elapsed + 0.22
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
          exploded: false
        });
        const dist = Math.hypot(aimX - h.x, aimY - h.y) || 1;
        entities.bullets.push({
          x: h.x,
          y: h.y,
          tx: aimX,
          ty: aimY,
          bornAt: state.elapsed,
          life: clamp(0.14 + dist / 2200, 0.16, 0.32)
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
          const refreshFactor = 0.8;
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
        const halfArc = passive.heartsShieldArc * Math.PI / 360;
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
      if (!state.running) return;
      if (state.manualPause) return;
      if (state.pausedForCard) return;
      const worldSlow = state.elapsed < inventory.spadesUltSlowUntil ? 0.35 : 1;
      const simDt = dt * worldSlow;
      state.elapsed += simDt;
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
        dashState.charges = dashState.maxCharges;
        dashState.nextRechargeAt = 0;
      }
      cameraOffset += cameraPanDir * CAMERA_PAN_SPEED * simDt;
      ensureTilesForPlayer();
      cameraX = clamp(player.x - VIEW_W / 2 + cameraOffset, activeTileMinX, activeTileMaxX - VIEW_W);
      cameraOffset = cameraX - (player.x - VIEW_W / 2);
      while (state.spawnScheduled.length && state.spawnScheduled[0].at <= state.elapsed) {
        state.spawnScheduled.shift().fn();
      }
      if (state.elapsed >= state.nextSpawnAt) advanceSpawnWave();
      if (state.elapsed >= state.nextPickupAt) {
        spawnPickup();
        state.nextPickupAt = state.elapsed + 5;
      }
      if (state.elapsed >= state.nextCardAt) {
        spawnCardPickup();
        state.nextCardAt = state.elapsed + CARD_SPAWN_INTERVAL + rand(-2.2, 4.1);
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
      const wBurstMult = inventory.diamondEmpower === "speedPassive" || state.elapsed < player.burstUntil ? 2 : 1;
      const ultSpeedMult = state.elapsed < player.ultimateSpeedUntil ? 1.75 : 1;
      const terrainMult = state.elapsed < inventory.spadesObstacleBoostUntil ? 1 + passive.obstacleTouchMult : 1;
      const speedMult = Math.max(wBurstMult, ultSpeedMult) * passive.speedMult * terrainMult;
      const effectiveSpeed = player.speed * speedMult * playerSpeedHealthMultiplier();
      const moving = mx !== 0 || my !== 0;
      const phaseThrough = inventory.clubsPhaseThroughTerrain && state.elapsed < player.burstUntil;
      const moveRes = moveCircleWithCollisions(player, mx * effectiveSpeed, my * effectiveSpeed, dt, {
        ignoreObstacles: phaseThrough
      });
      if (moving && moveRes.touchedObstacle && passive.obstacleTouchMult > 1) {
        inventory.spadesObstacleBoostUntil = state.elapsed + 1;
      }
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
    }
    function updateAbilityButtons() {
      if (!abilitySlots) return;
      const dashReduction = Math.max(0, passive.cooldownFlat.dash);
      const burstReduction = Math.max(0, passive.cooldownFlat.burst);
      const decoyReduction = Math.max(0, passive.cooldownFlat.decoy + (inventory.diamondEmpower === "decoyLead" ? 2 : 0));
      const cdrSuffix = (base, reduction) => {
        if (!(reduction > 1e-3) || !(base > 1e-3)) return "";
        const pct = Math.round(reduction / base * 100);
        return ` -${reduction.toFixed(1)}s -${pct}%`;
      };
      const abilitiesUi = [
        {
          key: "Q",
          label: "Dash" + cdrSuffix(abilities.dash.cooldown, dashReduction),
          color: "#38bdf8",
          remaining: cdr(abilities.dash),
          duration: Math.max(0.25, abilities.dash.cooldown - dashReduction),
          extra: `${dashState.charges}/${dashState.maxCharges}`
        },
        {
          key: "W",
          label: "Burst" + cdrSuffix(abilities.burst.cooldown, burstReduction),
          color: "#22d3ee",
          remaining: cdr(abilities.burst),
          duration: Math.max(0.4, abilities.burst.cooldown - burstReduction),
          extra: ""
        },
        {
          key: "E",
          label: "Decoy" + cdrSuffix(abilities.decoy.cooldown, decoyReduction),
          color: "#a78bfa",
          remaining: cdr(abilities.decoy),
          duration: Math.max(0.4, abilities.decoy.cooldown - decoyReduction),
          extra: ""
        },
        (() => {
          const type = abilities.random.type;
          const hasAbility = !!type;
          const lockRemaining = type === "burst" ? Math.max(0, state.ultimatePushbackReadyAt - state.elapsed) : 0;
          const locked = lockRemaining > 0;
          const outOfAmmo = hasAbility && abilities.random.ammo <= 0;
          let color = "#64748b";
          if (type === "shield") color = "#60a5fa";
          if (type === "burst") color = "#fde68a";
          if (type === "timelock") color = "#c084fc";
          if (type === "heal") color = "#4ade80";
          const ready = hasAbility && !locked && !outOfAmmo;
          return {
            key: "R",
            label: hasAbility ? type[0].toUpperCase() + type.slice(1) : "None",
            color,
            remaining: ready ? 0 : lockRemaining || 1,
            duration: lockRemaining > 0 ? 8 : 1,
            extra: hasAbility ? `${abilities.random.ammo}/${abilities.random.maxAmmo}` : "0/0"
          };
        })()
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
        const cooldownProgress = clamp(1 - info.remaining / Math.max(1e-3, info.duration), 0, 1);
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
      const deathElapsed = state.running ? 0 : Math.max(0, (tsMs - state.deathStartedAtMs) / 1e3);
      const deathAnimDone = !state.running && deathElapsed >= DEATH_ANIM_DURATION;
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0, 0, world.w, world.h);
      const shake = state.elapsed < state.screenShakeUntil ? {
        x: (Math.random() * 2 - 1) * state.screenShakeStrength,
        y: (Math.random() * 2 - 1) * state.screenShakeStrength
      } : { x: 0, y: 0 };
      ctx.save();
      ctx.translate(-cameraX + shake.x, shake.y);
      drawObstacles(ctx, obstacles);
      for (const p of entities.pickups) {
        drawHealPickup(ctx, p, state.elapsed);
        const lifeLeft = clamp((p.expiresAt - state.elapsed) / (p.life || 1e-3), 0, 1);
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
        drawProjectileBody(ctx, p);
      }
      for (const fx of entities.ultimateEffects) {
        const t = clamp((state.elapsed - fx.bornAt) / Math.max(1e-3, fx.expiresAt - fx.bornAt), 0, 1);
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
            (state.elapsed - beam.bornAt) / Math.max(1e-3, beam.expiresAt - beam.bornAt),
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
      for (const h of entities.hunters) {
        if (h.type !== "spawner") continue;
        if (state.elapsed >= h.spawnDelayUntil) continue;
        const delayTotal = 2;
        const elapsedSinceBorn = state.elapsed - h.bornAt;
        const progress = clamp(elapsedSinceBorn / delayTotal, 0, 1);
        const remaining = 1 - progress;
        const clockR = h.r + 28 + remaining * 6;
        const pulse = 1 + Math.sin(state.elapsed * 10) * 0.04;
        const alpha = 0.1 + remaining * 0.18;
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = "#fb7185";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, clockR * pulse, 0, TAU);
        ctx.stroke();
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
        const total = h.life || Math.max(1e-4, h.dieAt - h.bornAt);
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
        const t = clamp((state.elapsed - ring.bornAt) / Math.max(1e-3, ring.expiresAt - ring.bornAt), 0, 1);
        const rr = ring.r * (1 + t * 0.28);
        ctx.strokeStyle = ring.color;
        ctx.globalAlpha = 0.85 * (1 - t);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, rr, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      const playerInvuln = state.elapsed < state.playerInvulnerableUntil ? 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(state.elapsed * 32)) : 1;
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
        const cdDur = Math.max(1e-3, inventory.heartsResistanceCooldownDuration || getHeartsResistanceCooldown());
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
          (state.elapsed - ripple.bornAt) / Math.max(1e-3, ripple.expiresAt - ripple.bornAt),
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
        const t = clamp((state.elapsed - popup.bornAt) / Math.max(1e-3, popup.expiresAt - popup.bornAt), 0, 1);
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
        const arc = passive.heartsShieldArc * Math.PI / 180;
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
      ctx.restore();
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
      drawHud();
      updateAbilityButtons();
      if (state.elapsed < inventory.dodgeTextUntil) {
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "bold 22px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Dodge!", world.w / 2, 56);
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
      const dt = Math.min((ts - state.lastTime) / 1e3, 0.033);
      state.lastTime = ts;
      const scale = getSimulationTimeScale();
      update(dt * scale);
      render(ts);
      requestAnimationFrame(loop);
    }
    function onAbilityKey(key) {
      if (state.pausedForCard) return;
      if (key === abilities.dash.key) tryDash();
      if (key === abilities.burst.key) tryBurst();
      if (key === abilities.decoy.key) tryDecoy();
      if (key === abilities.random.key) useRandomAbility();
    }
    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (key.startsWith("arrow")) event.preventDefault();
      if (state.manualPause) {
        state.manualPause = false;
        if (key === " ") return;
      }
      if (state.inventoryModalOpen && (key === "enter" || key === " " || key === "escape")) {
        continueAfterLoadout();
        return;
      }
      if (key === " " && !state.pausedForCard && !state.inventoryModalOpen) {
        state.manualPause = true;
        state.keys.clear();
        cameraPanDir = 0;
        return;
      }
      if (state.waitingForMovementResume) {
        const movementInput = key.startsWith("arrow");
        if (!movementInput) return;
        state.waitingForMovementResume = false;
        state.pausedForCard = false;
      }
      if (key.startsWith("arrow")) state.keys.add(key);
      if (key === "a") cameraPanDir = -1;
      if (key === "d") cameraPanDir = 1;
      if (key === "s") cameraOffset = 0;
      onAbilityKey(key);
      if (key === "r" && !state.running) resetGame();
    });
    window.addEventListener("keyup", (event) => {
      const key = event.key.toLowerCase();
      if (key.startsWith("arrow")) event.preventDefault();
      if (key.startsWith("arrow")) state.keys.delete(key);
      if (key === "a" || key === "d") cameraPanDir = 0;
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
    resetGame();
    requestAnimationFrame(loop);
  }

  // src/escape/entry.js
  mountEscape({
    canvas: document.getElementById("game"),
    snapshotFolderButton: document.getElementById("snapshot-folder-button"),
    snapshotStatus: document.getElementById("snapshot-status"),
    abilitySlots: Array.from(document.querySelectorAll(".ability-slot")),
    cardSlotEls: Array.from(document.querySelectorAll("#card-slots .card-slot")),
    backpackSlotEl: document.getElementById("backpack-slot"),
    setBonusStatusEl: document.getElementById("set-bonus-status"),
    cardModal: document.getElementById("card-modal"),
    cardModalFace: document.getElementById("card-modal-face"),
    modalSetBonusStatusEl: document.getElementById("modal-set-bonus-status"),
    cardCloseButton: document.getElementById("card-close-button"),
    cardPickupButton: document.getElementById("card-pickup-button"),
    cardSkipButton: document.getElementById("card-skip-button"),
    cardSwapRow: document.getElementById("card-swap-row")
  });
})();
