/**
 * lib/shuffle.ts
 * --------------
 * Deterministic seeded shuffle. Each rater's image order is derived from
 * their rater ID, so:
 *   - the order is reproducible (resume mid-test gives the same sequence)
 *   - different raters get different orders (reduces order effects)
 *   - the same 100 images are shown to everyone (preserves inter-rater
 *     agreement statistics)
 */

/** Mulberry32 PRNG — small, fast, deterministic. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string to a 32-bit integer seed (FNV-1a). */
function hashStringToSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Return a permutation of [0, 1, ..., n-1] seeded by `seedStr`.
 * Fisher-Yates with a deterministic PRNG.
 */
export function seededPermutation(n: number, seedStr: string): number[] {
  const rng = mulberry32(hashStringToSeed(seedStr));
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
