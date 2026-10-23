import { describe, it, expect, afterEach } from 'vitest';
import { buildServer } from '../src/server.js';
import { createDogCeo } from '../src/upstreams/dog-ceo.js';

const IMAGE_URL = 'https://images.dog.ceo/breeds/pug/n02110958_1975.jpg';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

type Route = (url: string) => Response | Promise<Response>;

function fakeFetch(route: Route): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const signal = init?.signal;
    return Promise.race([
      Promise.resolve(route(url)),
      new Promise<never>((_, reject) =>
        signal?.addEventListener('abort', () => reject(signal.reason)),
      ),
    ]);
  }) as typeof fetch;
}

const dogCeoOk: Route = (url) => {
  if (url === 'https://dog.ceo/api/breed/pug/images/random') {
    return Response.json({ status: 'success', message: IMAGE_URL });
  }
  if (url === IMAGE_URL) {
    return new Response(JPEG, { headers: { 'content-type': 'image/jpeg' } });
  }
  return Response.json(
    { status: 'error', message: 'Breed not found (main breed does not exist)', code: 404 },
    { status: 404 },
  );
};

describe('GET /dogs/:breed/random', () => {
  let server: Awaited<ReturnType<typeof buildServer>> | undefined;

  afterEach(async () => {
    await server?.close();
  });

  async function serverWith(route: Route, timeoutMs = 1000) {
    server = await buildServer({
      dogImages: createDogCeo({
        baseUrl: 'https://dog.ceo/api',
        timeoutMs,
        fetch: fakeFetch(route),
      }),
    });
    return server;
  }

  it('returns the image bytes directly', async () => {
    const app = await serverWith(dogCeoOk);
    const res = await app.inject({ method: 'GET', url: '/dogs/pug/random' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.rawPayload.equals(JPEG)).toBe(true);
  });

  it('accepts the breed in any case', async () => {
    const app = await serverWith(dogCeoOk);
    const res = await app.inject({ method: 'GET', url: '/dogs/Pug/random' });

    expect(res.statusCode).toBe(200);
  });

  it('answers 404 unknown_breed when dog.ceo has no such breed', async () => {
    const app = await serverWith(dogCeoOk);
    const res = await app.inject({ method: 'GET', url: '/dogs/unicorn/random' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'unknown_breed' });
  });

  it('answers 400 invalid_request for a malformed breed', async () => {
    const app = await serverWith(dogCeoOk);
    const res = await app.inject({ method: 'GET', url: '/dogs/pug%2F..%2Fx/random' });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('answers 502 upstream_failed when dog.ceo is down', async () => {
    const app = await serverWith(() => new Response('oops', { status: 503 }));
    const res = await app.inject({ method: 'GET', url: '/dogs/pug/random' });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ error: 'upstream_failed' });
  });

  it('answers 502 upstream_failed when dog.ceo is unreachable', async () => {
    const app = await serverWith(() => {
      throw new TypeError('fetch failed');
    });
    const res = await app.inject({ method: 'GET', url: '/dogs/pug/random' });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ error: 'upstream_failed' });
  });

  it('answers 502 upstream_failed when the image download fails', async () => {
    const app = await serverWith((url) =>
      url === IMAGE_URL ? new Response('gone', { status: 404 }) : dogCeoOk(url),
    );
    const res = await app.inject({ method: 'GET', url: '/dogs/pug/random' });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ error: 'upstream_failed' });
  });

  it('answers 504 upstream_timeout when dog.ceo is too slow', async () => {
    const app = await serverWith(() => new Promise<Response>(() => {}), 50);
    const res = await app.inject({ method: 'GET', url: '/dogs/pug/random' });

    expect(res.statusCode).toBe(504);
    expect(res.json()).toMatchObject({ error: 'upstream_timeout' });
  });
});

describe('unknown routes', () => {
  it('answer 404 not_found in the shared error shape', async () => {
    const server = await buildServer();
    const res = await server.inject({ method: 'POST', url: '/api/v1/http/call' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'not_found' });
    await server.close();
  });
});
