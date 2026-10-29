import { FastifyInstance } from 'fastify';
import {
  addSharedExpense,
  type AddSharedExpenseResult,
  InvalidShareLinkError,
  parseTricountKey,
  previewSharedExpense,
  RateLimitError,
} from 'tricount-actual-sync';
import { ErrorBody, OperationError } from '../errors.js';
import { SharedExpensePreviews } from '../shared-expense-previews.js';
import { SharedExpenseUpstreams } from '../upstreams/shared-expenses.js';

interface BudgetOptions {
  sharedExpenses: SharedExpenseUpstreams;
  homeCurrency: string;
  previews: SharedExpensePreviews;
}

const PreviewBody = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    title: { type: 'string' },
    currency: { type: 'string' },
    homeCurrency: { type: 'string' },
    currencySupported: { type: 'boolean' },
    suggestedAccountName: { type: 'string' },
    existingAccountNames: { type: 'array', items: { type: 'string' } },
    retryAfterSeconds: { type: 'integer' },
    members: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          active: { type: 'boolean' },
          selectable: { type: 'boolean' },
          reason: { type: 'string' },
        },
        required: ['id', 'name', 'active', 'selectable'],
      },
    },
  },
} as const;

const Step = {
  status: { type: 'string', enum: ['done', 'failed', 'skipped'] },
  error: { type: 'string' },
} as const;

const AddResult = {
  added: { type: 'boolean' },
  steps: {
    type: 'object',
    properties: {
      check: { type: 'object', properties: Step },
      createAccount: {
        type: 'object',
        properties: { ...Step, accountId: { type: 'string' }, accountName: { type: 'string' } },
      },
      saveConfig: {
        type: 'object',
        properties: {
          ...Step,
          tricount: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              accountId: { type: 'string' },
              displayName: { type: 'string' },
              myMemberName: { type: 'string' },
              homeCurrency: { type: 'string' },
            },
          },
          orphanedAccount: {
            type: 'object',
            properties: { id: { type: 'string' }, name: { type: 'string' } },
          },
        },
      },
      firstSync: {
        type: 'object',
        properties: {
          ...Step,
          summary: {
            type: 'object',
            properties: {
              added: { type: 'integer' },
              updated: { type: 'integer' },
              failed: { type: 'integer' },
            },
          },
        },
      },
    },
  },
} as const;

// A refusal before anything was created is a plain ErrorBody; a failed step
// also carries every step's outcome.
const AddFailedBody = {
  ...ErrorBody,
  properties: { ...ErrorBody.properties, ...AddResult },
} as const;

interface AddBody {
  key: string;
  myMemberName: string;
  accountName: string;
}

export async function budgetRoutes(
  fastify: FastifyInstance,
  { sharedExpenses, homeCurrency, previews }: BudgetOptions,
) {
  fastify.get<{ Querystring: { link: string } }>(
    '/budget/shared-expenses/preview',
    {
      schema: {
        tags: ['budget'],
        summary: 'Preview a tricount before adding it',
        description:
          'One Tricount call. Answers 429 rate_limited (with Retry-After) instead of waiting for the Tricount rate limit.',
        querystring: {
          type: 'object',
          properties: {
            link: { type: 'string', description: 'Share link (https://tricount.com/<key>) or key' },
          },
          required: ['link'],
        },
        response: { 200: PreviewBody, '4xx': ErrorBody, '5xx': ErrorBody },
      },
    },
    async (req, reply) => {
      const key = tricountKey(req.query.link);
      const retryAfterSeconds = await sharedExpenses.rateLimit.retryAfterSeconds();
      if (retryAfterSeconds > 0) {
        throw rateLimited(reply, retryAfterSeconds);
      }
      // Before Tricount: an Actual outage shouldn't cost a rate-limited call.
      const existingAccountNames = await sharedExpenses.accounts.names();
      const preview = await fromTricount(() => previewSharedExpense(sharedExpenses, key));
      previews.remember(preview);
      return {
        ...preview,
        homeCurrency,
        currencySupported: preview.currency === homeCurrency,
        suggestedAccountName: `Tricount: ${preview.title}`,
        existingAccountNames,
      };
    },
  );

  // Keys being added right now: a second add of the same key would pass
  // every check before the first one saved it.
  const adding = new Set<string>();

  fastify.post<{ Body: AddBody }>(
    '/budget/shared-expenses',
    {
      schema: {
        tags: ['budget'],
        summary: 'Add a tricount: create its Actual account, save it, sync it',
        description:
          'Needs a preview of the same key from the last 15 minutes. Can take as long as the Tricount rate limit (30 s by default): the first sync waits for its slot.',
        body: {
          type: 'object',
          properties: {
            key: { type: 'string', minLength: 1, description: 'The key from the preview' },
            myMemberName: { type: 'string', minLength: 1 },
            accountName: { type: 'string', pattern: '\\S', description: 'Trimmed by Actual' },
          },
          required: ['key', 'myMemberName', 'accountName'],
        },
        response: {
          201: { type: 'object', properties: AddResult },
          '4xx': AddFailedBody,
          '5xx': AddFailedBody,
        },
      },
    },
    async (req, reply) => {
      const key = tricountKey(req.body.key);
      const { myMemberName } = req.body;
      const accountName = req.body.accountName.trim();
      if (adding.has(key)) {
        throw new OperationError(409, 'add_in_progress', `Tricount ${key} is already being added`);
      }
      adding.add(key);
      try {
        const preview = previews.recent(key);
        if (!preview) {
          throw new OperationError(
            409,
            'preview_required',
            `No recent preview of tricount ${key}: preview it again, then add it`,
          );
        }
        const configured = (await sharedExpenses.configStore.load())?.find((t) => t.key === key);
        if (configured) {
          throw new OperationError(
            409,
            'already_configured',
            `Tricount ${key} is already added, as "${configured.displayName}"`,
          );
        }
        if (preview.currency !== homeCurrency) {
          throw new OperationError(
            422,
            'unsupported_currency',
            `Tricount ${key} is in ${preview.currency}, but only ${homeCurrency} tricounts can be synced`,
          );
        }
        const member = preview.members.find((m) => m.name === myMemberName);
        if (!member) {
          throw new OperationError(
            400,
            'unknown_member',
            `Tricount ${key} has no member named "${myMemberName}"`,
          );
        }
        if (!member.selectable) {
          throw new OperationError(
            400,
            'member_not_selectable',
            member.reason ?? 'Pick another name',
          );
        }
        const existing = await sharedExpenses.accounts.names();
        if (existing.some((name) => name.trim() === accountName)) {
          throw new OperationError(
            409,
            'account_name_taken',
            `Actual already has an account named "${accountName}"`,
          );
        }

        const result = await addSharedExpense(
          {
            configStore: sharedExpenses.configStore,
            tricountClient: sharedExpenses.tricountClient,
            actualClient: sharedExpenses.actualClient,
            logger: { error: (m) => req.log.error(m), warn: (m) => req.log.warn(m) },
          },
          // The title comes from the preview, never from the Client.
          { key, title: preview.title, myMemberName, accountName, homeCurrency },
        );
        if (result.added) {
          previews.forget(key);
          return reply.status(201).send(result);
        }
        const [status, error] = firstFailure(result);
        return reply.status(status).send({ error: 'add_failed', message: error, ...result });
      } finally {
        adding.delete(key);
      }
    },
  );
}

// Not added: some step before the first sync failed, and the ones after it
// were skipped.
function firstFailure({ steps }: AddSharedExpenseResult): [number, string] {
  if (steps.check.status === 'failed') return [409, steps.check.error];
  if (steps.createAccount.status === 'failed') return [502, steps.createAccount.error];
  if (steps.saveConfig.status === 'failed') return [500, steps.saveConfig.error];
  return [500, 'The tricount was not added'];
}

function tricountKey(linkOrKey: string): string {
  try {
    return parseTricountKey(linkOrKey);
  } catch (err) {
    if (err instanceof InvalidShareLinkError) {
      throw new OperationError(400, 'invalid_link', err.message);
    }
    throw err;
  }
}

function rateLimited(reply: { header(name: string, value: number): unknown }, seconds: number) {
  reply.header('retry-after', seconds);
  return new OperationError(
    429,
    'rate_limited',
    `Tricount is rate-limited: try again in ${seconds}s`,
  );
}

async function fromTricount<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (err instanceof RateLimitError) {
      throw new OperationError(429, 'rate_limited', `Tricount: ${reason}`);
    }
    throw new OperationError(502, 'upstream_failed', `Tricount: ${reason}`);
  }
}
