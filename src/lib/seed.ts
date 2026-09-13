/* E-003 determinism: seed streams.
   song.seed is generated exactly once at Song creation, persisted, and never
   regenerated. Every stochastic synthesis source derives its own INDEPENDENT
   stream from the song seed via splitmix32, so two sources never share a
   sequence and call order cannot influence each other. */

import { mulberry32 } from "./model";

/** 32-bit avalanche mix (E-003 pattern: splitmix32(seed ^ stream_tag)). */
export function splitmix32(a: number): number {
  a = a | 0;
  a = (a + 0x9e3779b9) | 0;
  let t = a ^ (a >>> 16);
  t = Math.imul(t, 0x21f0aaad);
  t = t ^ (t >>> 15);
  t = Math.imul(t, 0x735a2d97);
  return (t ^ (t >>> 15)) >>> 0;
}

/** Independent PRNG stream for one synthesis source (E-003). */
export function seedStream(songSeed: number, tag: string): () => number {
  // FNV-1a over the stable tag name, so the derivation is tag-order-proof.
  let h = 0x811c9dc5;
  for (let i = 0; i < tag.length; i++) {
    h ^= tag.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return mulberry32(splitmix32((songSeed ^ h) >>> 0));
}

/** Canonical stream tags — compile-time constant, part of the render contract. */
export const STREAM_TAGS = {
  LIVE_NOISE: "luthier/noise/live",
  OFFLINE_NOISE: "luthier/noise/offline",
} as const;
