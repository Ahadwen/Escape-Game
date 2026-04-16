import { TAU, HEAL_PICKUP_PLUS_HALF, HEAL_PICKUP_ARM_THICK } from "./constants.js";

export function drawCircle(ctx, x, y, r, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function drawHealPickup(ctx, p, elapsed) {
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

export function drawObstacles(ctx, obstacles) {
  ctx.fillStyle = "#334155";
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 2;
  for (const o of obstacles) {
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.strokeRect(o.x, o.y, o.w, o.h);
  }
}
