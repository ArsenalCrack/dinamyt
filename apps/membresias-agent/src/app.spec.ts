import { describe, it, expect } from 'vitest';
import { buildAgent } from './app';

describe('membresias-agent (mock reader)', () => {
  it('GET /status reporta el lector conectado', async () => {
    const app = buildAgent();
    const res = await app.inject({ method: 'GET', url: '/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ readerConnected: true, vendor: 'mock' });
    await app.close();
  });

  it('POST /enroll devuelve una plantilla con su formato', async () => {
    const app = buildAgent();
    const res = await app.inject({ method: 'POST', url: '/enroll' });
    expect(res.statusCode).toBe(200);
    expect(res.json().format).toBe('mock-v1');
    expect(res.json().template).toBeTruthy();
    await app.close();
  });

  it('POST /identify resuelve 1:N contra los candidatos', async () => {
    const app = buildAgent();
    const res = await app.inject({
      method: 'POST',
      url: '/identify',
      payload: { candidatos: [{ value: 'user-abc', template: 'X' }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ match: true, value: 'user-abc' });
    await app.close();
  });

  it('POST /identify sin match devuelve 404', async () => {
    const app = buildAgent();
    const res = await app.inject({ method: 'POST', url: '/identify', payload: { candidatos: [] } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
