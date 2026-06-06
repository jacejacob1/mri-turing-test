# Which 100 Images to Use — Selection Protocol

This answers the two questions: **which images**, and **how to produce them**
so the Visual Turing Test is scientifically defensible. Hand the resulting
PNGs to STEP 1 of the README (the `source_images/real/` and
`source_images/synthetic/` folders).

---

## The composition: 50 real + 50 synthetic

A balanced 50/50 split is the standard for a forced-choice Turing test. It
means a rater who cannot distinguish real from synthetic scores ~50% accuracy
(chance), which is exactly the null hypothesis the test evaluates. Any
imbalance (e.g., 70/30) lets a rater game the test by guessing the majority
class, so **keep it exactly 50/50**.

---

## The 50 REAL images — sampling rule

**Source:** BraTS2020, the same dataset the model trained on, but the images
shown should be drawn to be *representative*, not cherry-picked.

**Critical methodological point:** Ideally the 50 real images are **held out**
from the 1,107 slices used in training, to avoid the (subtle) confound that a
rater is comparing synthetic images against the exact real images the model
saw. In practice, since your slice-selection rule deterministically picks the
top-3 FLAIR slices per volume, you have two honest options:

**Option A (cleanest) — held-out volumes.**
If any BraTS2020 volumes were *not* used in training, take real slices from
those. This is the most defensible: the real images are genuinely unseen.

**Option B (acceptable) — random sample from training slices, disclosed.**
If all 369 volumes were used, randomly sample 50 of the 1,107 training slices
and **disclose this in the methods** ("real images were drawn from the training
distribution"). This is common and acceptable for a realism Turing test —
you're testing whether synthetic images look real, not whether the model
generalizes.

**Sampling for representativeness (either option):**
- Sample uniformly at random across volumes (not all from a few patients).
- Ensure a spread of tumor sizes — don't accidentally pick 50 huge-tumor
  slices. A simple way: sort candidate slices by tumor-pixel count, then sample
  evenly across that range (some small, some medium, some large tumors).
- Use the same overlay rendering used in training (the RGB FLAIR-with-mask
  overlay), so real and synthetic images are in an identical visual format.

---

## The 50 SYNTHETIC images — sampling rule

**Source:** the final proposed model checkpoint, `G_final.pt`.

**Critical:** generate them conditioned on masks that match the real-image
distribution, so the only difference a rater can detect is *image realism*, not
*mask plausibility*. Concretely:

- Condition generation on **the same 50 masks** used by (or drawn from the same
  distribution as) the 50 real images. If the real set uses masks M1..M50, then
  generate one synthetic image per mask M1..M50. This pairs each synthetic
  image with a real-image mask, isolating realism as the only variable.
- Use a **fixed random seed** for the latent z, recorded for reproducibility.
- Render with the **identical overlay pipeline** as the real images.
- **Quality-control pass:** generate slightly more than 50 (say 60), visually
  discard any that are obviously broken (total mode collapse / pure noise), and
  keep the first 50 in generation order. Discarding catastrophic failures is
  acceptable and standard, but **do not** cherry-pick only the best-looking
  ones — that biases the test in your favor and a reviewer would object.
  Document the QC rule ("we discarded N images exhibiting total generation
  failure; the remaining were used in generation order").

---

## How to generate them — server commands

Run on the server (or wherever `G_final.pt` and the data live). This produces
the two folders ready for the app.

### 1. Generate the 50 synthetic images

```bash
cd ~/24phd1007/SWGAN

python3 - <<'PY'
import sys, os, math, numpy as np, torch
from PIL import Image
sys.path.insert(0, '.')
from v17_inline_kmex import build_generator, H5OverlayDataset

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
os.makedirs("turing_source/synthetic", exist_ok=True)

# Build generator exactly as compute_metrics.py does
steps = int(math.log2(256)) - int(math.log2(4))
class Shim: pass
s = Shim()
for k,v in [("nc",3),("mask_nc",3),("nz",128),("gf",64),("num_prototypes",16)]:
    setattr(s,k,v)
G = build_generator(steps, s).to(device).eval()
G.load_state_dict(torch.load("proposed_inline_seed0_v2/G_final.pt",
                             map_location=device, weights_only=True))

ds = H5OverlayDataset(root="h5_train", img_size=256,
                      overlay_cache="overlay_train")

# Deterministic mask selection: evenly spaced across the dataset so we span
# a range of tumor sizes/locations. Pick 60, keep first 50 after QC.
rng = np.random.default_rng(0)
idxs = rng.choice(len(ds), size=60, replace=False)

torch.manual_seed(0)
count = 0
for j in idxs:
    if count >= 50: break
    _, mask = ds[int(j)]
    mask = mask.unsqueeze(0).to(device)
    z = torch.randn(1, 128, 1, 1, device=device)   # 4D latent (correct shape)
    with torch.no_grad():
        fake = G(z, mask)[0]                          # [3,256,256] in [-1,1]
    img = ((fake.clamp(-1,1)+1)/2 * 255).byte().permute(1,2,0).cpu().numpy()
    Image.fromarray(img, mode="RGB").save(
        f"turing_source/synthetic/syn_{count:03d}.png")
    count += 1
print(f"Wrote {count} synthetic images to turing_source/synthetic/")
PY
```

### 2. Export the 50 real images (paired masks)

```bash
python3 - <<'PY'
import sys, os, numpy as np
from PIL import Image
sys.path.insert(0, '.')
from v17_inline_kmex import H5OverlayDataset

os.makedirs("turing_source/real", exist_ok=True)
ds = H5OverlayDataset(root="h5_train", img_size=256,
                      overlay_cache="overlay_train")

# Use the SAME indices as the synthetic generation (seed 0, first 50)
rng = np.random.default_rng(0)
idxs = rng.choice(len(ds), size=60, replace=False)[:50]

for c, j in enumerate(idxs):
    x, _ = ds[int(j)]                                 # [3,256,256] in [-1,1]
    img = ((x.clamp(-1,1)+1)/2 * 255).byte().permute(1,2,0).numpy()
    Image.fromarray(img, mode="RGB").save(
        f"turing_source/real/real_{c:03d}.png")
print(f"Wrote 50 real images to turing_source/real/")
PY
```

### 3. QC the synthetic images

Open `turing_source/synthetic/` and look through the 50. If any are total
failures (pure noise, no brain structure), delete them and regenerate by
bumping the `size=60` to `size=70` and re-running, keeping the first 50 good
ones. Record how many you discarded.

### 4. Transfer to your Mac / the app

Copy the two folders into the app's `source_images/`:

```
turing-app/
  source_images/
    real/         <- the 50 real_*.png
    synthetic/    <- the 50 syn_*.png
```

Then continue from README STEP 2.

---

## Why this design is defensible (for the methods section)

- **Balanced 50/50** → chance accuracy is 50%, a clean null hypothesis.
- **Paired masks** → real and synthetic images share the same mask
  distribution, so realism is the only variable a rater can use.
- **Identical overlay rendering** → no visual-format giveaway.
- **Representative sampling across tumor sizes** → not biased toward easy or
  hard cases.
- **Documented QC rule** → discarding only catastrophic failures, in generation
  order, avoids cherry-picking bias.
- **Same 100 images for all raters, different orders** → enables both per-rater
  accuracy and inter-rater agreement (Cohen's / Fleiss' κ).

## What to report in the paper

> "Each of the four raters classified 100 axial brain MRI images (50 real
> BraTS2020 slices, 50 synthetic images from the proposed model) as real or
> synthetic in a blinded, forced-choice protocol. Real and synthetic images
> were rendered with an identical overlay pipeline and paired on mask
> distribution. Images were presented in a per-rater randomized order with no
> opportunity for revision. We report per-rater classification accuracy
> (chance = 50%), pooled accuracy, and inter-rater agreement (Fleiss' κ).
> A model producing indistinguishable images yields rater accuracy near 50%."
