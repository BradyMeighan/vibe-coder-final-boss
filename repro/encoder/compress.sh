#!/usr/bin/env bash
# Build archive.zip for the vibe_coder_final_boss submission.
#
# Inputs (taken from autoresearch/ unless overridden):
#   - autoresearch/colab_run/h3_continue/h3_BEST.ckpt (or encode_artifacts/h3_BEST.ckpt)
#   - autoresearch/_cache/full_split_600all.pt (SegNet masks + PoseNet poses for 600 pairs)
#   - encode_artifacts/sidecar_dropped_refined.xz (frozen sidecar blob)
#
# Output: archive.zip in this directory.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python}"
SIDECAR_PATH="${SIDECAR_PATH:-$HERE/encode_artifacts/sidecar_dropped_refined.xz}"

export SIDECAR_PATH
"$PYTHON_BIN" "$HERE/build_archive.py"
echo "Wrote $HERE/archive.zip"
ls -lh "$HERE/archive.zip"
