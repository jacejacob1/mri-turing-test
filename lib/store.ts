/**
 * lib/store.ts
 * ------------
 * Storage layer for the Visual Turing Test.
 *
 * Persists raters and their responses in **Supabase** (Postgres). This makes
 * the study durable across Vercel's serverless invocations — which is why the
 * rater is no longer "Unknown" between the /api/start and /api/manifest calls.
 *
 * Configure two environment variables in Vercel (and .env.local for dev):
 *   SUPABASE_URL                -> https://<project-ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   -> the service_role secret (server-side only)
 *
 * If those are absent, the layer falls back to a non-persistent in-process Map
 * so `next dev` still runs locally — but production MUST have Supabase set,
 * otherwise responses are lost between requests.
 *
 * The image manifest itself is NOT stored in the database: it is read from the
 * bundled public/manifest.seed.json (class labels never reach the client).
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ---- Detect whether Supabase is available ----
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_AVAILABLE = !!SUPABASE_URL && !!SUPABASE_SERVICE_ROLE_KEY;

let _client: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!_client) {
    _client = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}

export function kvIsConfigured(): boolean {
  return SUPABASE_AVAILABLE;
}

// ---- In-memory fallback (dev only; non-persistent) ----
const memRaters = new Map<string, RaterRecord>();
const memResponses = new Map<string, ResponseRow[]>();

// ---- Domain types ----

export interface ManifestImage {
  /** Public, unguessable filename served from /public/images/ */
  filename: string;
  /** Ground truth — NEVER sent to client */
  trueClass: "real" | "synthetic";
}

export interface Manifest {
  images: ManifestImage[];
  count: number;
  createdAt: string;
}

export interface RaterRecord {
  id: string;
  createdAt: string;
  fullName: string;
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

// ---- Row <-> record mapping for Supabase ----

interface RaterRow {
  id: string;
  created_at: string;
  full_name: string;
  order_indices: number[];
  progress: number;
  completed: boolean;
}

function rowToRater(r: RaterRow): RaterRecord {
  return {
    id: r.id,
    createdAt: r.created_at,
    fullName: r.full_name,
    order: r.order_indices,
    progress: r.progress,
    completed: r.completed,
  };
}

function raterToRow(r: RaterRecord): RaterRow {
  return {
    id: r.id,
    created_at: r.createdAt,
    full_name: r.fullName,
    order_indices: r.order,
    progress: r.progress,
    completed: r.completed,
  };
}

// ---- Manifest accessors (bundled file; no DB) ----

let _memManifest: Manifest | null = null;

export async function getManifest(): Promise<Manifest | null> {
  if (_memManifest && _memManifest.images.length > 0) return _memManifest;
  // Read the bundled seed manifest committed at public/manifest.seed.json so
  // the study runs immediately after deploy with no seeding step.
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const p = path.join(process.cwd(), "public", "manifest.seed.json");
    const raw = await fs.readFile(p, "utf-8");
    const parsed = JSON.parse(raw) as Manifest;
    if (parsed && Array.isArray(parsed.images) && parsed.images.length > 0) {
      _memManifest = parsed;
      return parsed;
    }
  } catch {
    // ignore — no bundled manifest available
  }
  return null;
}

export async function setManifest(m: Manifest): Promise<void> {
  _memManifest = m;
}

// ---- Rater accessors ----

export async function getRater(id: string): Promise<RaterRecord | null> {
  if (!SUPABASE_AVAILABLE) {
    return memRaters.get(id) ?? null;
  }
  const { data, error } = await db()
    .from("raters")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return rowToRater(data as RaterRow);
}

export async function setRater(r: RaterRecord): Promise<void> {
  if (!SUPABASE_AVAILABLE) {
    memRaters.set(r.id, r);
    return;
  }
  const { error } = await db()
    .from("raters")
    .upsert(raterToRow(r), { onConflict: "id" });
  if (error) throw new Error("Failed to save rater: " + error.message);
}

export async function listRaterIds(): Promise<string[]> {
  if (!SUPABASE_AVAILABLE) {
    return Array.from(memRaters.keys());
  }
  const { data, error } = await db().from("raters").select("id");
  if (error || !data) return [];
  return (data as { id: string }[]).map((r) => r.id);
}

// ---- Response accessors ----

export async function getResponses(raterId: string): Promise<ResponseRow[]> {
  if (!SUPABASE_AVAILABLE) {
    return memResponses.get(raterId) ?? [];
  }
  const { data, error } = await db()
    .from("responses")
    .select("*")
    .eq("rater_id", raterId)
    .order("sequence_index", { ascending: true });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    imageFilename: r.image_filename as string,
    trueClass: r.true_class as "real" | "synthetic",
    decision: r.decision as "real" | "synthetic",
    correct: r.correct as boolean,
    confidence: r.confidence as number,
    tumorVisibility: (r.tumor_visibility as number | null) ?? null,
    notes: (r.notes as string) ?? "",
    responseTimeMs: (r.response_time_ms as number) ?? 0,
    submittedAt: r.submitted_at as string,
    sequenceIndex: r.sequence_index as number,
  }));
}

export async function appendResponse(
  raterId: string,
  row: ResponseRow
): Promise<void> {
  if (!SUPABASE_AVAILABLE) {
    const rows = memResponses.get(raterId) ?? [];
    if (!rows.find((r) => r.sequenceIndex === row.sequenceIndex)) {
      rows.push(row);
      memResponses.set(raterId, rows);
    }
    return;
  }
  // Upsert keyed on (rater_id, sequence_index) so a re-submit of the same
  // position is idempotent rather than duplicated.
  const { error } = await db()
    .from("responses")
    .upsert(
      {
        rater_id: raterId,
        sequence_index: row.sequenceIndex,
        image_filename: row.imageFilename,
        true_class: row.trueClass,
        decision: row.decision,
        correct: row.correct,
        confidence: row.confidence,
        tumor_visibility: row.tumorVisibility,
        notes: row.notes,
        response_time_ms: row.responseTimeMs,
        submitted_at: row.submittedAt,
      },
      { onConflict: "rater_id,sequence_index", ignoreDuplicates: true }
    );
  if (error) throw new Error("Failed to save response: " + error.message);
}
