/**
 * POST /api/submit
 * Body: { raterId, sequenceIndex, decision, confidence, tumorVisibility, notes, responseTimeMs }
 *
 * Server-side responsibilities:
 *   - resolve the true class for the image at this rater's sequence position
 *     (client never sends or sees the class)
 *   - compute correctness
 *   - append the response row
 *   - advance the rater's progress counter
 *   - mark completed when all images are answered
 *
 * Returns { progress, total, completed }.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getManifest,
  getRater,
  setRater,
  appendResponse,
  ResponseRow,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const {
    raterId,
    sequenceIndex,
    decision,
    confidence,
    tumorVisibility,
    notes,
    responseTimeMs,
  } = body;

  if (!raterId || !sequenceIndex || !decision) {
    return NextResponse.json(
      { error: "raterId, sequenceIndex, decision required" },
      { status: 400 }
    );
  }
  if (decision !== "real" && decision !== "synthetic") {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }

  const rater = await getRater(raterId);
  if (!rater) {
    return NextResponse.json({ error: "Unknown rater" }, { status: 404 });
  }

  const manifest = await getManifest();
  if (!manifest) {
    return NextResponse.json({ error: "No manifest" }, { status: 503 });
  }

  const seq = Number(sequenceIndex);
  if (seq < 1 || seq > rater.order.length) {
    return NextResponse.json({ error: "seq out of range" }, { status: 400 });
  }

  const manifestIndex = rater.order[seq - 1];
  const img = manifest.images[manifestIndex];
  const trueClass = img.trueClass; // resolved server-side

  const row: ResponseRow = {
    imageFilename: img.filename,
    trueClass,
    decision,
    correct: decision === trueClass,
    confidence: Number(confidence) || 3,
    tumorVisibility:
      tumorVisibility === null || tumorVisibility === undefined
        ? null
        : Number(tumorVisibility),
    notes: notes ? String(notes) : "",
    responseTimeMs: Number(responseTimeMs) || 0,
    submittedAt: new Date().toISOString(),
    sequenceIndex: seq,
  };

  await appendResponse(raterId, row);

  // Advance progress to the max sequence index answered
  const newProgress = Math.max(rater.progress, seq);
  rater.progress = newProgress;
  rater.completed = newProgress >= rater.order.length;
  await setRater(rater);

  return NextResponse.json({
    progress: rater.progress,
    total: rater.order.length,
    completed: rater.completed,
  });
}
