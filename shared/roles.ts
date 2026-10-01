import type { ModelDef, RoleId } from './types';

export interface RoleDef {
  id: RoleId;
  icon: string;
  color: string;
  /** How much this role cares about quality vs speed vs price when suggesting a model. */
  weights: { quality: number; speed: number; cost: number };
}

export const ROLES: RoleDef[] = [
  { id: 'planner', icon: '🧭', color: '#9a6bd8', weights: { quality: 0.7, speed: 0.2, cost: 0.1 } },
  { id: 'researcher', icon: '🔎', color: '#3fa7c4', weights: { quality: 0.5, speed: 0.3, cost: 0.2 } },
  { id: 'analyst', icon: '📈', color: '#d0584a', weights: { quality: 0.6, speed: 0.2, cost: 0.2 } },
  { id: 'coder', icon: '💻', color: '#4f7cf0', weights: { quality: 0.6, speed: 0.3, cost: 0.1 } },
  { id: 'writer', icon: '✍️', color: '#e08a3c', weights: { quality: 0.5, speed: 0.3, cost: 0.2 } },
  { id: 'designer', icon: '🎨', color: '#e05a8a', weights: { quality: 0.5, speed: 0.3, cost: 0.2 } },
  { id: 'reviewer', icon: '🔍', color: '#4fbf7a', weights: { quality: 0.7, speed: 0.2, cost: 0.1 } },
  { id: 'tester', icon: '🧪', color: '#c9a227', weights: { quality: 0.3, speed: 0.5, cost: 0.2 } },
  { id: 'manager', icon: '👔', color: '#2f7f8f', weights: { quality: 0.5, speed: 0.3, cost: 0.2 } },
  { id: 'custom', icon: '⭐', color: '#8a8aa0', weights: { quality: 0.5, speed: 0.3, cost: 0.2 } },
];

export const roleById = (id: RoleId): RoleDef => ROLES.find((r) => r.id === id) ?? ROLES[ROLES.length - 1];

/** 1–5 where 5 = cheapest. Unknown price counts as mid. */
export function costScore(m: ModelDef): number {
  if (m.priceOut === undefined) return 3;
  if (m.priceOut <= 1) return 5;
  if (m.priceOut <= 5) return 4;
  if (m.priceOut <= 12) return 3;
  if (m.priceOut <= 30) return 2;
  return 1;
}

export function fitScore(m: ModelDef, role: RoleId): number {
  const w = roleById(role).weights;
  return m.quality * w.quality + m.speed * w.speed + costScore(m) * w.cost;
}

/** Top-2 model ids for a role — shown with a "recommended" badge. */
export function recommendedModels(models: ModelDef[], role: RoleId): string[] {
  return [...models]
    .sort((a, b) => fitScore(b, role) - fitScore(a, role))
    .slice(0, 2)
    .map((m) => m.id);
}
