// Client-only types; everything shared with the server lives in shared/types.ts.
export * from '../shared/types';
import type { Note, Task } from '../shared/types';

export type Modal =
  | { kind: 'board' }
  | { kind: 'task'; taskId: string }
  | { kind: 'taskEdit'; taskId?: string; preset?: Partial<Task> }
  | { kind: 'noteEdit'; noteId?: string; preset?: Partial<Note> }
  | { kind: 'agentEdit'; agentId?: string; desk?: number }
  | { kind: 'agent'; agentId: string }
  | { kind: 'models' }
  | { kind: 'settings'; tab?: SettingsTab }
  | { kind: 'users' }
  | { kind: 'help'; step?: number }
  | { kind: 'confirm'; message: string; onYes: () => void; danger?: boolean };

export type SettingsTab = 'profile' | 'sound' | 'ai' | 'keys' | 'data';
