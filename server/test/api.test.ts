// End-to-end API tests against an in-memory database: accounts (ported WMS flows), workspaces,
// personal vs shared tasks, the worker, and encrypted API keys.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

process.env.DB_FILE = ':memory:';
process.env.JWT_SECRET = crypto.randomBytes(48).toString('base64');
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
process.env.BOOTSTRAP_ADMIN_USERNAME = 'admin';
process.env.BOOTSTRAP_ADMIN_EMAIL = 'admin@test.local';
process.env.BOOTSTRAP_ADMIN_PASSWORD = 'Adm1n-Secret!';
process.env.FRONTEND_URL = 'http://localhost:5173';

let server: Server;
let base = '';
let worker: typeof import('../worker/engine');
let keys: typeof import('../keys');
let db: typeof import('../db').default;

before(async () => {
  const users = await import('../users');
  const store = await import('../workspace/store');
  const { createApp } = await import('../app');
  worker = await import('../worker/engine');
  keys = await import('../keys');
  db = (await import('../db')).default;
  users.seedAdminIfNeeded();
  store.loadAll();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

after(() => server?.close());

async function call(path: string, { method = 'GET', body, token, lang = 'en' }: { method?: string; body?: unknown; token?: string; lang?: string } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Lang': lang,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, any>;
  return { status: res.status, json, data: json.data };
}

const login = async (username: string, password: string) => {
  const r = await call('/login', { method: 'POST', body: { username, password } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.json.token as string;
};

let adminToken = '';
let bobToken = '';

test('bootstrap admin signs in and gets a starter office', async () => {
  adminToken = await login('admin', 'Adm1n-Secret!');
  const ws = await call('/workspace', { token: adminToken });
  assert.equal(ws.status, 200);
  assert.equal(ws.data.agents.length, 5);
  assert.equal(ws.data.tasks.length, 4);
  assert.ok(ws.data.models.some((m: { id: string }) => m.id === 'claude-opus-5'));
  assert.equal(ws.data.runtime.length, 5);
});

test('wrong password and unknown users are rejected the same way', async () => {
  const a = await call('/login', { method: 'POST', body: { username: 'admin', password: 'nope' } });
  const b = await call('/login', { method: 'POST', body: { username: 'ghost', password: 'nope' } });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.json.message, b.json.message);
});

test('sign-up follows the password policy and waits for approval', async () => {
  const weak = await call('/register', { method: 'POST', body: { username: 'bob', email: 'bob@test.local', password: 'password123' } });
  assert.equal(weak.status, 400);
  const withName = await call('/register', { method: 'POST', body: { username: 'bobby', email: 'bob@test.local', password: 'bobby-2026x' } });
  assert.equal(withName.status, 400, 'password containing the username is refused');

  const ok = await call('/register', { method: 'POST', body: { username: 'bob', email: 'bob@test.local', password: 'Tr0mbone-Sky' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const taken = await call('/username-available?username=BOB');
  assert.equal(taken.json.available, false);

  const pending = await call('/login', { method: 'POST', body: { username: 'bob', password: 'Tr0mbone-Sky' } });
  assert.equal(pending.status, 403);
});

test('admin approves; the new member gets their own office', async () => {
  const list = await call('/users', { token: adminToken });
  const bob = list.json.users.find((u: { username: string }) => u.username === 'bob');
  assert.equal(bob.status, 'Pending');
  const forbidden = await call('/users', { token: 'x' });
  assert.notEqual(forbidden.status, 200);

  const approve = await call(`/users/${bob.id}/status`, { method: 'PUT', body: { status: 'Active' }, token: adminToken });
  assert.equal(approve.status, 200);
  assert.equal(approve.json.emailSent, false, 'email is not configured in tests');

  bobToken = await login('bob', 'Tr0mbone-Sky');
  const ws = await call('/workspace', { token: bobToken });
  assert.equal(ws.data.agents.length, 5);
  assert.ok(ws.data.agents.every((a: { ownerId: number }) => a.ownerId === bob.id));
  assert.equal(ws.data.teamAgents.length, 5, "admin's agents show up as team agents");
  assert.equal(ws.data.tasks.length, 4, "bob doesn't see admin's personal tasks");
});

test('a second sign-in replaces the first session', async () => {
  const first = bobToken;
  bobToken = await login('bob', 'Tr0mbone-Sky');
  const old = await call('/workspace', { token: first });
  assert.equal(old.status, 401);
  assert.equal(old.json.code, 'SESSION_REPLACED');
});

test('shared tasks: everyone sees them, each person adds only their own agents', async () => {
  const bobWs = (await call('/workspace', { token: bobToken })).data;
  const adminWs = (await call('/workspace', { token: adminToken })).data;
  const bobAgent = bobWs.agents[0].id;
  const adminAgent = adminWs.agents[1].id;

  const personalWithOther = await call('/tasks', { method: 'POST', token: bobToken, body: { title: 'x', pipeline: [adminAgent] } });
  assert.equal(personalWithOther.status, 400);
  const sharedWithOther = await call('/tasks', { method: 'POST', token: bobToken, body: { title: 'x', scope: 'shared', pipeline: [adminAgent] } });
  assert.equal(sharedWithOther.status, 403);

  const created = await call('/tasks', { method: 'POST', token: bobToken, body: { title: 'Team launch plan', scope: 'shared', pipeline: [bobAgent] } });
  assert.equal(created.status, 200);
  const id = created.data.id;

  const seen = (await call('/workspace', { token: adminToken })).data.tasks.find((t: { id: string }) => t.id === id);
  assert.ok(seen, 'admin sees the shared task');
  assert.equal(seen.ownerName, 'bob');

  const joined = await call(`/tasks/${id}`, { method: 'PUT', token: adminToken, body: { pipeline: [bobAgent, adminAgent] } });
  assert.equal(joined.status, 200, JSON.stringify(joined.json));
  const sneaky = await call(`/tasks/${id}`, { method: 'PUT', token: adminToken, body: { pipeline: [bobAgent, adminAgent, bobWs.agents[1].id] } });
  assert.equal(sneaky.status, 403, "can't add someone else's agent");
  const scopeFlip = await call(`/tasks/${id}`, { method: 'PUT', token: adminToken, body: { scope: 'personal' } });
  assert.equal(scopeFlip.status, 403, 'only the owner changes visibility');
});

test('notes: personal notes only reach your own agents', async () => {
  const adminWs = (await call('/workspace', { token: adminToken })).data;
  const bad = await call('/notes', { method: 'POST', token: bobToken, body: { text: 'hi', to: adminWs.agents[0].id } });
  assert.equal(bad.status, 400);
  const ok = await call('/notes', { method: 'POST', token: bobToken, body: { text: 'hello team', to: adminWs.agents[0].id, scope: 'shared' } });
  assert.equal(ok.status, 200);
});

test('the worker picks tasks up, hands them off and sends them to review', async () => {
  // Admin's seeded tasks: run the simulation fast-forward.
  await call('/settings', { method: 'PUT', token: adminToken, body: { simSpeed: 8 } });
  for (let i = 0; i < 400; i++) worker.tick(1);
  const tasks = (await call('/workspace', { token: adminToken })).data.tasks as { title: string; column: string; outputs: unknown[]; ownerName: string; scope: string }[];
  const mine = tasks.filter((t) => t.ownerName === 'admin' && t.scope === 'personal');
  const reviewed = mine.filter((t) => t.column === 'review');
  assert.ok(reviewed.length >= 3, `expected tasks in review, got ${mine.map((t) => `${t.title}:${t.column}`).join(', ')}`);
  for (const t of reviewed) assert.ok(t.outputs.length >= 2, 'every step left a result');
  assert.ok(mine.some((t) => t.column === 'backlog'), 'backlog is left alone');
});

test('approve and request changes', async () => {
  const tasks = (await call('/workspace', { token: adminToken })).data.tasks as { id: string; column: string; pipeline: string[] }[];
  const [a, b] = tasks.filter((t) => t.column === 'review');
  const approved = await call(`/tasks/${a.id}/approve`, { method: 'POST', token: adminToken });
  assert.equal(approved.data.column, 'done');
  const changed = await call(`/tasks/${b.id}/request-changes`, { method: 'POST', token: adminToken, body: { agentId: b.pipeline[0], text: 'More detail please' } });
  assert.equal(changed.data.column, 'todo');
  assert.equal(changed.data.stage, 0);
});

test('adding a step to a task waiting for review sends it back to work', async () => {
  const ws = (await call('/workspace', { token: adminToken })).data;
  const [a, b] = ws.agents;
  const created = await call('/tasks', { method: 'POST', token: adminToken, body: { title: 'One step', pipeline: [a.id], size: 'S' } });
  assert.equal(created.data.ownerName, 'admin', 'responses carry the owner name');
  for (let i = 0; i < 200 && (await call('/workspace', { token: adminToken })).data.tasks.find((t: { id: string }) => t.id === created.data.id).column !== 'review'; i++) {
    worker.tick(1);
  }
  const more = await call(`/tasks/${created.data.id}`, { method: 'PUT', token: adminToken, body: { pipeline: [a.id, b.id] } });
  assert.equal(more.data.column, 'doing');
  assert.equal(more.data.stage, 1);
});

test('export, reset and import an office', async () => {
  const backup = (await call('/workspace/export', { token: adminToken })).data;
  assert.equal(backup.app, 'pixel-agent-office');
  assert.equal(backup.agents.length, 5);
  const taskCount = backup.tasks.length;

  await call('/workspace/reset', { method: 'POST', token: adminToken });
  const fresh = (await call('/workspace', { token: adminToken })).data;
  assert.equal(fresh.agents.length, 5, 'starter team is back');
  assert.ok(!fresh.agents.some((a: { id: string }) => backup.agents.some((b: { id: string }) => b.id === a.id)), 'with new agents');

  const res = await call('/workspace/import', { method: 'POST', token: adminToken, body: backup });
  assert.equal(res.status, 200);
  assert.equal(res.data.agents, 3, 'only 3 desks were free');
  assert.equal(res.data.skippedAgents, 2);
  assert.equal(res.data.tasks, taskCount);
  const after = (await call('/workspace', { token: adminToken })).data;
  assert.equal(after.agents.length, 8);

  const bad = await call('/workspace/import', { method: 'POST', token: adminToken, body: { hello: 1 } });
  assert.equal(bad.status, 400);
});

test('API keys are stored encrypted and only a hint comes back', async () => {
  const saved = await call('/keys/openai', { method: 'PUT', token: bobToken, body: { key: 'sk-test-abcdefgh12345678' } });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.hint, 'sk-…5678');
  const list = await call('/keys', { token: bobToken });
  assert.ok(list.data.find((k: { provider: string; configured: boolean }) => k.provider === 'openai').configured);
  assert.ok(!JSON.stringify(list.json).includes('abcdefgh'), 'secret never returned');
  const raw = db.prepare("SELECT secret FROM api_keys WHERE provider = 'openai'").get() as { secret: string };
  assert.ok(!raw.secret.includes('abcdefgh'), 'secret is encrypted at rest');
  const bobId = (await call('/verify-token', { token: bobToken })).json.user.id;
  assert.equal(keys.getKey(bobId, 'openai')?.key, 'sk-test-abcdefgh12345678');
  const missing = await call('/keys/reddit', { method: 'PUT', token: bobToken, body: { clientId: 'abc' } });
  assert.equal(missing.status, 400, 'all fields required');
});

test('real AI steps stream into the task, record usage, and block on errors', async () => {
  const ai = await import('../ai');
  const { AiError } = await import('../ai/types');
  const original = { ...ai.ADAPTERS };
  let mode: 'ok' | 'auth' | 'rate' = 'ok';
  const prompts: string[] = [];
  const fake = {
    async run(_key: Record<string, string>, req: import('../ai/types').RunRequest) {
      prompts.push(`${req.system}\n${req.user}`);
      if (mode === 'auth') throw new AiError('auth', 'invalid x-api-key');
      if (mode === 'rate') throw new AiError('rate', 'slow down', 1);
      req.onText('# Real ');
      await new Promise((r) => setTimeout(r, 5));
      req.onText('answer');
      return { text: '# Real answer', tokensIn: 1000, tokensOut: 500, truncated: false };
    },
    async test() {},
  };
  for (const id of Object.keys(ai.ADAPTERS) as (keyof typeof ai.ADAPTERS)[]) ai.ADAPTERS[id] = fake;
  try {
    for (const [provider, body] of Object.entries({ anthropic: { key: 'sk-ant-x' }, openai: { key: 'sk-x' }, google: { key: 'AIza-x' }, openrouter: { key: 'sk-or-x' }, ollama: { baseUrl: 'http://localhost:11434' } })) {
      await call(`/keys/${provider}`, { method: 'PUT', token: adminToken, body });
    }
    const tested = await call('/keys/anthropic/test', { method: 'POST', token: adminToken });
    assert.equal(tested.data.ok, true);

    const ws = (await call('/workspace', { token: adminToken })).data;
    const agent = ws.agents[0];
    const waitFor = async (id: string, done: (t: any) => boolean) => {
      for (let i = 0; i < 300; i++) {
        const t = (await call('/workspace', { token: adminToken })).data.tasks.find((x: { id: string }) => x.id === id);
        if (done(t)) return t;
        worker.tick(1);
        await new Promise((r) => setTimeout(r, 2));
      }
      assert.fail('task never got there');
    };
    const created = await call('/tasks', { method: 'POST', token: adminToken, body: { title: 'Real one', pipeline: [agent.id], size: 'S', priority: 'high' } });
    const id = created.data.id;
    const t = await waitFor(id, (x) => x.column === 'review');
    assert.equal(t.outputs[0].simulated, false);
    assert.equal(t.outputs[0].tokensIn, 1000);
    assert.match(t.outputs[0].text, /Real answer/);
    assert.ok(prompts.some((p) => p.includes('Real one')), 'the task title is in the prompt');
    const usage = (await call('/usage', { token: adminToken })).data;
    assert.ok(usage.calls >= 1);

    // A rejected key parks the task until someone retries.
    mode = 'auth';
    const bad = await call('/tasks', { method: 'POST', token: adminToken, body: { title: 'Bad key', pipeline: [agent.id], size: 'S', priority: 'high' } });
    const blocked = await waitFor(bad.data.id, (x) => !!x.blocked);
    assert.equal(blocked.blocked.kind, 'auth');
    assert.equal(blocked.blocked.until, undefined);
    assert.equal(blocked.active, false);
    mode = 'ok';
    for (let i = 0; i < 30; i++) worker.tick(1);
    const still = (await call('/workspace', { token: adminToken })).data.tasks.find((x: { id: string }) => x.id === bad.data.id);
    assert.ok(still.blocked, 'stays blocked without a retry');
    const retried = await call(`/tasks/${bad.data.id}/retry`, { method: 'POST', token: adminToken });
    assert.equal(retried.data.blocked, undefined);
    await waitFor(bad.data.id, (x) => x.column === 'review');

    // Rate limits come with a time, and the task is picked up again after it.
    mode = 'rate';
    const slow = await call('/tasks', { method: 'POST', token: adminToken, body: { title: 'Slow', pipeline: [agent.id], size: 'S', priority: 'high' } });
    const limited = await waitFor(slow.data.id, (x) => !!x.blocked);
    assert.equal(limited.blocked.kind, 'rate');
    assert.ok(limited.blocked.until > Date.now() - 1000);
    mode = 'ok';
    await new Promise((r) => setTimeout(r, 1100));
    await waitFor(slow.data.id, (x) => x.column === 'review');

    // AI mode off: simulated even with keys.
    await call('/settings', { method: 'PUT', token: adminToken, body: { aiMode: 'sim' } });
    const sim = await call('/tasks', { method: 'POST', token: adminToken, body: { title: 'Sim', pipeline: [agent.id], size: 'S', priority: 'high' } });
    const simDone = await waitFor(sim.data.id, (x) => x.column === 'review');
    assert.equal(simDone.outputs[0].simulated, true);
  } finally {
    Object.assign(ai.ADAPTERS, original);
  }
});

test('changing email needs the current password', async () => {
  const noPw = await call('/update-profile', { method: 'PUT', token: bobToken, body: { email: 'bob2@test.local' } });
  assert.equal(noPw.status, 400);
  assert.equal(noPw.json.code, 'CURRENT_PASSWORD');
  const ok = await call('/update-profile', { method: 'PUT', token: bobToken, body: { email: 'bob2@test.local', currentPassword: 'Tr0mbone-Sky' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.user.email, 'bob2@test.local');
});

test('password reset link works once', async () => {
  const forgot = await call('/forgot-password', { method: 'POST', body: { email: 'nobody@test.local' } });
  assert.equal(forgot.status, 200, 'same answer for unknown emails');

  const bobId = (await call('/verify-token', { token: bobToken })).json.user.id;
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    crypto.createHash('sha256').update(token).digest('hex'),
    bobId,
    Date.now() + 60000,
    Date.now(),
  );
  const weak = await call('/reset-password', { method: 'POST', body: { token, newPassword: 'bob12345' } });
  assert.equal(weak.status, 400, 'contains the username');
  const ok = await call('/reset-password', { method: 'POST', body: { token, newPassword: 'N3w-Horizon-9' } });
  assert.equal(ok.status, 200);
  const again = await call('/reset-password', { method: 'POST', body: { token, newPassword: 'N3w-Horizon-10' } });
  assert.equal(again.status, 400, 'link is single-use');
  await login('bob', 'N3w-Horizon-9');
});

test('messages follow the requested language', async () => {
  const th = await call('/login', { method: 'POST', body: { username: 'admin', password: 'x' }, lang: 'th' });
  assert.match(th.json.message, /ไม่ถูกต้อง/);
});
