// Server-Sent Events — adapted from WMS server/events.js. Unlike WMS (which only pings "refetch"),
// events here carry data and are addressed to specific users, because each user has their own office.
import { Router, type Response } from 'express';
import { checkToken } from './middleware/auth';

const clients = new Map<number, Set<Response>>();
const router = Router();

// EventSource can't set headers, so the token comes in the query string.
router.get('/events', (req, res) => {
  const result = checkToken(String(req.query.token || ''));
  if ('error' in result) {
    res.status(401).json({ success: false, code: result.error === 'replaced' ? 'SESSION_REPLACED' : 'UNAUTHORIZED' });
    return;
  }
  const userId = result.user.id;
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 5000\n\n');

  let set = clients.get(userId);
  if (!set) clients.set(userId, (set = new Set()));
  set.add(res);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    set.delete(res);
    if (!set.size) clients.delete(userId);
  });
});

const write = (res: Response, payload: string) => {
  try {
    res.write(payload);
  } catch {
    /* connection already gone; the close handler cleans up */
  }
};

export const sendTo = (userIds: Iterable<number>, event: string, data: unknown = {}): void => {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const id of new Set(userIds)) for (const res of clients.get(id) ?? []) write(res, payload);
};

export const sendAll = (event: string, data: unknown = {}): void => sendTo(clients.keys(), event, data);

/** Close a user's streams (after they sign in elsewhere or are suspended). */
export const disconnectUser = (userId: number, reason = 'session-replaced'): void => {
  for (const res of clients.get(userId) ?? []) {
    write(res, `event: ${reason}\ndata: {}\n\n`);
    res.end();
  }
  clients.delete(userId);
};

export default router;
