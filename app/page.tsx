"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type Stage = "landing" | "intake" | "instructions" | "test" | "done";

interface IntakeData {
  fullName: string;
  hospital: string;
  specialization: string;
  specializationOther: string;
  consent: boolean;
}

const LS_KEY = "turing_rater_session_v1";

export default function Page() {
  const [stage, setStage] = useState<Stage>("landing");
  const [raterId, setRaterId] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);

  const [intake, setIntake] = useState<IntakeData>({
    fullName: "",
    hospital: "",
    specialization: "",
    specializationOther: "",
    consent: false,
  });

  const [resumeAvailable, setResumeAvailable] = useState<{
    raterId: string;
    progress: number;
    total: number;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ---- Detect resumable session on mount ----
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      try {
        const obj = JSON.parse(saved);
        if (obj.raterId) {
          // verify with server
          fetch("/api/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ raterId: obj.raterId }),
          })
            .then((r) => r.json())
            .then((d) => {
              if (d.raterId && !d.completed) {
                setResumeAvailable({
                  raterId: d.raterId,
                  progress: d.progress,
                  total: d.total,
                });
              } else if (d.completed) {
                localStorage.removeItem(LS_KEY);
              }
            })
            .catch(() => {});
        }
      } catch {}
    }
  }, []);

  // ---- Intake validation ----
  const intakeValid =
    intake.fullName.trim() !== "" &&
    intake.hospital.trim() !== "" &&
    intake.specialization !== "" &&
    (intake.specialization !== "Other" ||
      intake.specializationOther.trim() !== "") &&
    intake.consent;

  // ---- Start the test (after intake) ----
  const beginTest = useCallback(async () => {
    setBusy(true);
    setError(null);
    const spec =
      intake.specialization === "Other"
        ? intake.specializationOther.trim()
        : intake.specialization;
    try {
      const res = await fetch("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: intake.fullName.trim(),
          hospital: intake.hospital.trim(),
          specialization: spec,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "Failed to start session.");
        setBusy(false);
        return;
      }
      setRaterId(d.raterId);
      setTotal(d.total);
      setProgress(0);
      localStorage.setItem(LS_KEY, JSON.stringify({ raterId: d.raterId }));
      setStage("instructions");
    } catch (e) {
      setError("Network error. Please try again.");
    }
    setBusy(false);
  }, [intake]);

  // ---- Resume an existing session ----
  const doResume = useCallback(() => {
    if (!resumeAvailable) return;
    setRaterId(resumeAvailable.raterId);
    setTotal(resumeAvailable.total);
    setProgress(resumeAvailable.progress);
    setStage("test");
  }, [resumeAvailable]);

  // ---- Landing ----
  if (stage === "landing") {
    return (
      <div className="wrap">
        <div className="card">
          <p className="eyebrow">Clinical Validation Study</p>
          <h1>Brain MRI Visual Turing Test</h1>
          <p className="lead">
            You will be shown a series of axial brain MRI images. For each one,
            you will judge whether it is a real scan from a patient or a
            synthetic image produced by a computer model. The study takes
            approximately 30–40 minutes and is completed in a single sitting.
          </p>

          {resumeAvailable && (
            <div className="warn">
              A previous incomplete session was found (
              {resumeAvailable.progress} of {resumeAvailable.total} images
              done).{" "}
              <button
                onClick={doResume}
                style={{
                  background: "none",
                  color: "var(--syn-hi)",
                  textDecoration: "underline",
                  padding: 0,
                  fontSize: "13px",
                }}
              >
                Resume where you left off
              </button>
              .
            </div>
          )}

          <button
            className="btn-primary"
            onClick={() => setStage("intake")}
            disabled={busy}
          >
            {resumeAvailable ? "Start a new session" : "Begin"}
          </button>
        </div>
      </div>
    );
  }

  // ---- Intake ----
  if (stage === "intake") {
    return (
      <div className="wrap">
        <div className="card">
          <p className="eyebrow">Participant Information</p>
          <h1>Before we begin</h1>
          <p className="lead">
            All fields are required. Your name will be acknowledged in the
            published paper. Your ratings are stored anonymously for analysis.
          </p>

          <label>Full name</label>
          <input
            type="text"
            value={intake.fullName}
            onChange={(e) =>
              setIntake({ ...intake, fullName: e.target.value })
            }
            placeholder="Dr. Jane Doe"
          />

          <label>Hospital / Institution</label>
          <input
            type="text"
            value={intake.hospital}
            onChange={(e) =>
              setIntake({ ...intake, hospital: e.target.value })
            }
            placeholder="General Hospital"
          />

          <label>Specialization</label>
          <select
            value={intake.specialization}
            onChange={(e) =>
              setIntake({ ...intake, specialization: e.target.value })
            }
          >
            <option value="">Select…</option>
            <option value="Neuroradiology">Neuroradiology</option>
            <option value="General Radiology">General Radiology</option>
            <option value="Diagnostic Radiology">Diagnostic Radiology</option>
            <option value="Other">Other</option>
          </select>

          {intake.specialization === "Other" && (
            <input
              type="text"
              value={intake.specializationOther}
              onChange={(e) =>
                setIntake({ ...intake, specializationOther: e.target.value })
              }
              placeholder="Please specify"
            />
          )}

          <div className="consent">
            <input
              type="checkbox"
              checked={intake.consent}
              onChange={(e) =>
                setIntake({ ...intake, consent: e.target.checked })
              }
              id="consent"
            />
            <span>
              I understand my anonymized ratings will be used in an academic
              publication, my name will be acknowledged in the paper, and I may
              withdraw at any time.
            </span>
          </div>

          {error && <div className="warn">{error}</div>}

          <button
            className="btn-primary"
            disabled={!intakeValid || busy}
            onClick={beginTest}
          >
            {busy ? "Starting…" : "Continue"}
          </button>
        </div>
      </div>
    );
  }

  // ---- Instructions ----
  if (stage === "instructions") {
    return (
      <div className="wrap">
        <div className="card">
          <p className="eyebrow">Instructions</p>
          <h1>How the test works</h1>
          <ul className="muted-list">
            <li>
              You will see {total} images, one at a time, in a randomized order.
            </li>
            <li>
              For each image, click <strong>REAL</strong> if you believe it is
              from an actual patient scan, or <strong>SYNTHETIC</strong> if you
              believe it was computer-generated.
            </li>
            <li>
              Rate your confidence from 1 (pure guess) to 5 (very confident).
            </li>
            <li>
              Optionally rate how clearly a tumor is visible, and add a brief
              note about what informed your decision.
            </li>
            <li>
              You cannot return to a previous image. First impressions are what
              we want.
            </li>
          </ul>
          <button className="btn-primary" onClick={() => setStage("test")}>
            Start the test
          </button>
        </div>
      </div>
    );
  }

  // ---- Test ----
  if (stage === "test" && raterId) {
    return (
      <TestStage
        raterId={raterId}
        total={total}
        startAt={progress + 1}
        onComplete={() => {
          localStorage.removeItem(LS_KEY);
          setStage("done");
        }}
      />
    );
  }

  // ---- Done ----
  if (stage === "done") {
    return (
      <div className="wrap">
        <div className="card center-narrow">
          <p className="eyebrow">Complete</p>
          <h1>Thank you</h1>
          <p className="lead">
            Your responses have been saved. Your contribution to this study is
            greatly appreciated. You will be acknowledged in the published
            paper.
          </p>
          {raterId && (
            <div className="session-id">Session: {raterId}</div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

// =========================================================================
// Test stage component
// =========================================================================

function TestStage({
  raterId,
  total,
  startAt,
  onComplete,
}: {
  raterId: string;
  total: number;
  startAt: number;
  onComplete: () => void;
}) {
  const [seq, setSeq] = useState(startAt);
  const [filename, setFilename] = useState<string | null>(null);
  const [loadingImg, setLoadingImg] = useState(true);
  const [decision, setDecision] = useState<"real" | "synthetic" | null>(null);
  const [confidence, setConfidence] = useState<number>(3);
  const [tumorVis, setTumorVis] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const shownAtRef = useRef<number>(Date.now());

  // Fetch the image for the current sequence position
  const loadImage = useCallback(
    async (s: number) => {
      setLoadingImg(true);
      setErr(null);
      try {
        const res = await fetch(
          `/api/manifest?raterId=${encodeURIComponent(raterId)}&seq=${s}`
        );
        const d = await res.json();
        if (!res.ok) {
          setErr(d.error || "Failed to load image.");
          setLoadingImg(false);
          return;
        }
        setFilename(d.filename);
        shownAtRef.current = Date.now();
      } catch {
        setErr("Network error loading image.");
      }
      setLoadingImg(false);
    },
    [raterId]
  );

  useEffect(() => {
    loadImage(seq);
  }, [seq, loadImage]);

  const reset = () => {
    setDecision(null);
    setConfidence(3);
    setTumorVis(null);
    setNotes("");
    setShowNotes(false);
  };

  const submit = useCallback(async () => {
    if (!decision) return;
    setSubmitting(true);
    setErr(null);
    const responseTimeMs = Date.now() - shownAtRef.current;
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raterId,
          sequenceIndex: seq,
          decision,
          confidence,
          tumorVisibility: tumorVis,
          notes,
          responseTimeMs,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErr(d.error || "Failed to submit.");
        setSubmitting(false);
        return;
      }
      reset();
      if (d.completed) {
        onComplete();
      } else {
        setSeq(seq + 1);
      }
    } catch {
      setErr("Network error submitting. Your previous answers are saved.");
    }
    setSubmitting(false);
  }, [decision, confidence, tumorVis, notes, raterId, seq, onComplete]);

  const pct = Math.round(((seq - 1) / total) * 100);

  return (
    <div className="test-wrap">
      <div className="progress-bar">
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="progress-label">
          IMAGE {seq} OF {total}
        </div>
      </div>

      <div className="image-frame">
        {loadingImg || !filename ? (
          <span style={{ color: "var(--ink-faint)", fontSize: 13 }}>
            Loading…
          </span>
        ) : (
          <img src={`/images/${filename}`} alt="Brain MRI" />
        )}
      </div>

      <div className="decision-row">
        <button
          className={`btn-real ${decision === "real" ? "selected" : ""}`}
          onClick={() => setDecision("real")}
        >
          REAL
        </button>
        <button
          className={`btn-syn ${decision === "synthetic" ? "selected" : ""}`}
          onClick={() => setDecision("synthetic")}
        >
          SYNTHETIC
        </button>
      </div>

      <div className="confidence">
        <div className="confidence-label">How confident are you?</div>
        <div className="conf-scale">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className={`conf-btn ${confidence === n ? "selected" : ""}`}
              onClick={() => setConfidence(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="conf-ends">
          <span>Pure guess</span>
          <span>Very confident</span>
        </div>
      </div>

      <div className="tumor-note">
        <div className="confidence-label">
          Tumor visibility (optional)
        </div>
        <div className="conf-scale">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className={`conf-btn ${tumorVis === n ? "selected" : ""}`}
              onClick={() => setTumorVis(tumorVis === n ? null : n)}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="conf-ends">
          <span>None visible</span>
          <span>Clear borders</span>
        </div>
      </div>

      {!showNotes ? (
        <button className="notes-toggle" onClick={() => setShowNotes(true)}>
          + Add an optional note
        </button>
      ) : (
        <div className="submit-wrap">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What informed your decision? (optional)"
          />
        </div>
      )}

      {err && (
        <div className="submit-wrap">
          <div className="warn">{err}</div>
        </div>
      )}

      <div className="submit-wrap">
        <button
          className="btn-primary"
          disabled={!decision || submitting}
          onClick={submit}
        >
          {submitting
            ? "Saving…"
            : seq >= total
            ? "Submit & Finish"
            : "Submit & Next"}
        </button>
      </div>
    </div>
  );
}
