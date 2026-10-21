/**
 * Compteur d'ÉCHECS par clé (ex. e-mail normalisé) sur fenêtre glissante simple : `limit` échecs par `windowMs`.
 * Contrairement à un limiteur de requêtes, seules les tentatives réellement échouées comptent : des connexions
 * valides simultanées (bcrypt lent) ne peuvent pas déclencher le blocage. En mémoire (mono-instance).
 */
export class FailureLimiter {
  constructor({ limit, windowMs, now = () => Date.now(), maxKeys = 10_000 }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.maxKeys = maxKeys;
    this.entries = new Map(); // key → { count, resetAt }
  }

  #live(key) {
    const e = this.entries.get(key);
    if (e && e.resetAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return e;
  }

  isBlocked(key) {
    return (this.#live(key)?.count ?? 0) >= this.limit;
  }

  fail(key) {
    const e = this.#live(key);
    if (e) {
      e.count += 1;
      return;
    }
    if (this.entries.size >= this.maxKeys) this.#prune();
    this.entries.set(key, { count: 1, resetAt: this.now() + this.windowMs });
  }

  reset(key) {
    this.entries.delete(key);
  }

  #prune() {
    const t = this.now();
    for (const [k, e] of this.entries) if (e.resetAt <= t) this.entries.delete(k);
    // Toujours plein (attaque par clés multiples) : on libère les plus anciennes entrées.
    for (const k of this.entries.keys()) {
      if (this.entries.size < this.maxKeys) break;
      this.entries.delete(k);
    }
  }
}
