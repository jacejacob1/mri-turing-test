# Brain MRI Visual Turing Test — Deployment Guide

A blinded reader-study web app. Radiologists classify 100 brain MRI images as
**Real** or **Synthetic**. Class labels never reach the browser; all responses
are stored server-side and exported as a single analysis-ready CSV.

This guide assumes **no prior web-development experience**. Follow it top to
bottom.

---

## What you need

1. A free [GitHub](https://github.com) account
2. A free [Vercel](https://vercel.com) account (sign in with GitHub)
3. Your 100 images: 50 real + 50 synthetic PNGs (see "Which images" below)
4. Node.js installed locally (you already have it — you ran the experiments)

---

## STEP 1 — Put your images in place

Create two folders inside this project and drop your PNGs in:

```
source_images/
  real/         <- put your 50 real BraTS PNGs here
  synthetic/    <- put your 50 generated PNGs here
```

File names inside these folders don't matter — the prep script renames them to
random hashes so no class information leaks. **Just make sure real images go in
`real/` and generated images go in `synthetic/`.**

---

## STEP 2 — Prepare the images (one command)

From the project folder, run:

```bash
npm install
SECRET="pick-any-long-random-phrase-here" npm run prepare-images
```

This:
- copies all 100 images into `public/images/` with random hashed names
- writes `public/manifest.seed.json` (the secret map of filename → real/synthetic)

You should see: `wrote 100 images` with `real: 50, synthetic: 50`.

---

## STEP 3 — Push to GitHub

```bash
git init
git add .
git commit -m "Brain MRI Turing test study"
```

Then create a new repository on GitHub (e.g. `mri-turing-test`) and follow
GitHub's "push an existing repository" instructions, which look like:

```bash
git remote add origin https://github.com/YOUR_USERNAME/mri-turing-test.git
git branch -M main
git push -u origin main
```

> The `public/images/` folder IS committed on purpose — the images need to ship
> with the app. `manifest.seed.json` is committed too. Neither contains the
> word "real" or "synthetic" in any filename, so committing them is safe.

---

## STEP 4 — Deploy on Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your `mri-turing-test` GitHub repo
3. Leave all build settings at their defaults (Vercel auto-detects Next.js)
4. Click **Deploy**

Wait ~1 minute. You'll get a live URL like
`https://mri-turing-test.vercel.app`. The app loads, but it can't store
responses yet — that's the next step.

---

## STEP 5 — Add the database (Vercel KV — one click)

1. In your Vercel project dashboard, go to the **Storage** tab
2. Click **Create Database** → choose **KV** (Upstash Redis) → **Create**
3. When asked, **connect it to this project** and accept
4. Vercel automatically adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`
   environment variables to your project

No schema, no SQL, nothing else to configure.

---

## STEP 6 — Set your admin token

1. In the Vercel project: **Settings → Environment Variables**
2. Add a new variable:
   - Name: `ADMIN_TOKEN`
   - Value: a long random string you choose (e.g. `k9x2mq7p4v8w1zt3`)
   - Apply to: Production, Preview, Development
3. Save

Then **redeploy** so the new variables take effect: go to **Deployments**, click
the latest one, and choose **Redeploy**. (Any env-var change needs a redeploy.)

---

## STEP 7 — Load the images into the database (one call)

After the redeploy finishes, visit this URL in your browser (replace both
placeholders):

```
https://YOUR-APP.vercel.app/api/seed?token=YOUR_ADMIN_TOKEN
```

This is a GET that reports status. To actually load, you need a POST. Easiest
way — open your terminal and run:

```bash
curl -X POST "https://YOUR-APP.vercel.app/api/seed?token=YOUR_ADMIN_TOKEN"
```

You should see: `{"ok":true,"imageCount":100,"message":"Seeded 100 images into KV."}`

**The study is now live.** Send `https://YOUR-APP.vercel.app` to your raters.

---

## During the study

- Each rater opens the link, fills the intake form, and rates all 100 images.
- If a rater closes the tab, they can return to the same link and resume.
- Each rater sees the **same 100 images in a different random order**.
- You can check how many raters have participated any time (see export below).

---

## STEP 8 — Export the results

When your raters are done, download the CSV:

```bash
curl "https://YOUR-APP.vercel.app/api/export?token=YOUR_ADMIN_TOKEN" -o turing_results.csv
```

Or just open that URL in a browser — it downloads the CSV.

The CSV has one row per rater-per-image, with columns:

```
rater_id, full_name, hospital, years_experience, specialization,
board_certified, sequence_index, image_filename, true_class, decision,
correct, confidence, tumor_visibility, response_time_ms, submitted_at, notes
```

This is directly analyzable: per-rater accuracy = mean of `correct`; the
confusion of real vs synthetic comes from `true_class` × `decision`;
inter-rater agreement (Cohen's / Fleiss' κ) uses `decision` joined on
`image_filename` across raters.

---

## Blinding guarantees (for the methods section)

- Image filenames are SHA-256 hashes — they contain no class information.
- The filename → class map lives only in server-side storage; the browser never
  receives it.
- The `/api/submit` route resolves the true class server-side and computes
  `correct` there. The client cannot tell the app what class an image is.
- Each rater receives an independent randomized order (seeded by their rater ID).
- No back button: each judgment is a first impression.
- Response time is recorded silently for each image.

---

## Troubleshooting

**"No image manifest found" when a rater clicks Continue**
→ You haven't run STEP 7 (the seed POST), or KV isn't connected. Re-check
STEP 5 and STEP 7.

**Seed returns "KV is not configured"**
→ KV env vars aren't present. Re-do STEP 5, then redeploy, then seed again.

**Export returns "Unauthorized"**
→ Wrong `ADMIN_TOKEN` in the URL, or it wasn't set/redeployed. Re-check STEP 6.

**A rater's images won't load**
→ Confirm `public/images/` was committed and pushed (STEP 3). Open one image
directly: `https://YOUR-APP.vercel.app/images/<some-hash>.png`.

---

## Local development (optional)

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`. Without KV env vars set, the app uses a
non-persistent in-memory store — fine for testing the flow, but responses are
lost on restart. For local persistence, put `KV_REST_API_URL`,
`KV_REST_API_TOKEN`, and `ADMIN_TOKEN` in a `.env.local` file.
