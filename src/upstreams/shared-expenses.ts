import {
  buildRealDeps,
  type ActualClient,
  type RateLimitStatus,
  type TricountClient,
  type TricountConfigStore,
} from 'tricount-actual-sync';
import { AccountNames, createActualAccounts } from './actual-accounts.js';

// The tricount-actual-sync library's clients, plus the account listing it
// doesn't have.
export interface SharedExpenseUpstreams {
  tricountClient: TricountClient;
  rateLimit: RateLimitStatus;
  actualClient: ActualClient;
  configStore: TricountConfigStore;
  accounts: AccountNames;
}

interface SharedExpenseOptions {
  actualApiUrl: string;
  sessionDir: string;
  configDir: string;
  minIntervalSeconds: number;
  timeoutMs: number;
}

// Build once per process: the Tricount client keeps its token in memory and
// queues this process's callers for the rate-limit slot.
export function createSharedExpenseUpstreams({
  actualApiUrl,
  sessionDir,
  configDir,
  minIntervalSeconds,
  timeoutMs,
}: SharedExpenseOptions): SharedExpenseUpstreams {
  const { tricountClient, actualClient, configStore } = buildRealDeps({
    actualApiUrl,
    sessionDir,
    configDir,
    minIntervalSeconds,
    // A request waits for the slot instead of failing; the preview checks
    // the slot itself first, so only adding waits.
    whenRateLimited: 'wait',
  });
  return {
    tricountClient,
    rateLimit: tricountClient,
    actualClient,
    configStore,
    accounts: createActualAccounts({ baseUrl: actualApiUrl, timeoutMs }),
  };
}
