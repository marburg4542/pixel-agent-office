import type { Task } from '../types';

export { COLUMNS } from '../../shared/constants';

/** 0–100 across the whole pipeline. */
export function overallProgress(t: Task): number {
  if (!t.pipeline.length) return 0;
  if (t.stage >= t.pipeline.length) return 100;
  return ((t.stage + t.stageProgress / 100) / t.pipeline.length) * 100;
}
