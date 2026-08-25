import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

// app.ts import 만으로 서버 리슨/워커 시작 부작용이 없어야 한다 (index.ts에만 존재).
describe('app smoke', () => {
  it('GET /health → 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api → 200 API info', async () => {
    const res = await request(app).get('/api');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('TagHere CRM API');
  });

  it('존재하지 않는 경로 → 404 Not Found', async () => {
    const res = await request(app).get('/no-such-path');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found' });
  });
});
