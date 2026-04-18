/**
 * Game tuning numbers, character definitions, hex layout scale, arena/roulette constants.
 * Split from `game.js` to keep the main loop file smaller.
 */
import { TILE_W } from "./constants.js";

export const DEATH_ANIM_DURATION = 0.42;
export const PICKUP_SPAWN_INTERVAL = 3.2;
export const CARD_SPAWN_INTERVAL = 8.5;
export const LOOT_DENSITY_BASE_ACTIVE_HEXES = 3;
export const TERRAIN_SPEED_BOOST_LINGER = 0.16;
export const ROGUE_STEALTH_AFTER_LOS_BREAK = 0.35;
export const ROGUE_STEALTH_OPEN_GRACE = 0.4;
/** Knight Spades set bonus: after using R (ultimate), non-player simulation uses this `dt` multiplier for this many seconds. */
export const KNIGHT_SPADES_WORLD_SLOW_MULT = 0.3;
export const KNIGHT_SPADES_WORLD_SLOW_SEC = 2;

/** Hunter wave spacing at run start (seconds until next wave after scheduling). */
export const SPAWN_INTERVAL_START = 8;
/** Minimum seconds between hunter spawn waves once danger ramp is full (was 1.8). */
export const SPAWN_INTERVAL_FLOOR = 1.5;
/** Survival time over which wave spacing eases from START → FLOOR (matches danger bar). */
export const DANGER_RAMP_SECONDS = 300;
/** Knight + Diamonds speed burst path: multiplier vs default passive/active burst factor of 2 (+30% on that factor → 2.6). */
export const KNIGHT_DIAMOND_BURST_SPEED_MULT = 2.6;
/** Extra seconds on W burst window when that path is active. */
export const KNIGHT_DIAMOND_BURST_DURATION_BONUS_SEC = 1.5;
/** From this many seconds, waves can include `airSpawner` and `laserBlue` elites. */
export const LATE_GAME_ELITE_SPAWN_SEC = 180;
/** After this many seconds, every `MIDGAME_ESCALATION_INTERVAL_SEC` adds +5% enemy speed (compounding) and +1 spawn per wave. */
export const MIDGAME_ESCALATION_START_SEC = 240;
export const MIDGAME_ESCALATION_INTERVAL_SEC = 15;
export const MIDGAME_ESCALATION_SPEED_FACTOR = 1.05;
export const BASE_WAVE_SPAWN_JOBS = 14;
/** Flying spawner chase speed (includes ~5% buff over original 84). */
export const AIR_SPAWNER_CHASE_SPEED = 84 * 1.05;
/** Blue laser: time between full shot cycles (slightly longer than red). */
export const LASER_BLUE_COOLDOWN_SEC = 1.22;
/** Blue laser: shorter warning = faster shot after aim (repositions quicker). */
export const LASER_BLUE_WARN_SEC = 0.3;
/** Blue laser hit: player move speed multiplier. */
export const LASER_BLUE_PLAYER_SLOW_MULT = 0.8;
export const LASER_BLUE_PLAYER_SLOW_SEC = 1.5;
/** Hunter `speedFactor` uses `1 + age * coeff` over each hunter's lifetime; was 0.9 (+0.9 max); +0.2 → 1.1 (+1.1 max). */
export const HUNTER_SPEED_AGE_COEFF = 1.1;
/** Matching suit cards in the rank deck required to unlock that suit's set bonus. */
export const SET_BONUS_SUIT_THRESHOLD = 7;
/** Full set: all 13 ranks of a suit in the deck unlock the second-tier bonus. */
export const SET_BONUS_SUIT_MAX = 13;
/** Hearts 13: once per this many seconds, lethal damage sets HP to 5 instead. */
export const HEARTS_13_DEATH_DEFY_CD_SEC = 30;
/** Spades 13: enemies/projectiles in this radius (px) use ~30% slower motion; ≈2in at 96 CSS px/in. */
export const SPADES_13_AURA_RADIUS_PX = 2 * 96;
/** Spades 13: multiplier on hostile `dt` while inside the aura (30% slow). */
export const SPADES_13_ENEMY_DT_MULT = 0.7;
/** Clubs 13: collision radius vs base `player.r`. */
export const CLUBS_13_HITBOX_MULT = 0.7;
/** Clubs 13: after taking real HP damage, enemies ignore the player briefly. */
export const CLUBS_13_UNTARGETABLE_SEC = 1;
export const PLAYER_BASE_HITBOX_R = 10;
/** Card pickup: spawn weight at rank 2 vs King (linear in between); doubles prior 12:1 curve. */
export const CARD_RANK_SPAWN_WEIGHT_MAX = 24;
export const CARD_RANK_SPAWN_WEIGHT_MIN = 1;
/** Ultimate (R): cooldown after any ult use. */
export const ULTIMATE_ABILITY_COOLDOWN_SEC = 20;
/** Push ult: radius per wave (was 140; doubled). */
export const ULT_BURST_RADIUS = 280;
export const ULT_BURST_WAVE_COUNT = 5;
export const ULT_BURST_WAVE_SPAN_SEC = 2;
/** Orbiting ult shields: distance from player center (slightly farther than old single orbiter). */
export const ULT_ORBIT_SHIELD_RADIUS_EXTRA = 36;
export const ULT_ORBIT_SHIELD_STAGGER_SEC = 4;
/** Food sets hunger to at least this many seconds (cap stays rogueHungerMax). */
export const ROGUE_FOOD_HUNGER_RESTORE = 30;
/** Seconds food stays on the map before expiring. */
export const ROGUE_FOOD_LIFETIME = 21;
/** Consume (E) food-sense overlay duration (screen arrows). */
export const ROGUE_FOOD_SENSE_DURATION = 2.35;
/** World px: at or inside this distance to food, arrow size is maxed (no growth when closer). */
export const ROGUE_FOOD_ARROW_CLOSE_PLATEAU = 96;
/** World px: beyond this, food-sense arrows use minimum size. */
export const ROGUE_FOOD_ARROW_FAR_LEN = 440;
/** Rogue move speed bonus when starving; linear up to this fraction at 0 hunger. */
export const ROGUE_DESPERATION_SPEED_MAX = 0.2;
export const CAMERA_FOLLOW_LERP = 0.18;

export const CHARACTERS = {
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

export const HEX_SIZE = TILE_W * 1.15;
export const SQRT3 = Math.sqrt(3);
export const HEX_DIRS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const ARENA_NEXUS_SIEGE_SEC = 10;
/** Inner “parallel” hex outline vs circumradius `HEX_SIZE`. */
export const ARENA_NEXUS_INNER_HEX_SCALE = 0.62;
/** Distance from nexus center to inner threshold (pointy-top inradius of inner hex). */
export const ARENA_NEXUS_INNER_ENTER_R = HEX_SIZE * ARENA_NEXUS_INNER_HEX_SCALE * (SQRT3 / 2) * 0.96;
/** Pointy-top inner hex apothem (center → flat edge) for `HEX_SIZE * ARENA_NEXUS_INNER_HEX_SCALE` vertex radius. */
export const ARENA_NEXUS_INNER_APOTHEM = HEX_SIZE * ARENA_NEXUS_INNER_HEX_SCALE * (SQRT3 / 2);
export const ARENA_NEXUS_RING_LO = HEX_SIZE * 0.66;
export const ARENA_NEXUS_RING_HI = HEX_SIZE * 0.93;
/** Continuous spawn cadence for real laser / sniper hunters on the nexus ring. */
export const ARENA_NEXUS_RING_LASER_SPAWN_INTERVAL = 2.85;
export const ARENA_NEXUS_RING_SNIPER_SPAWN_INTERVAL = 3.45;
/** After siege ends (green, defenders cleared), wait this long before opening the card reward modal. */
export const ARENA_NEXUS_REWARD_MODAL_DELAY_SEC = 1.35;
/** Procedural arena / roulette / surge hexes do not roll until this many seconds into the run (dev west test tile is separate, not from this roll). */
export const PROCEDURAL_SPECIAL_HEX_MIN_ELAPSED_SEC = 15;
/** Per new neighbor tile, spawn weight starts here after a used special (or run start), then decays toward END over `SPECIAL_SPAWN_DECAY_SEC`. */
export const SPECIAL_SPAWN_WEIGHT_START = 1 / 30;
/** Asymptotic / post–unused-despawn spawn weight for procedural specials. */
export const SPECIAL_SPAWN_WEIGHT_END = 1 / 10;
/** Seconds over which weight ramps from START to END (counting from `specialSpawnRateEpochStart`). */
export const SPECIAL_SPAWN_DECAY_SEC = 20;
/** No spawn rolls on new tiles for this many seconds after a special is used or after one despawns unused. */
export const SPECIAL_SPAWN_COOLDOWN_SEC = 15;
/** ~1in at 96 CSS px/in: inner rainbow forge disc radius (px). */
export const ROULETTE_INNER_HIT_R = 52;
export const ROULETTE_INNER_HEX_DRAW_R = 46;
/** Suit shuffle: swap / flicker between the two forged options. */
export const ROULETTE_SPIN_SHUFFLE_SEC = 2.15;
/** Soft veil before final reveal (gentler than solid white). */
export const ROULETTE_SPIN_WHITEOUT_SEC = 0.42;

/** Gauntlet / “surge” hex: white safe pocket + traveling danger pulse. */
export const SURGE_HEX_WAVES = 10;
/** First wave: seconds for the danger hex to reach the safe pocket. */
export const SURGE_TRAVEL_DUR_FIRST = 1.1;
/** Each subsequent wave is this many seconds shorter (arithmetic: wave `w` = first − step×(w−1)). */
export const SURGE_TRAVEL_DUR_DECREMENT_PER_WAVE = 0.05;
/** Pause after each hit before the next safe pocket spawns. */
export const SURGE_WAVE_PAUSE_SEC = 0.3;
export const SURGE_TILE_DAMAGE = 2;
/** Full-tile red flash duration after a pulse connects. */
export const SURGE_TILE_FLASH_SEC = 0.22;
/** Draw radius (px) for the white safety mini-hex. */
export const SURGE_SAFE_HEX_DRAW_R = 81;
/** Hit radius for standing in safety (slightly generous vs draw). */
export const SURGE_SAFE_HIT_R = 99;
/** Min center-to-center distance from the previous wave’s safe pocket (one draw-radius “bubble” diameter). */
export const SURGE_SAFE_MIN_CENTER_SEP_PX = SURGE_SAFE_HEX_DRAW_R * 2;

/** Standing in the safehouse inner “core” (opens level prompt). */
export const SAFEHOUSE_INNER_HIT_R = 46;

/** Interaction radius for embedded mini rainbow / forge sites (px). */
export const SAFEHOUSE_EMBED_SITE_HIT_R = 28;
/** How far mini centers sit from sanctuary center toward west / east (fraction of HEX_SIZE along neighbor chord). */
export const SAFEHOUSE_EMBED_CENTER_INSET = 0.4;
/** Pointy-hex vertex radius for embedded mini sites vs full `HEX_SIZE`. */
export const SAFEHOUSE_EMBED_HEX_VERTEX_R_MULT = 0.14;
