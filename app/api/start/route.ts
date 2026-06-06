/**
 * POST /api/start
 * Registers a rater (intake form) and initializes their test session.
 * Returns { raterId, total, progress } — never any class labels.
 *
 * If a raterId is supplied and already exists (resume), returns existing
 * progress instead of creating a new record.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getManifest,
  getRater,
  setRater,
  RaterRecord,
} from "@/lib/store";
import { seededPermutation } from "@/lib/shuffle";

export const dynamic = "force-dynamic";

function randomId(): string {
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 6; i++) s += hex[Math.floor(Math.random() * 16)];
  return `RATER_${s}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Resume path: existing raterId provided
  if (body.raterId) {
    const existing = await getRater(body.raterId);
    if (existing) {
      return NextResponse.json({
        raterId: existing.id,
        total: existing.order.length,
        progress: existing.progress,
        completed: existing.completed,
        resumed: true,
      });
    }
  }

  // New rater: validate intake
  const { fullName } = body;

  if (!fullName) {
    return NextResponse.json(
      { error: "Missing required intake fields" },
      { status: 400 }
    );
  }

  const manifest = await getManifest();
  if (!manifest || manifest.count === 0) {
    return NextResponse.json(
      {
        error:
          "No image manifest found. The study has not been initialized. " +
          "Run the prepare-images step and seed the manifest first.",
      },
      { status: 503 }
    );
  }

  const id = randomId();
  const order = seededPermutation(manifest.count, id);

  const rec: RaterRecord = {
    id,
    createdAt: new Date().toISOString(),
    fullName: String(fullName),
    order,
    progress: 0,
    completed: false,
  };

  await setRater(rec);

  return NextResponse.json({
    raterId: id,
    total: order.length,
    progress: 0,
    completed: false,
    resumed: false,
  });
}
