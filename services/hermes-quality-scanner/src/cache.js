'use strict';

/**
 * Simple in-memory LRU cache with TTL support.
 * Max 200 entries. Evicts LRU entry when full.
 */

const MAX_SIZE = 200;

class LRUCache {
  constructor() {
    // Map preserves insertion order; we use it as an ordered LRU structure.
    // Most-recently-used entries are moved to the end on access.
    this._map = new Map();
  }

  /**
   * Store a value under key with an explicit TTL in milliseconds.
   * @param {string} key
   * @param {*} value
   * @param {number} ttlMs
   */
  set(key, value, ttlMs) {
    // Evict existing entry for this key first (so re-insertion goes to end)
    if (this._map.has(key)) {
      this._map.delete(key);
    }

    // Evict LRU (oldest / first) entry when at capacity
    if (this._map.size >= MAX_SIZE) {
      const oldestKey = this._map.keys().next().value;
      this._map.delete(oldestKey);
    }

    this._map.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Retrieve a value by key.
   * Returns null if the key does not exist or the entry has expired.
   * Promotes the entry to MRU position on a cache hit.
   * @param {string} key
   * @returns {*|null}
   */
  get(key) {
    const entry = this._map.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this._map.delete(key);
      return null;
    }

    // Promote to MRU position
    this._map.delete(key);
    this._map.set(key, entry);

    return entry.value;
  }

  /**
   * Number of entries currently stored (including potentially expired ones
   * that have not yet been reaped).
   * @returns {number}
   */
  size() {
    return this._map.size;
  }
}

module.exports = new LRUCache();
