#!/usr/bin/env bash
###############################################################################
# Brain MRI Turing Test — resilient one-shot deploy.
# Run on your Mac:  cd ~/Downloads/turing-app && bash DEPLOY_NOW.sh
#
# Deploys straight to Vercel from your local folder (no GitHub required).
# GitHub push is attempted only if the `gh` CLI is available.
###############################################################################
set -uo pipefail
REPO_NAME="mri-turing-test"

echo "==> 1. Fresh git repo + commit"
rm -rf .git
git init -q
git add -A
git -c user.email="jacinjacob1@gmail.com" -c user.name="Jace" \
    commit -q -m "Brain MRI Visual Turing Test — 50 real + 50 synthetic, auto-seeding"
echo "    committed."

echo ""
echo "==> 2. Deploy to Vercel (production) via npx — no global install needed"
echo "    If this is your first deploy, it will open a browser to log in,"
echo "    then link a new project (accept the defaults)."
# npx fetches the Vercel CLI on the fly. --yes accepts project-link defaults.
npx --yes vercel@latest --prod --yes
VERCEL_RC=$?

echo ""
if [ "$VERCEL_RC" -eq 0 ]; then
  echo "    ✅ Vercel deploy finished — your live URL is printed just above."
else
  echo "    ⚠️  Vercel step exited non-zero. If it asked you to log in, run:"
  echo "        npx vercel login   then re-run this script."
fi

echo ""
echo "==> 3. (Optional) Push to GitHub"
if command -v gh >/dev/null 2>&1; then
  echo "    gh found — creating private repo and pushing…"
  gh repo create "$REPO_NAME" --private --source=. --remote=origin --push
  echo "    ✅ Pushed to GitHub."
else
  echo "    'gh' not installed — skipping GitHub. Your app is already deployed above."
  echo "    To add GitHub later, either:"
  echo "      A) brew install gh && gh auth login && \\"
  echo "         gh repo create $REPO_NAME --private --source=. --remote=origin --push"
  echo "      B) create an empty repo at https://github.com/new (name: $REPO_NAME), then:"
  echo "         git remote add origin https://github.com/<you>/$REPO_NAME.git"
  echo "         git branch -M main && git push -u origin main"
fi

echo ""
echo "============================================================"
echo "The study auto-loads its bundled 100-image manifest, so raters"
echo "can start immediately at your …vercel.app URL — no seed step."
echo "============================================================"
