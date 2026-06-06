/**
 * POST /api/seed?token=ADMIN_TOKEN
 * Admin-only. Loads the bundled image manifest (public/manifest.seed.json,
 * produced by scripts/prepare_images.mjs) into KV storage.
 *
 * Run this ONCE after the first deploy (and after provisioning KV). It is
 * idempotent — re-running overwrites the manifest with the same content.
 *
 * GET /api/seed?token=ADMIN_TOKEN
 * Returns whether a manifest is currently present and how many images.
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import {
  getManifest,
  setManifest,
  kvIsConfigured,
  Manifest,
} from "@/lib/store";

export const dynamic = "force-dynamic";

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get("token");
  const adminToken = process.env.ADMIN_TOKEN;
  return !!adminToken && token === adminToken;
}

export async function GET(req: NextRequest) {
  if (!checkToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const m = await getManifest();
  return NextResponse.json({
    kvConfigured: kvIsConfigured(),
    manifestPresent: !!m,
    imageCount: m?.count ?? 0,
    createdAt: m?.createdAt ?? null,
  });
}

export async function POST(req: NextRequest) {
  if (!checkToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!kvIsConfigured()) {
    return NextResponse.json(
      {
        error:
          "KV is not configured. Provision Vercel KV and set its env vars " +
          "before seeding, otherwise the manifest will not persist.",
      },
      { status: 503 }
    );
  }

  // Read the bundled seed manifest
  const seedPath = path.join(process.cwd(), "public", "manifest.seed.json");
  let seedRaw: string;
  try {
    seedRaw = await fs.readFile(seedPath, "utf-8");
  } catch {
    return NextResponse.json(
      {
        error:
          "public/manifest.seed.json not found. Run the prepare-images " +
          "script and redeploy before seeding.",
      },
      { status: 404 }
    );
  }

  let parsed: Manifest;
  try {
    parsed = JSON.parse(seedRaw) as Manifest;
  } catch {
    return NextResponse.json(
      { error: "manifest.seed.json is not valid JSON" },
      { status: 422 }
    );
  }

  if (!parsed.images || !Array.isArray(parsed.images) || parsed.images.length === 0) {
    return NextResponse.json(
      { error: "Seed manifest has no images" },
      { status: 422 }
    );
  }

  await setManifest(parsed);

  return NextResponse.json({
    ok: true,
    imageCount: parsed.count,
    message: `Seeded ${parsed.count} images into KV.`,
  });
}
