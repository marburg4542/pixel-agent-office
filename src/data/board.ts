import type { ColumnId, Task } from '../types';

export const COLUMNS: ColumnId[] = ['backlog', 'todo', 'doing', 'review', 'done'];

/** 0–100 across the whole pipeline. */
export function overallProgress(t: Task): number {
  if (!t.pipeline.length) return 0;
  if (t.stage >= t.pipeline.length) return 100;
  return ((t.stage + t.stageProgress / 100) / t.pipeline.length) * 100;
}
