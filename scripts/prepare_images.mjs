/**
 * scripts/prepare_images.mjs
 * --------------------------
 * Prepares the image set for the Visual Turing Test.
 *
 * INPUT: two folders you create locally:
 *     source_images/real/        <- 50 real BraTS PNGs
 *     source_images/synthetic/   <- 50 generated PNGs
 *
 * OUTPUT:
 *     public/images/<hash>.png            (all 100, randomly named, class-free)
 *     public/manifest.seed.json           (hash -> true_class mapping)
 *
 * The renaming uses SHA-256(originalRelativePath + SECRET) so:
 *   - filenames carry NO class information (no "real"/"fake" substring)
 *   - the mapping is reproducible if you keep the same SECRET
 *   - users cannot reverse-engineer the class from the URL
 *
 * USAGE:
 *     SECRET=some-long-random-string node scripts/prepare_images.mjs
 *
 * If SECRET is not set, a default is used (fine for a single study, but set
 * your own for extra safety).
 *
 * After running, commit public/images/ and public/manifest.seed.json, deploy,
 * then POST /api/seed?token=ADMIN_TOKEN once to load the manifest into KV.
 */

import { promises as fs } from "fs";
import { createHash } from "crypto";
import path from "path";

const SECRET = process.env.SECRET || "brain-mri-turing-default-secret-change-me";

const ROOT = process.cwd();
const SRC_REAL = path.join(ROOT, "source_images", "real");
const SRC_SYN = path.join(ROOT, "source_images", "synthetic");
const OUT_DIR = path.join(ROOT, "public", "images");
const MANIFEST_PATH = path.join(ROOT, "public", "manifest.seed.json");

function hashName(relPath) {
  const h = createHash("sha256").update(relPath + "|" + SECRET).digest("hex");
  return "img_" + h.slice(0, 16) + ".png";
}

async function listPngs(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    throw new Error(`Source folder not found: ${dir}`);
  }
  return entries.filter((f) => f.toLowerCase().endsWith(".png")).sort();
}

async function main() {
  console.log("Preparing Turing-test images...");
  console.log(`  real source:      ${SRC_REAL}`);
  console.log(`  synthetic source: ${SRC_SYN}`);

  const realFiles = await listPngs(SRC_REAL);
  const synFiles = await listPngs(SRC_SYN);

  console.log(`  found ${realFiles.length} real, ${synFiles.length} synthetic`);

  if (realFiles.length === 0 || synFiles.length === 0) {
    throw new Error("Both source folders must contain PNG files.");
  }
  if (realFiles.length !== synFiles.length) {
    console.warn(
      `  WARNING: real (${realFiles.length}) and synthetic ` +
        `(${synFiles.length}) counts differ. A balanced set (equal counts) ` +
        `is strongly recommended for a fair Turing test.`
    );
  }

  // Reset output dir
  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  const images = [];

  for (const f of realFiles) {
    const rel = `real/${f}`;
    const outName = hashName(rel);
    await fs.copyFile(path.join(SRC_REAL, f), path.join(OUT_DIR, outName));
    images.push({ filename: outName, trueClass: "real" });
  }

  for (const f of synFiles) {
    const rel = `synthetic/${f}`;
    const outName = hashName(rel);
    await fs.copyFile(path.join(SRC_SYN, f), path.join(OUT_DIR, outName));
    images.push({ filename: outName, trueClass: "synthetic" });
  }

  // Detect accidental hash collisions
  const names = new Set(images.map((i) => i.filename));
  if (names.size !== images.length) {
    throw new Error(
      "Hash collision detected (extremely unlikely). Change SECRET and retry."
    );
  }

  const manifest = {
    images,
    count: images.length,
    createdAt: new Date().toISOString(),
  };

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf-8");

  const realCount = images.filter((i) => i.trueClass === "real").length;
  const synCount = images.filter((i) => i.trueClass === "synthetic").length;

  console.log("");
  console.log("Done.");
  console.log(`  wrote ${images.length} images to public/images/`);
  console.log(`    real:      ${realCount}`);
  console.log(`    synthetic: ${synCount}`);
  console.log(`  wrote manifest to public/manifest.seed.json`);
  console.log("");
  console.log("Next steps:");
  console.log("  1. git add public/images public/manifest.seed.json");
  console.log("  2. commit + push (Vercel auto-deploys)");
  console.log("  3. POST /api/seed?token=YOUR_ADMIN_TOKEN once");
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
