import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from './fal.mjs';

test('run() submits, polls until COMPLETED, returns the result and logs the call', async () => {
  const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fal-')), 'log.jsonl');
  const calls = [];
  let polls = 0;
  const fetchStub = async (url, opts = {}) => {
    calls.push([opts.method || 'GET', url]);
    if (opts.method === 'POST') return Response.json({ request_id: 'r1', status_url: 'https://q/s', response_url: 'https://q/r' });
    if (url === 'https://q/s') return Response.json({ status: ++polls < 2 ? 'IN_PROGRESS' : 'COMPLETED' });
    if (url === 'https://q/r') return Response.json({ images: [{ url: 'https://cdn/x.png' }] });
    throw new Error('unexpected ' + url);
  };
  const out = await run('fal-ai/x', { prompt: 'p' }, 'unit', { fetch: fetchStub, logFile: log, pollMs: 1, key: 'k' });
  assert.equal(out.images[0].url, 'https://cdn/x.png');
  assert.deepEqual(calls[0], ['POST', 'https://queue.fal.run/fal-ai/x']);
  const line = JSON.parse(fs.readFileSync(log, 'utf8').trim());
  assert.equal(line.label, 'unit');
  assert.equal(line.endpoint, 'fal-ai/x');
  assert.equal(line.request_id, 'r1');
  assert.deepEqual(line.urls, ['https://cdn/x.png']);
});

test('run() throws on FAILED status', async () => {
  const fetchStub = async (url, opts = {}) => opts.method === 'POST'
    ? Response.json({ request_id: 'r2', status_url: 'https://q/s', response_url: 'https://q/r' })
    : Response.json({ status: 'FAILED', error: 'boom' });
  await assert.rejects(run('fal-ai/x', {}, 'unit', { fetch: fetchStub, logFile: '/dev/null', pollMs: 1, key: 'k' }), /FAILED/);
});
