import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server.js';

describe('UI', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('serves the page at /ui/', async () => {
    const res = await server.inject({ method: 'GET', url: '/ui/' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Add a tricount');
  });

  it('redirects /ui to /ui/', async () => {
    const res = await server.inject({ method: 'GET', url: '/ui' });

    expect(res.statusCode).toBe(301);
    expect(res.headers.location).toBe('/ui/');
  });

  it('serves its script', async () => {
    const res = await server.inject({ method: 'GET', url: '/ui/app.js' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('javascript');
  });

  it('answers 404 not_found for a missing file', async () => {
    const res = await server.inject({ method: 'GET', url: '/ui/nope.js' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'not_found' });
  });
});
