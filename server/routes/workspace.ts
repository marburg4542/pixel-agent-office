import { Router, type NextFunction, type Request, type Response } from 'express';
import { verifyAuth } from '../middleware/auth';
import { msg } from '../lang';
import { getUserById, toPublicUser } from '../users';
import * as store from '../workspace/store';
import * as worker from '../worker/engine';
import { deleteKey, listKeys, setKey } from '../keys';
import type { Workspace } from '../../shared/types';

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
    const result: Workspace = { ...ws, runtime: worker.runtimeFor(visibleAgents), serverTime: Date.now() };
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

// API keys — only hints ever come back.
router.get('/keys', h((req) => listKeys(req.user!.id)));
router.put('/keys/:provider', h((req) => setKey(req.user!.id, String(req.params.provider), req.body)));
router.delete('/keys/:provider', h((req) => (deleteKey(req.user!.id, String(req.params.provider)), true)));

export default router;
