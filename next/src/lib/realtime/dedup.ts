export class RealtimeDeduper {
  private seen = new Map<string, number>();

  constructor(private readonly ttlMs = 10_000, private readonly maxEntries = 500) {}

  shouldSkip(key: string): boolean {
    const now = Date.now();
    const prev = this.seen.get(key);
    if (prev != null && now - prev < this.ttlMs) {
      return true;
    }
    this.seen.set(key, now);
    if (this.seen.size > this.maxEntries) {
      this.prune(now);
    }
    return false;
  }

  clear() {
    this.seen.clear();
  }

  private prune(now: number) {
    for (const [key, ts] of this.seen) {
      if (now - ts > this.ttlMs * 2) {
        this.seen.delete(key);
      }
    }
    if (this.seen.size <= this.maxEntries) return;
    const overflow = this.seen.size - this.maxEntries;
    let removed = 0;
    for (const key of this.seen.keys()) {
      this.seen.delete(key);
      removed += 1;
      if (removed >= overflow) break;
    }
  }
}
