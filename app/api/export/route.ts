/**
 * GET /api/export?token=ADMIN_TOKEN
 * Admin-only. Returns a CSV of all responses across all raters, joined with
 * rater demographics. This is the analysis-ready file for the paper.
 *
 * Protected by ADMIN_TOKEN env var. If the token is missing or wrong, 401.
 *
 * CSV columns (long format, one row per rater-image rating):
 *   rater_id, full_name, hospital, specialization, sequence_index,
 *   image_filename, true_class, decision, correct, confidence,
 *   tumor_visibility, response_time_ms, submitted_at, notes
 */

import { NextRequest, NextResponse } from "next/server";
import { listRaterIds, getRater, getResponses } from "@/lib/store";

export const dynamic = "force-dynamic";

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const adminToken = process.env.ADMIN_TOKEN;

  if (!adminToken) {
    return NextResponse.json(
      { error: "ADMIN_TOKEN not configured on server" },
      { status: 500 }
    );
  }
  if (token !== adminToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const header = [
    "rater_id",
    "full_name",
    "hospital",
    "specialization",
    "sequence_index",
    "image_filename",
    "true_class",
    "decision",
    "correct",
    "confidence",
    "tumor_visibility",
    "response_time_ms",
    "submitted_at",
    "notes",
  ];

  const lines: string[] = [header.join(",")];

  const ids = await listRaterIds();
  for (const id of ids) {
    const rater = await getRater(id);
    if (!rater) continue;
    const responses = await getResponses(id);
    // Sort by sequence index for readability
    responses.sort((a, b) => a.sequenceIndex - b.sequenceIndex);
    for (const r of responses) {
      const row = [
        rater.id,
        rater.fullName,
        rater.hospital,
        rater.specialization,
        r.sequenceIndex,
        r.imageFilename,
        r.trueClass,
        r.decision,
        r.correct ? "1" : "0",
        r.confidence,
        r.tumorVisibility === null ? "" : r.tumorVisibility,
        r.responseTimeMs,
        r.submittedAt,
        r.notes,
      ];
      lines.push(row.map(csvEscape).join(","));
    }
  }

  const csv = lines.join("\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="turing_test_responses.csv"`,
    },
  });
}
