import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  FakeActualClient,
  FakeTricountClient,
  FakeTricountConfigStore,
  memberIds,
  type Member,
  type RegistryEntry,
  type TricountConfig,
} from 'tricount-actual-sync';
import { OperationError } from '../src/errors.js';
import { buildServer } from '../src/server.js';
import { SharedExpenseUpstreams } from '../src/upstreams/shared-expenses.js';

const KEY = 'tRiP123';
const LINK = `https://tricount.com/${KEY}`;

const dinner: RegistryEntry = {
  id: 1,
  ownerMemberId: memberIds.Bob,
  amountCents: 3000,
  currency: 'EUR',
  description: 'Dinner',
  date: '2026-07-01',
  allocations: [
    { memberId: memberIds.Bob, amountCents: 1500 },
    { memberId: memberIds.Alice, amountCents: 1500 },
  ],
  typeTransaction: 'NORMAL',
};

const members: Member[] = [
  { id: memberIds.Bob, name: 'Bob', status: 'ACTIVE' },
  { id: memberIds.Alice, name: 'Alice', status: 'ACTIVE' },
  { id: memberIds.Carl, name: 'Carl', status: 'INACTIVE' },
  { id: 201, name: 'Dana', status: 'ACTIVE' },
  { id: 202, name: 'Dana', status: 'ACTIVE' },
];

interface Setup {
  currency?: string;
  accountNames?: string[];
  retryAfterSeconds?: number;
  tricounts?: TricountConfig[];
}

function fakeUpstreams({
  currency = 'EUR',
  accountNames = ['Checking'],
  retryAfterSeconds = 0,
  tricounts,
}: Setup = {}) {
  const tricountClient = new FakeTricountClient({ [KEY]: [dinner] }, members, {
    [KEY]: { title: 'Trip to Rome', currency },
  });
  const actualClient = new FakeActualClient();
  const configStore = new FakeTricountConfigStore(tricounts);
  const rateLimit = { retryAfterSeconds: vi.fn(async () => retryAfterSeconds) };
  const accounts = { names: vi.fn(async () => accountNames) };
  const sharedExpenses: SharedExpenseUpstreams = {
    tricountClient,
    rateLimit,
    actualClient,
    configStore,
    accounts,
  };
  return { sharedExpenses, tricountClient, actualClient, configStore, rateLimit, accounts };
}

describe('GET /budget/shared-expenses/preview', () => {
  let server: Awaited<ReturnType<typeof buildServer>> | undefined;

  afterEach(async () => {
    await server?.close();
  });

  async function serverWith(setup: Setup = {}) {
    const fakes = fakeUpstreams(setup);
    server = await buildServer({ sharedExpenses: fakes.sharedExpenses });
    return { app: server, ...fakes };
  }

  function preview(link: string) {
    return server!.inject({
      method: 'GET',
      url: `/budget/shared-expenses/preview?link=${encodeURIComponent(link)}`,
    });
  }

  it('previews the tricount with what the add form needs', async () => {
    await serverWith({ accountNames: ['Checking', 'Tricount: Trip to Rome'] });
    const res = await preview(` ${LINK}/?utm=share `);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      key: KEY,
      title: 'Trip to Rome',
      currency: 'EUR',
      homeCurrency: 'EUR',
      currencySupported: true,
      suggestedAccountName: 'Tricount: Trip to Rome',
      existingAccountNames: ['Checking', 'Tricount: Trip to Rome'],
      retryAfterSeconds: 0,
      members: [
        { id: memberIds.Alice, name: 'Alice', active: true, selectable: true },
        { id: memberIds.Bob, name: 'Bob', active: true, selectable: true },
        { id: memberIds.Carl, name: 'Carl', active: false, selectable: true },
        {
          id: 201,
          name: 'Dana',
          active: true,
          selectable: false,
          reason: 'Several members are named "Dana" — rename one in Tricount first',
        },
        {
          id: 202,
          name: 'Dana',
          active: true,
          selectable: false,
          reason: 'Several members are named "Dana" — rename one in Tricount first',
        },
      ],
    });
  });

  it('flags a tricount in another currency than HOME_CURRENCY', async () => {
    await serverWith({ currency: 'USD' });
    const res = await preview(KEY);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      currency: 'USD',
      homeCurrency: 'EUR',
      currencySupported: false,
    });
  });

  it('answers 400 invalid_link without calling Tricount', async () => {
    const { tricountClient } = await serverWith();
    const res = await preview('https://example.com/abc');

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_link' });
    expect(tricountClient.registryFetchCount()).toBe(0);
  });

  it('answers 400 invalid_request without a link', async () => {
    await serverWith();
    const res = await server!.inject({ method: 'GET', url: '/budget/shared-expenses/preview' });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('answers 429 rate_limited with Retry-After instead of waiting for Tricount', async () => {
    const { tricountClient } = await serverWith({ retryAfterSeconds: 75 });
    const res = await preview(KEY);

    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('75');
    expect(res.json()).toMatchObject({ error: 'rate_limited' });
    expect(tricountClient.registryFetchCount()).toBe(0);
  });

  it('answers 502 upstream_failed when Tricount fails, naming it', async () => {
    const { tricountClient } = await serverWith();
    vi.spyOn(tricountClient, 'fetchRegistry').mockRejectedValue(new Error('registry call 500'));
    const res = await preview(KEY);

    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({
      error: 'upstream_failed',
      message: 'Tricount: registry call 500',
    });
  });

  it('answers 502 upstream_failed when Actual is down, before calling Tricount', async () => {
    const { tricountClient, accounts } = await serverWith();
    accounts.names.mockRejectedValue(
      new OperationError(502, 'upstream_failed', 'Could not reach Actual'),
    );
    const res = await preview(KEY);

    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ error: 'upstream_failed' });
    expect(tricountClient.registryFetchCount()).toBe(0);
  });
});

describe('POST /budget/shared-expenses', () => {
  let server: Awaited<ReturnType<typeof buildServer>> | undefined;

  afterEach(async () => {
    vi.useRealTimers();
    await server?.close();
  });

  async function previewedServer(setup: Setup = {}) {
    const fakes = fakeUpstreams(setup);
    server = await buildServer({ sharedExpenses: fakes.sharedExpenses });
    const res = await server.inject({
      method: 'GET',
      url: `/budget/shared-expenses/preview?link=${encodeURIComponent(LINK)}`,
    });
    expect(res.statusCode).toBe(200);
    return fakes;
  }

  function add(body: Record<string, unknown>) {
    return server!.inject({
      method: 'POST',
      url: '/budget/shared-expenses',
      payload: { key: KEY, myMemberName: 'Alice', accountName: 'Tricount: Trip to Rome', ...body },
    });
  }

  it('creates the account, saves the tricount with the previewed title, and syncs it', async () => {
    const { actualClient, configStore, tricountClient } = await previewedServer();
    const res = await add({ accountName: '  Tricount: Trip to Rome ' });

    expect(res.statusCode).toBe(201);
    const tricount = {
      key: KEY,
      accountId: 'fake-account-1',
      displayName: 'Trip to Rome',
      myMemberName: 'Alice',
      homeCurrency: 'EUR',
    };
    expect(res.json()).toEqual({
      added: true,
      steps: {
        check: { status: 'done' },
        createAccount: {
          status: 'done',
          accountId: 'fake-account-1',
          accountName: 'Tricount: Trip to Rome',
        },
        saveConfig: { status: 'done', tricount },
        firstSync: { status: 'done', summary: { added: 1, updated: 0, failed: 0 } },
      },
    });
    expect(actualClient.allAccounts()).toEqual([
      { id: 'fake-account-1', name: 'Tricount: Trip to Rome', offBudget: false },
    ]);
    expect(await configStore.load()).toEqual([tricount]);
    expect(tricountClient.registryFetchCount()).toBe(2);
  });

  it('reports a failed first sync as added, with the step that failed', async () => {
    const { tricountClient } = await previewedServer();
    vi.spyOn(tricountClient, 'fetchRegistry').mockRejectedValue(new Error('registry call 500'));
    const res = await add({});

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      added: true,
      steps: { firstSync: { status: 'failed', error: 'registry call 500' } },
    });
  });

  it('answers 500 add_failed naming the orphaned account when saving fails', async () => {
    const { configStore } = await previewedServer();
    vi.spyOn(configStore, 'save').mockRejectedValue(new Error('disk full'));
    const res = await add({});

    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({
      error: 'add_failed',
      added: false,
      steps: {
        check: { status: 'done' },
        createAccount: { status: 'done', accountId: 'fake-account-1' },
        saveConfig: {
          status: 'failed',
          orphanedAccount: { id: 'fake-account-1', name: 'Tricount: Trip to Rome' },
        },
        firstSync: { status: 'skipped' },
      },
    });
    expect(res.json().message).toContain('disk full');
  });

  it('answers 502 add_failed when Actual refuses the account', async () => {
    const { actualClient } = await previewedServer();
    vi.spyOn(actualClient, 'createAccount').mockRejectedValue(new Error('Validation failed'));
    const res = await add({});

    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({
      error: 'add_failed',
      message: 'Validation failed',
      added: false,
      steps: { createAccount: { status: 'failed', error: 'Validation failed' } },
    });
  });

  it('answers 409 add_failed when the library refuses at its own check', async () => {
    const { actualClient } = await previewedServer();
    vi.spyOn(actualClient, 'findByImportedIdPrefix').mockResolvedValue([
      {
        accountId: 'old-account',
        importedId: `tricount-${KEY}-1`,
        payee: 'Tricount: Trip to Rome',
        amountCents: -1500,
        notes: 'Dinner',
        date: '2026-07-01',
      },
    ]);
    const res = await add({});

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      error: 'add_failed',
      steps: { check: { status: 'failed' }, createAccount: { status: 'skipped' } },
    });
    expect(actualClient.allAccounts()).toEqual([]);
  });

  it('accepts the share link as the key', async () => {
    await previewedServer();
    const res = await add({ key: LINK });

    expect(res.statusCode).toBe(201);
  });

  describe('refuses before creating anything', () => {
    async function expectRefused(
      res: Awaited<ReturnType<typeof add>>,
      status: number,
      error: string,
      actualClient: FakeActualClient,
    ) {
      expect(res.statusCode).toBe(status);
      expect(res.json()).toMatchObject({ error });
      expect(actualClient.allAccounts()).toEqual([]);
    }

    it('answers 409 preview_required without a preview of that key', async () => {
      const { actualClient } = await previewedServer();
      const res = await add({ key: 'otherKey' });

      await expectRefused(res, 409, 'preview_required', actualClient);
    });

    it('answers 409 preview_required once the preview is 15 minutes old', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const { actualClient } = await previewedServer();
      vi.setSystemTime(Date.now() + 15 * 60 * 1000);
      const res = await add({});

      await expectRefused(res, 409, 'preview_required', actualClient);
    });

    it('answers 409 already_configured for a key already in the tricount list', async () => {
      const { actualClient } = await previewedServer({
        tricounts: [
          {
            key: KEY,
            accountId: 'acct-1',
            displayName: 'Trip to Rome',
            myMemberName: 'Alice',
            homeCurrency: 'EUR',
          },
        ],
      });
      const res = await add({});

      await expectRefused(res, 409, 'already_configured', actualClient);
    });

    it('answers 422 unsupported_currency for a tricount in another currency', async () => {
      const { actualClient } = await previewedServer({ currency: 'USD' });
      const res = await add({});

      await expectRefused(res, 422, 'unsupported_currency', actualClient);
    });

    it('answers 400 unknown_member for a name not in the previewed tricount', async () => {
      const { actualClient } = await previewedServer();
      const res = await add({ myMemberName: 'Zoe' });

      await expectRefused(res, 400, 'unknown_member', actualClient);
    });

    it('answers 400 member_not_selectable for a name several members share', async () => {
      const { actualClient } = await previewedServer();
      const res = await add({ myMemberName: 'Dana' });

      await expectRefused(res, 400, 'member_not_selectable', actualClient);
    });

    it('answers 409 account_name_taken, comparing trimmed names', async () => {
      const { actualClient, accounts } = await previewedServer();
      accounts.names.mockResolvedValue(['Checking', ' Tricount: Trip to Rome  ']);
      const res = await add({ accountName: 'Tricount: Trip to Rome ' });

      await expectRefused(res, 409, 'account_name_taken', actualClient);
    });

    it('answers 400 invalid_request for a blank account name', async () => {
      const { actualClient } = await previewedServer();
      const res = await add({ accountName: '   ' });

      await expectRefused(res, 400, 'invalid_request', actualClient);
    });

    it('answers 409 add_in_progress while the same key is being added', async () => {
      const { actualClient } = await previewedServer();
      const createAccount = actualClient.createAccount.bind(actualClient);
      let release!: () => void;
      const creating = vi
        .spyOn(actualClient, 'createAccount')
        .mockImplementationOnce(async (account) => {
          await new Promise<void>((resolve) => (release = resolve));
          return createAccount(account);
        });
      const first = add({});
      await vi.waitFor(() => expect(creating).toHaveBeenCalled());
      const second = await add({ accountName: 'Another name' });
      release();

      expect(second.statusCode).toBe(409);
      expect(second.json()).toMatchObject({ error: 'add_in_progress' });
      expect((await first).statusCode).toBe(201);
      expect(actualClient.allAccounts()).toHaveLength(1);
    });
  });
});
