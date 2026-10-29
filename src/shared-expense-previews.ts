import { SharedExpensePreview } from 'tricount-actual-sync';

// Adding a tricount trusts only what its preview fetched (title, members,
// currency): the add itself does not re-fetch the registry. So the last
// preview per key is kept here for a while, and an add without one is
// refused.
export class SharedExpensePreviews {
  private previews = new Map<string, { preview: SharedExpensePreview; expiresAt: number }>();

  constructor(private readonly ttlMs: number) {}

  remember(preview: SharedExpensePreview) {
    this.forgetExpired();
    this.previews.set(preview.key, { preview, expiresAt: Date.now() + this.ttlMs });
  }

  recent(key: string): SharedExpensePreview | undefined {
    this.forgetExpired();
    return this.previews.get(key)?.preview;
  }

  forget(key: string) {
    this.previews.delete(key);
  }

  private forgetExpired() {
    const now = Date.now();
    for (const [key, { expiresAt }] of this.previews) {
      if (expiresAt <= now) this.previews.delete(key);
    }
  }
}
