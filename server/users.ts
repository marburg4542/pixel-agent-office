// User records — ported from WMS server/data/userManager.js (roles simplified to Admin / Member).
import bcrypt from 'bcryptjs';
import db from './db';
import { config } from './config';
import type { PublicUser, UserRole, UserStatus } from '../shared/types';

export interface UserRow extends PublicUser {
  password: string;
}

const VALID_ROLES: UserRole[] = ['Admin', 'Member'];
const VALID_STATUSES: UserStatus[] = ['Pending', 'Active', 'Denied'];
const USER_COLUMNS = 'id, username, email, password, role, status, avatarUrl';

const normalizeRole = (role: unknown): UserRole => (VALID_ROLES.includes(role as UserRole) ? (role as UserRole) : 'Member');
const normalizeStatus = (status: unknown): UserStatus =>
  VALID_STATUSES.includes(status as UserStatus) ? (status as UserStatus) : 'Pending';

const insertUserStmt = db.prepare(`
  INSERT INTO app_users (id, username, email, password, role, status, avatarUrl)
  VALUES (@id, @username, @email, @password, @role, @status, @avatarUrl)
`);

/** First start: create the admin from server/.env so someone can approve sign-ups. */
export const seedAdminIfNeeded = (): void => {
  const count = (db.prepare('SELECT COUNT(*) AS count FROM app_users').get() as { count: number }).count;
  if (count > 0 || !config.bootstrapAdmin.password) return;
  insertUserStmt.run({
    id: 1,
    username: config.bootstrapAdmin.username,
    email: config.bootstrapAdmin.email.trim().toLowerCase(),
    password: bcrypt.hashSync(config.bootstrapAdmin.password, 10),
    role: 'Admin',
    status: 'Active',
    avatarUrl: '',
  });
  console.log(`👑 Created bootstrap admin "${config.bootstrapAdmin.username}".`);
};

export const toPublicUser = (u: UserRow): PublicUser => ({
  id: u.id,
  username: u.username,
  email: u.email,
  role: u.role,
  status: u.status,
  avatarUrl: u.avatarUrl || '',
});

export const getUsers = (): UserRow[] =>
  db.prepare(`SELECT ${USER_COLUMNS} FROM app_users ORDER BY username COLLATE NOCASE ASC`).all() as UserRow[];

export const getUserById = (id: number): UserRow | undefined =>
  db.prepare(`SELECT ${USER_COLUMNS} FROM app_users WHERE id = ?`).get(Number(id)) as UserRow | undefined;

export const getUserByUsername = (username: string): UserRow | undefined =>
  db.prepare(`SELECT ${USER_COLUMNS} FROM app_users WHERE LOWER(username) = LOWER(?)`).get(String(username || '').trim()) as
    | UserRow
    | undefined;

export const getUserByEmail = (email: string): UserRow | undefined =>
  db.prepare(`SELECT ${USER_COLUMNS} FROM app_users WHERE LOWER(email) = LOWER(?)`).get(String(email || '').trim()) as
    | UserRow
    | undefined;

export const countActiveAdmins = (): number =>
  (db.prepare(`SELECT COUNT(*) AS count FROM app_users WHERE role = 'Admin' AND status = 'Active'`).get() as { count: number }).count;

// Latest session id — one account = one device (a new login cuts the old session).
export const setSessionId = (id: number, sessionId: string) =>
  db.prepare('UPDATE app_users SET session_id = ? WHERE id = ?').run(sessionId, Number(id));

export const getSessionId = (id: number): string | null =>
  (db.prepare('SELECT session_id FROM app_users WHERE id = ?').get(Number(id)) as { session_id: string | null } | undefined)?.session_id ??
  null;

export const createUser = (u: { username: string; email: string; password: string; role?: UserRole; status?: UserStatus }): UserRow => {
  const row: UserRow = {
    id: Date.now(),
    username: String(u.username || '').trim(),
    email: String(u.email || '').trim().toLowerCase(),
    password: u.password,
    role: normalizeRole(u.role),
    status: normalizeStatus(u.status),
    avatarUrl: '',
  };
  insertUserStmt.run(row);
  return row;
};

const UPDATABLE_FIELDS: Record<string, (v: unknown) => unknown> = {
  username: (v) => String(v).trim(),
  email: (v) => String(v).trim().toLowerCase(),
  password: (v) => v,
  role: (v) => normalizeRole(v),
  status: (v) => normalizeStatus(v),
  avatarUrl: (v) => (v == null ? '' : String(v)),
};

export const updateUser = (id: number, fields: Partial<Record<keyof typeof UPDATABLE_FIELDS, unknown>>): UserRow | undefined => {
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { id: Number(id) };
  for (const [key, transform] of Object.entries(UPDATABLE_FIELDS)) {
    if (fields[key] !== undefined) {
      setClauses.push(`${key} = @${key}`);
      params[key] = transform(fields[key]);
    }
  }
  if (setClauses.length) {
    setClauses.push('updated_at = CURRENT_TIMESTAMP');
    db.prepare(`UPDATE app_users SET ${setClauses.join(', ')} WHERE id = @id`).run(params);
  }
  return getUserById(id);
};

export const deleteUserRecord = (id: number): boolean => db.prepare('DELETE FROM app_users WHERE id = ?').run(Number(id)).changes > 0;
