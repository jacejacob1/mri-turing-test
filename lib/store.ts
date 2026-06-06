/**
 * lib/store.ts
 * ------------
 * Storage layer for the Visual Turing Test.
 *
 * Uses Vercel KV (Upstash Redis) in production. If KV environment variables
 * are not present (e.g., local `next dev` before provisioning KV), it
 * transparently falls back to an in-process Map so the app still runs for
 * development. The fallback is NOT persistent across serverless invocations,
 * so production MUST have KV provisioned — the /api/health route warns if not.
 *
 * Data model (keys):
 *   manifest                      -> JSON: the canonical 100-image list with
 *                                    true_class. NEVER sent to the client.
 *   rater:<raterId>               -> JSON: rater intake record + progress
 *   responses:<raterId>           -> JSON array: that rater's submitted rows
 *   raters:index                  -> JSON array of all raterIds (for export)
 */

import { kv as vercelKv } from "@vercel/kv";

// ---- Detect whether real KV is available ----
const KV_AVAILABLE =
  !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;

// ---- In-memory fallback (dev only; non-persistent) ----
const memStore = new Map<string, string>();

async function rawGet(key: string): Promise<string | null> {
  if (KV_AVAILABLE) {
    const v = await vercelKv.get<string>(key);
    return v ?? null;
  }
  return memStore.has(key) ? memStore.get(key)! : null;
}

async function rawSet(key: string, value: string): Promise<void> {
  if (KV_AVAILABLE) {
    await vercelKv.set(key, value);
  } else {
    memStore.set(key, value);
  }
}

// ---- Typed helpers ----
export async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await rawGet(key);
  if (raw == null) return null;
  // Vercel KV may already deserialize objects; guard for both.
  if (typeof raw === "object") return raw as unknown as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJSON<T>(key: string, value: T): Promise<void> {
  await rawSet(key, JSON.stringify(value));
}

export function kvIsConfigured(): boolean {
  return KV_AVAILABLE;
}

// ---- Domain types ----

export interface ManifestImage {
  /** Public, unguessable filename served from /public/images/ */
  filename: string;
  /** Ground truth — NEVER sent to client */
  trueClass: "real" | "synthetic";
}

export interface Manifest {
  images: ManifestImage[];
  /** Total count, for sanity checks */
  count: number;
  /** When the manifest was generated */
  createdAt: string;
}

export interface RaterRecord {
  id: string;
  createdAt: string;
  fullName: string;
  hospital: string;
  yearsExperience: number;
  specialization: string;
  boardCertified: boolean;
  email: string | null;
  /** Per-rater deterministic shuffle order: array of manifest indices */
  order: number[];
  /** How many responses submitted so far */
  progress: number;
  /** Whether the rater finished all images */
  completed: boolean;
}

export interface ResponseRow {
  imageFilename: string;
  trueClass: "real" | "synthetic";
  decision: "real" | "synthetic";
  correct: boolean;
  confidence: number; // 1..5
  tumorVisibility: number | null; // 1..5 or null
  notes: string;
  responseTimeMs: number;
  submittedAt: string;
  /** Position in this rater's sequence (1-based) */
  sequenceIndex: number;
}

// ---- Manifest accessors ----

export async function getManifest(): Promise<Manifest | null> {
  // Prefer the manifest stored in KV/memory (set via /api/seed).
  const stored = await getJSON<Manifest>("manifest");
  if (stored && Array.isArray(stored.images) && stored.images.length > 0) {
    return stored;
  }
  // Fallback: read the bundled seed manifest committed at public/manifest.seed.json.
  // This lets the study run immediately after deploy without requiring the
  // /api/seed step or KV provisioning. (Class labels still never reach the client.)
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const p = path.join(process.cwd(), "public", "manifest.seed.json");
    const raw = await fs.readFile(p, "utf-8");
    const parsed = JSON.parse(raw) as Manifest;
    if (parsed && Array.isArray(parsed.images) && parsed.images.length > 0) {
      return parsed;
    }
  } catch {
    // ignore — no bundled manifest available
  }
  return stored ?? null;
}

export async function setManifest(m: Manifest): Promise<void> {
  await setJSON("manifest", m);
}

// ---- Rater accessors ----

export async function getRater(id: string): Promise<RaterRecord | null> {
  return getJSON<RaterRecord>(`rater:${id}`);
}

export async function setRater(r: RaterRecord): Promise<void> {
  await setJSON(`rater:${r.id}`, r);
  // maintain the index
  const idx = (await getJSON<string[]>("raters:index")) ?? [];
  if (!idx.includes(r.id)) {
    idx.push(r.id);
    await setJSON("raters:index", idx);
  }
}

export async function listRaterIds(): Promise<string[]> {
  return (await getJSON<string[]>("raters:index")) ?? [];
}

// ---- Response accessors ----

export async function getResponses(raterId: string): Promise<ResponseRow[]> {
  return (await getJSON<ResponseRow[]>(`responses:${raterId}`)) ?? [];
}

export async function appendResponse(
  raterId: string,
  row: ResponseRow
): Promise<void> {
  const rows = await getResponses(raterId);
  // Guard against duplicate submission of the same sequence index
  const existing = rows.find((r) => r.sequenceIndex === row.sequenceIndex);
  if (!existing) {
    rows.push(row);
    await setJSON(`responses:${raterId}`, rows);
  }
}
