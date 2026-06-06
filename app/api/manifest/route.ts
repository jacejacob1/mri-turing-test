/**
 * GET /api/manifest?raterId=...&seq=N
 * Returns the image to show for this rater at sequence position N (1-based).
 * Response: { filename, sequenceIndex, total } — NO class label.
 *
 * The mapping from sequence position -> manifest index uses the rater's
 * stored permutation, so the client cannot infer anything about class
 * from the order or the filename (filenames are random hashes).
 */

import { NextRequest, NextResponse } from "next/server";
import { getManifest, getRater } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raterId = searchParams.get("raterId");
  const seqStr = searchParams.get("seq");

  if (!raterId || !seqStr) {
    return NextResponse.json(
      { error: "raterId and seq are required" },
      { status: 400 }
    );
  }

  const seq = parseInt(seqStr, 10);
  if (isNaN(seq) || seq < 1) {
    return NextResponse.json({ error: "Invalid seq" }, { status: 400 });
  }

  const rater = await getRater(raterId);
  if (!rater) {
    return NextResponse.json({ error: "Unknown rater" }, { status: 404 });
  }

  const manifest = await getManifest();
  if (!manifest) {
    return NextResponse.json({ error: "No manifest" }, { status: 503 });
  }

  if (seq > rater.order.length) {
    return NextResponse.json(
      { error: "Sequence beyond test length", total: rater.order.length },
      { status: 416 }
    );
  }

  const manifestIndex = rater.order[seq - 1];
  const img = manifest.images[manifestIndex];

  // CRITICAL: return only the filename, never img.trueClass
  return NextResponse.json({
    filename: img.filename,
    sequenceIndex: seq,
    total: rater.order.length,
  });
}
