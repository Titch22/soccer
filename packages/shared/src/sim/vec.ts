import type { Vector2 } from "./types";

export const vec = (x: number, y: number): Vector2 => ({ x, y });

export const add = (a: Vector2, b: Vector2): Vector2 => vec(a.x + b.x, a.y + b.y);

export const sub = (a: Vector2, b: Vector2): Vector2 => vec(a.x - b.x, a.y - b.y);

export const scale = (a: Vector2, s: number): Vector2 => vec(a.x * s, a.y * s);

export const length = (a: Vector2): number => Math.hypot(a.x, a.y);

export const normalize = (a: Vector2): Vector2 => {
  const len = length(a);
  return len > 1e-6 ? scale(a, 1 / len) : vec(0, 0);
};

export const dot = (a: Vector2, b: Vector2): number => a.x * b.x + a.y * b.y;

export const distance = (a: Vector2, b: Vector2): number => length(sub(a, b));

export const clampLength = (a: Vector2, maxLen: number): Vector2 => {
  const len = length(a);
  return len > maxLen ? scale(a, maxLen / len) : a;
};

export const moveToward = (current: Vector2, target: Vector2, maxDelta: number): Vector2 => {
  const delta = sub(target, current);
  const len = length(delta);
  if (len <= maxDelta || len < 1e-6) return target;
  return add(current, scale(delta, maxDelta / len));
};
