import type { ColumnId, UserSettings } from './types';

export const MAX_DESKS = 8;

export const COLUMNS: ColumnId[] = ['backlog', 'todo', 'doing', 'review', 'done'];

export const NOTE_COLORS = ['#ffe680', '#ffb3c7', '#b3e5ff', '#c3f0b0', '#e0c8ff'];

export const DEFAULT_SETTINGS: UserSettings = {
  lang: 'th',
  sound: true,
  volume: 0.6,
  simSpeed: 1,
  paused: false,
};

export const SIM_SPEEDS = [1, 2, 4, 8];

/** Simulated seconds for an agent's round trip to the wall board (walk, read, walk back). */
export const TRIP_SECONDS = 6;
/** Portion of a trip spent walking there / reading at the board (the rest is walking back). */
export const TRIP_ARRIVE = 0.4;
export const TRIP_LEAVE = 0.6;
