import { OperationError } from '../errors.js';

export interface DogImage {
  contentType: string;
  body: Buffer;
}

export interface DogImages {
  randomImage(breed: string): Promise<DogImage>;
}

interface DogCeoOptions {
  baseUrl: string;
  timeoutMs: number;
  fetch?: typeof fetch;
}

interface DogCeoResponse {
  status: 'success' | 'error';
  message: string;
}

export function createDogCeo({
  baseUrl,
  timeoutMs,
  fetch: doFetch = fetch,
}: DogCeoOptions): DogImages {
  async function call(url: string, what: string): Promise<Response> {
    try {
      return await doFetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new OperationError(504, 'upstream_timeout', `dog.ceo did not answer ${what} in time`);
      }
      const reason = err instanceof Error ? err.message : String(err);
      throw new OperationError(
        502,
        'upstream_failed',
        `Could not reach dog.ceo ${what}: ${reason}`,
      );
    }
  }

  return {
    async randomImage(breed) {
      const res = await call(
        `${baseUrl}/breed/${encodeURIComponent(breed)}/images/random`,
        'for an image URL',
      );
      if (res.status === 404) {
        throw new OperationError(404, 'unknown_breed', `dog.ceo has no breed "${breed}"`);
      }
      if (!res.ok) {
        throw new OperationError(502, 'upstream_failed', `dog.ceo answered ${res.status}`);
      }
      const payload = (await res.json()) as DogCeoResponse;
      if (payload.status !== 'success') {
        throw new OperationError(
          502,
          'upstream_failed',
          `dog.ceo returned an error: ${payload.message}`,
        );
      }

      const image = await call(payload.message, 'with the image');
      const contentType = image.headers.get('content-type') ?? '';
      if (!image.ok || !contentType.startsWith('image/')) {
        throw new OperationError(
          502,
          'upstream_failed',
          `Image download failed (${image.status} ${contentType || 'no content type'})`,
        );
      }
      return { contentType, body: Buffer.from(await image.arrayBuffer()) };
    },
  };
}
