import { describe, it, expect } from 'vitest';
import { createActualAccounts } from '../src/upstreams/actual-accounts.js';

function accountsWith(respond: () => Response | Promise<Response>, timeoutMs = 1000) {
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    expect(String(input)).toBe('http://actual-api:3000/api/accounts');
    const signal = init?.signal;
    return Promise.race([
      Promise.resolve(respond()),
      new Promise<never>((_, reject) =>
        signal?.addEventListener('abort', () => reject(signal.reason)),
      ),
    ]);
  }) as typeof fetch;
  return createActualAccounts({ baseUrl: 'http://actual-api:3000', timeoutMs, fetch });
}

describe('Actual account names', () => {
  it('lists every account name, closed ones included', async () => {
    const accounts = accountsWith(() =>
      Response.json({
        accounts: [
          { id: 'a', name: 'Checking', offbudget: false, closed: false, balance: 956 },
          { id: 'b', name: 'Old card', offbudget: false, closed: true, balance: 0 },
        ],
      }),
    );

    expect(await accounts.names()).toEqual(['Checking', 'Old card']);
  });

  it('fails with upstream_failed when Actual answers an error', async () => {
    const accounts = accountsWith(() => new Response('oops', { status: 500 }));

    await expect(accounts.names()).rejects.toMatchObject({
      statusCode: 502,
      code: 'upstream_failed',
    });
  });

  it('fails with upstream_timeout when Actual is too slow', async () => {
    const accounts = accountsWith(() => new Promise<Response>(() => {}), 50);

    await expect(accounts.names()).rejects.toMatchObject({
      statusCode: 504,
      code: 'upstream_timeout',
    });
  });
});
