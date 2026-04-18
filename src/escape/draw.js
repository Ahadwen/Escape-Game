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

export function strokePointyHexOutline(ctx, cx, cy, vertexRadius, strokeStyle, lineWidth, glowBlur) {
  ctx.save();
  ctx.shadowColor = strokeStyle;
  ctx.shadowBlur = glowBlur;
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (Math.PI / 3) * i;
    const x = cx + Math.cos(a) * vertexRadius;
    const y = cy + Math.sin(a) * vertexRadius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.restore();
}

/** Rainbow fill for roulette hex; `elapsed` drives spin (game seconds). */
export function fillPointyHexRainbowGlow(ctx, cx, cy, vertexRadius, elapsed) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (Math.PI / 3) * i;
    const x = cx + Math.cos(a) * vertexRadius;
    const y = cy + Math.sin(a) * vertexRadius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const spin = elapsed * 2.8;
  if (typeof ctx.createConicGradient === "function") {
    const g = ctx.createConicGradient(spin, cx, cy);
    for (let k = 0; k <= 7; k++) g.addColorStop(k / 7, `hsl(${(k / 7) * 360} 92% 58%)`);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = `hsla(${(elapsed * 110) % 360}, 92%, 58%, 0.55)`;
  }
  ctx.globalAlpha = 0.52;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}
