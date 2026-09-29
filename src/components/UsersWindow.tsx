// Admin: approve sign-ups, change roles, suspend/restore, delete — ported from WMS UserManagement.
import { useCallback, useEffect, useState } from 'react';
import { useStore, useT } from '../store';
import { api } from '../lib/api';
import { onServerEvent } from '../lib/events';
import { toast } from '../lib/toast';
import type { PublicUser, UserRole, UserStatus } from '../types';
import { UserAvatar, Window } from './ui';

const STATUS_COLOR: Record<UserStatus, string> = { Active: '#3fae6a', Pending: '#f0a030', Denied: '#d8453e' };

export function UsersWindow({ z, onClose }: { z: number; onClose: () => void }) {
  const t = useT();
  const me = useStore((s) => s.user!);
  const openModal = useStore((s) => s.openModal);
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const [filter, setFilter] = useState<'ALL' | UserStatus>('ALL');

  const load = useCallback(() => {
    api<{ users: PublicUser[] }>('/users').then((d) => setUsers(d.users), () => setUsers([]));
  }, []);
  // Load now + refresh live when someone signs up or a status changes.
  useEffect(() => {
    load();
    return onServerEvent('users', load);
  }, [load]);

  const setStatus = (u: PublicUser, status: UserStatus) =>
    openModal({
      kind: 'confirm',
      danger: status === 'Denied',
      message: t('users_confirmStatus', { user: u.username, status: t(`ustatus_${status}`) }),
      onYes: async () => {
        try {
          const res = await api<{ message: string; emailSent: boolean | null }>(`/users/${u.id}/status`, { method: 'PUT', body: { status } });
          // Tell the admin when the email didn't go out, so they can let the person know themselves.
          if (res.emailSent === false) toast.warn(`${res.message} — ${t('users_tellThem')}`);
          else toast.success(res.message);
          load();
        } catch {
          /* shown */
        }
      },
    });

  const setRole = async (u: PublicUser, role: UserRole) => {
    try {
      await api(`/users/${u.id}/role`, { method: 'PUT', body: { role } });
      load();
    } catch {
      /* shown */
    }
  };

  const remove = (u: PublicUser) =>
    openModal({
      kind: 'confirm',
      danger: true,
      message: t('users_confirmDelete', { user: u.username }),
      onYes: async () => {
        try {
          await api(`/users/${u.id}`, { method: 'DELETE' });
          toast.success(t('users_deleted'));
          load();
        } catch {
          /* shown */
        }
      },
    });

  const visible = (users ?? []).filter((u) => filter === 'ALL' || u.status === filter);
  const pending = (users ?? []).filter((u) => u.status === 'Pending').length;

  return (
    <Window z={z} width={860} title={`👑 ${t('users_admin')}`} onClose={onClose}>
      <div className="row" style={{ marginBottom: 12 }}>
        <p className="hint" style={{ margin: 0 }}>{t('users_hint')}</p>
        <select className="select" style={{ width: 'auto', marginLeft: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value as 'ALL' | UserStatus)}>
          <option value="ALL">{t('users_all')}</option>
          <option value="Pending">{t('ustatus_Pending')} ({pending})</option>
          <option value="Active">{t('ustatus_Active')}</option>
          <option value="Denied">{t('ustatus_Denied')}</option>
        </select>
      </div>
      {users === null ? (
        <p className="hint">…</p>
      ) : (
        <table className="mlib-table users-table">
          <thead>
            <tr>
              <th>{t('auth_username')}</th>
              <th>{t('auth_email')}</th>
              <th>{t('users_role')}</th>
              <th>{t('users_status')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="hint">{t('users_none')}</td>
              </tr>
            )}
            {visible.map((u) => {
              const self = u.id === me.id;
              return (
                <tr key={u.id}>
                  <td>
                    <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                      <UserAvatar user={u} size={26} /> <strong>{u.username}</strong> {self && <span className="chip">{t('users_you')}</span>}
                    </span>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <select className="select" style={{ width: 'auto' }} value={u.role} disabled={self} onChange={(e) => void setRole(u, e.target.value as UserRole)}>
                      <option value="Admin">{t('role_admin')}</option>
                      <option value="Member">{t('role_member')}</option>
                    </select>
                  </td>
                  <td>
                    <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <span className="status-dot" style={{ background: STATUS_COLOR[u.status] }} /> {t(`ustatus_${u.status}`)}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {u.status === 'Pending' && (
                      <>
                        <button className="btn sm success" onClick={() => setStatus(u, 'Active')}>✔ {t('users_approve')}</button>{' '}
                        <button className="btn sm warn" onClick={() => setStatus(u, 'Denied')}>✕ {t('users_reject')}</button>
                      </>
                    )}
                    {u.status === 'Denied' && <button className="btn sm success" onClick={() => setStatus(u, 'Active')}>♻ {t('users_restore')}</button>}
                    {u.status === 'Active' && !self && <button className="btn sm warn" onClick={() => setStatus(u, 'Denied')}>⏸ {t('users_suspend')}</button>}{' '}
                    {!self && <button className="btn sm danger" onClick={() => remove(u)}>🗑</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Window>
  );
}
