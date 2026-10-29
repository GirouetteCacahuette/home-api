import { OperationError } from '../errors.js';

export interface AccountNames {
  /** Every account's name, closed ones included. */
  names(): Promise<string[]>;
}

interface ActualAccountsOptions {
  baseUrl: string;
  timeoutMs: number;
  fetch?: typeof fetch;
}

interface AccountsResponse {
  accounts: Array<{ name: string }>;
}

export function createActualAccounts({
  baseUrl,
  timeoutMs,
  fetch: doFetch = fetch,
}: ActualAccountsOptions): AccountNames {
  return {
    async names() {
      let res: Response;
      try {
        res = await doFetch(`${baseUrl}/api/accounts`, { signal: AbortSignal.timeout(timeoutMs) });
      } catch (err) {
        if (err instanceof Error && err.name === 'TimeoutError') {
          throw new OperationError(504, 'upstream_timeout', 'Actual did not list accounts in time');
        }
        const reason = err instanceof Error ? err.message : String(err);
        throw new OperationError(502, 'upstream_failed', `Could not reach Actual: ${reason}`);
      }
      if (!res.ok) {
        throw new OperationError(502, 'upstream_failed', `Actual answered ${res.status}`);
      }
      const payload = (await res.json()) as AccountsResponse;
      return payload.accounts.map((account) => account.name);
    },
  };
}
