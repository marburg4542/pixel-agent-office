import type { RoleId } from '../types';

/** Common hand-off chains; each role is filled with one of your agents that has it. */
export const PIPELINE_TEMPLATES: { id: string; icon: string; roles: RoleId[] }[] = [
  { id: 'code', icon: '💻', roles: ['planner', 'coder', 'reviewer'] },
  { id: 'codeTested', icon: '🧪', roles: ['planner', 'coder', 'tester', 'reviewer'] },
  { id: 'content', icon: '✍️', roles: ['researcher', 'writer', 'reviewer'] },
  { id: 'design', icon: '🎨', roles: ['planner', 'designer', 'reviewer'] },
  { id: 'news', icon: '📈', roles: ['analyst', 'writer', 'reviewer'] },
];
