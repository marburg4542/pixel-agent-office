// Pipelines with parallel groups. A task's pipeline is a list of agent ids; `groups` (same length,
// optional) gives each step a group number — neighbours with the same number work at the same time,
// and the task moves on once every step of the group is done. `stage` is the first step of the
// group in play.
import type { Task } from './types';

type G = Pick<Task, 'pipeline' | 'groups'>;
type Live = G & Pick<Task, 'stage' | 'groupDone' | 'groupActive' | 'active'>;

const gid = (t: G, i: number) => t.groups?.[i] ?? -1 - i;

/** [start, end) of the group that contains step `i`. */
export function groupRange(t: G, i: number): [number, number] {
  let a = i;
  let b = i + 1;
  while (a > 0 && gid(t, a - 1) === gid(t, i)) a--;
  while (b < t.pipeline.length && gid(t, b) === gid(t, i)) b++;
  return [a, b];
}

/** Step indices of the group in play (empty once the pipeline is finished). */
export function currentSteps(t: G & Pick<Task, 'stage'>): number[] {
  if (t.stage >= t.pipeline.length) return [];
  const [a, b] = groupRange(t, t.stage);
  return Array.from({ length: b - a }, (_, k) => a + k);
}

/** Groups as lists of step indices, in order. */
export function groupsOf(t: G): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < t.pipeline.length; ) {
    const [a, b] = groupRange(t, i);
    out.push(Array.from({ length: b - a }, (_, k) => a + k));
    i = b;
  }
  return out;
}

export const isStepDone = (t: Live, i: number) => i < t.stage || !!t.groupDone?.includes(i);

/** Is step `i` being worked on right now? (Single steps use the task's `active` flag.) */
export const isStepActive = (t: Live, i: number) =>
  currentSteps(t).length > 1 ? !!t.groupActive?.includes(i) : i === t.stage && t.active;

/** The step of the group in play that this agent could start now, or -1. */
export function openStepFor(t: Live, agentId: string): number {
  return currentSteps(t).find((i) => t.pipeline[i] === agentId && !isStepDone(t, i) && !isStepActive(t, i)) ?? -1;
}

/** Clean up group numbers from the client: one per step, renumbered 0, 1, 2… in order. */
export function normalizeGroups(length: number, input: unknown): number[] | undefined {
  if (!Array.isArray(input) || !length) return undefined;
  const raw = Array.from({ length }, (_, i) => (Number.isInteger(input[i]) ? (input[i] as number) : -1 - i));
  const out: number[] = [];
  let g = -1;
  raw.forEach((v, i) => {
    if (i === 0 || v !== raw[i - 1]) g++;
    out.push(g);
  });
  // No parallel group at all → plain pipeline.
  return out.every((v, i) => v === i) ? undefined : out;
}
