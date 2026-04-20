import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server.js';

describe('Health endpoints', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('GET /health returns 200 with status ok', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('GET /ready returns 200 with status ok', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/ready',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.checks).toBeDefined();
  });
});
