import { Router, type NextFunction, type Request, type Response } from 'express';
import { verifyAuth } from '../middleware/auth';
import { msg } from '../lang';
import { getUserById, toPublicUser } from '../users';
import * as store from '../workspace/store';
import * as worker from '../worker/engine';
import * as newsroom from '../workspace/newsroom';
import { CONNECTORS } from '../research/connectors';
import * as arena from '../arena';
import { statsFor } from '../stats';
import { deleteKey, getKey, listKeys, setKey } from '../keys';
import { testAiKey } from '../ai';
import { usageSummary } from '../usage';
import { sendTo } from '../events';
import { keyProvider } from '../../shared/keys';
import type { ProviderId, Workspace } from '../../shared/types';

const router = Router();
router.use(verifyAuth);

/** Wrap a handler so ApiErrors become JSON replies in the caller's language. */
const h =
  (fn: (req: Request, res: Response) => unknown) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const out = fn(req, res);
      if (out !== undefined && !res.headersSent) res.json({ success: true, data: out });
    } catch (e) {
      if (e instanceof store.ApiError) res.status(e.status).json({ success: false, message: msg(req, e.th, e.en) });
      else next(e);
    }
  };

router.get(
  '/workspace',
  h((req) => {
    const user = getUserById(req.user!.id)!;
    store.ensureSeeded(user.id);
    const ws = store.workspaceFor(toPublicUser(user));
    const visibleAgents = [...ws.agents, ...ws.teamAgents.map((a) => store.getAgent(a.id)!).filter(Boolean)];
    const result: Workspace = {
      ...ws,
      runtime: worker.runtimeFor(visibleAgents),
      keys: listKeys(user.id),
      usage: usageSummary(user.id),
      live: worker.liveTextFor(new Set(ws.tasks.map((t) => t.id))),
      ...newsroom.watchlistsFor(user.id),
      serverTime: Date.now(),
    };
    return result;
  }),
);

// Backup / restore / start over
router.get('/workspace/export', h((req) => store.exportOffice(req.user!.id)));
router.post('/workspace/import', h((req) => store.importOffice(req.user!, req.body)));
router.post('/workspace/reset', h((req) => (store.resetOffice(req.user!), true)));

// Agents
router.post('/agents', h((req) => store.createAgent(req.user!, req.body ?? {})));
router.put('/agents/:id', h((req) => store.updateAgent(req.user!, String(req.params.id), req.body ?? {})));
router.delete('/agents/:id', h((req) => (store.deleteAgent(req.user!, String(req.params.id)), true)));

// Tasks
router.post('/tasks', h((req) => store.createTask(req.user!, req.body ?? {})));
router.put('/tasks/:id', h((req) => store.updateTask(req.user!, String(req.params.id), req.body ?? {})));
router.delete('/tasks/:id', h((req) => (store.deleteTask(req.user!, String(req.params.id)), true)));
router.post('/tasks/:id/move', h((req) => store.moveTask(req.user!, String(req.params.id), req.body?.column)));
router.post('/tasks/:id/restart', h((req) => store.restartTask(req.user!, String(req.params.id))));
router.post('/tasks/:id/approve', h((req) => store.approveTask(req.user!, String(req.params.id))));
router.post(
  '/tasks/:id/retry',
  h((req) => {
    worker.resetRetries(String(req.params.id));
    return store.retryTask(req.user!, String(req.params.id));
  }),
);
router.post('/tasks/:id/answer', h((req) => store.answerQuestion(req.user!, String(req.params.id), req.body?.text)));
router.post('/tasks/:id/arena', h((req) => arena.startArena(req.user!, String(req.params.id), req.body ?? {})));
router.post('/tasks/:id/arena/pick', h((req) => arena.pickWinner(req.user!, String(req.params.id), req.body ?? {})));
router.delete('/tasks/:id/arena', h((req) => arena.closeArena(req.user!, String(req.params.id))));
router.post('/tasks/:id/request-changes', h((req) => store.requestChanges(req.user!, String(req.params.id), String(req.body?.agentId), req.body?.text)));

// Notes
router.post('/notes', h((req) => store.createNote(req.user!, req.body ?? {})));
router.put('/notes/:id', h((req) => store.updateNote(req.user!, String(req.params.id), req.body ?? {})));
router.delete('/notes/:id', h((req) => (store.deleteNote(req.user!, String(req.params.id)), true)));

// Model library
router.post('/models', h((req) => store.createModel(req.user!.id, req.body ?? {})));
router.put('/models/:id', h((req) => store.updateModel(req.user!.id, String(req.params.id), req.body ?? {})));
router.delete('/models/:id', h((req) => store.deleteModel(req.user!.id, String(req.params.id))));
router.post('/models/reset', h((req) => store.resetModels(req.user!.id)));

// Settings
router.put('/settings', h((req) => store.updateSettings(req.user!.id, req.body ?? {})));

// Newsroom
router.post('/watchlists', h((req) => newsroom.createWatchlist(req.user!, req.body ?? {})));
router.put('/watchlists/:id', h((req) => newsroom.updateWatchlist(req.user!, String(req.params.id), req.body ?? {})));
router.delete('/watchlists/:id', h((req) => (newsroom.deleteWatchlist(req.user!, String(req.params.id)), true)));
router.post('/watchlists/:id/run', h((req) => newsroom.runNow(req.user!, String(req.params.id))));
router.get('/watchlists/:id/reports', h((req) => newsroom.reportsOf(req.user!, String(req.params.id))));
router.get('/reports/:id', h((req) => newsroom.getReport(req.user!, String(req.params.id))));

// Stats page
router.get('/stats', h((req) => statsFor(req.user!.id)));

// Spending on real AI calls this month
router.get('/usage', h((req) => usageSummary(req.user!.id)));

// API keys — only hints ever come back. Other tabs of the same person refresh their list.
const keysChanged = (userId: number) => sendTo([userId], 'keys-changed', listKeys(userId));
router.get('/keys', h((req) => listKeys(req.user!.id)));
router.put(
  '/keys/:provider',
  h((req) => {
    const out = setKey(req.user!.id, String(req.params.provider), req.body);
    keysChanged(req.user!.id);
    return out;
  }),
);
router.delete(
  '/keys/:provider',
  h((req) => {
    deleteKey(req.user!.id, String(req.params.provider));
    keysChanged(req.user!.id);
    return true;
  }),
);

/** Try the saved key with a cheap call. */
router.post('/keys/:provider/test', async (req, res, next) => {
  try {
    const provider = String(req.params.provider);
    const def = keyProvider(provider);
    const dataTest = def?.group === 'data' ? CONNECTORS[def.id as keyof typeof CONNECTORS]?.test : undefined;
    if (!def || (def.group === 'data' && !dataTest)) {
      res.status(400).json({ success: false, message: msg(req, 'ยังทดสอบคีย์ประเภทนี้ไม่ได้', "This kind of key can't be tested yet") });
      return;
    }
    const key = getKey(req.user!.id, def.id);
    if (!key) {
      res.status(404).json({ success: false, message: msg(req, 'ยังไม่ได้ใส่คีย์นี้', 'No key saved for this provider') });
      return;
    }
    let error: string | null;
    if (dataTest) {
      error = await dataTest(key).then(
        () => null,
        (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200),
      );
    } else error = await testAiKey(def.id as ProviderId, key);
    res.json({ success: true, data: { ok: !error, error } });
  } catch (e) {
    next(e);
  }
});

export default router;
