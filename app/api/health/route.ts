/**
 * GET /api/health
 * Public diagnostic. Reports whether the live deployment has Supabase
 * configured and whether the image manifest is readable. Use this to confirm
 * a redeploy actually picked up your env vars and the latest code.
 *
 * It also attempts a tiny read against the `raters` table so you can tell
 * whether the Supabase credentials and schema are working end-to-end.
 */

import { NextResponse } from "next/server";
import { getManifest, kvIsConfigured, listRaterIds } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseConfigured = kvIsConfigured();
  const manifest = await getManifest();

  let supabaseReachable: boolean | null = null;
  let raterCount: number | null = null;
  let supabaseError: string | null = null;

  if (supabaseConfigured) {
    try {
      const ids = await listRaterIds();
      supabaseReachable = true;
      raterCount = ids.length;
    } catch (e) {
      supabaseReachable = false;
      supabaseError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({
    ok: true,
    build: "supabase-storage-v2",
    supabaseConfigured,
    supabaseReachable,
    raterCount,
    supabaseError,
    manifestPresent: !!manifest,
    imageCount: manifest?.count ?? 0,
  });
}
