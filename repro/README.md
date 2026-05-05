# `vibe_coder_final_boss` — reproducibility kit

Source for the comma 2026 video compression challenge submission documented at
[comma-writeup.pages.dev](https://comma-writeup.pages.dev). Final score
**0.22878** (CPU eval) / 0.252 (CUDA eval, official). 197,160-byte archive,
92K-parameter generator.

This folder is the curated, organized version of the code. The full development
history (195 autoresearch experiments, scratch scripts, intermediate models)
lives in
[BradyMeighan/comma_video_compression_challenge `submission/vibe_coder_final_boss`](https://github.com/BradyMeighan/comma_video_compression_challenge/tree/submission/vibe_coder_final_boss).

```
repro/
├── archive.zip          # the 197,160-byte shipped artifact
├── decoder/             # what evaluate.sh runs to inflate the archive
├── encoder/             # how to build archive.zip from a trained model
└── training/            # how the generator was trained (3-stage curriculum + autoresearch loop)
```

## decoder/ — the inflate path

Everything `evaluate.sh` needs to turn `archive.zip` back into 1200 frames of
raw uint8 RGB. Self-contained; runs on CPU or GPU.

| file | what it does |
|---|---|
| `inflate.sh` | shell entrypoint called by the eval harness |
| `inflate.py` | reads `archive.zip`, decodes mask + pose + model + sidecar, runs the generator pair-by-pair, writes `0.raw` |
| `model.py` | the H3 generator class (`GeneratorPoseLR`) — 92K params, two heads, dual-FiLM Head 1, FP4-quantized convs |
| `sidecar.py` | decodes the 2.4 KB per-pair sidecar (mask flips, pose deltas, F1 warps) and applies it at inflate time |
| `flat_fp4.py` | unpacks the flat-FP4 model serialization (4-bit codebook + per-block fp16 scales, no pickle) |
| `schema_h3.py` | the on-disk weight schema — 105 tensor entries, hardcoded so encoder/decoder agree |
| `range_mask_codec.cpp` | 9-context binary arithmetic mask coder, compiled to a binary at inflate time. Adapted from [PR #81](https://github.com/commaai/comma_video_compression_challenge/pull/81) (erichasinternet) |

Run the decoder standalone (no eval harness):

```bash
cd decoder
bash inflate.sh ../  /tmp/inflated  ../public_test_video_names.txt
```

## encoder/ — building archive.zip

| file | what it does |
|---|---|
| `build_archive.py` | takes a trained model checkpoint + the source video, runs the per-pair sidecar search, packs everything into the 197 KB archive |
| `compress.sh` | shell wrapper |

This is the slow side. Mask range-coding is fast; the sidecar search runs CMA-ES per pair and takes ~1 hour on a 3090.

## training/ — the generator

| file | what it does |
|---|---|
| `train.py` | main 3-stage curriculum (anchor → finetune → joint), 701 lines |
| `continue_train.py` | warm-restart fine-tunes (the 3090 continuation passes that took us from 0.41 to 0.30) |
| `3090_train.sh` | the actual command line we ran on the 3090 |
| `colab_train.ipynb` | A100 12-hour run on Colab |
| `autoresearch/` | the LLM-driven architecture-search loop and a few example explore scripts |

### autoresearch/

The architecture wasn't designed by hand. An LLM agent ran ~195 short-budget
proxy experiments (each a 5-minute training run), reading the previous
result and proposing a single algorithmic change, kept-or-reverted by score
delta. Karpathy's nanoGPT-speedrun rule: search algorithms, not
hyperparameters.

| file | what it is |
|---|---|
| `runner.sh` | the loop driver (kicks off proxy training rounds and parses results) |
| `sidecar_search_example.py` | example "explore" script for one of the sidecar candidates (X2 mask blocks + CMA-ES) |
| `explore_x2_mask_blocks.py` | the X2 method (2×2 mask block flips chosen per-pair to reduce pose) |
| `explore_x3_cmaes.py` | CMA-ES single-pixel mask search on the worst pose pairs |
| `v2_warp_refine.py` | F1 warp refinement (per-pair 2-byte int8 sub-pixel shift of frame 1) |

## quick start

Want to verify the score?

```bash
# from comma's challenge repo:
cp repro/archive.zip submissions/vibe_coder_final_boss/
cp repro/decoder/* submissions/vibe_coder_final_boss/
bash evaluate.sh --device cpu --submission-dir submissions/vibe_coder_final_boss
# → expected: score 0.22878 on ubuntu-latest CPU
# → on T4 / DALI: score ≈ 0.25 (the H3 generator overfit AVVideoDataset's YUV→RGB matrix; see PR #97 for context)
```

Want to retrain from scratch on a 3090?

```bash
cd training
bash 3090_train.sh
# → 4-12 hours depending on stage, produces a checkpoint
# → then run encoder/build_archive.py to bundle it into a new archive.zip
```

## credits

- mask codec source: [PR #81](https://github.com/commaai/comma_video_compression_challenge/pull/81) (erichasinternet)
- flat-pack inspiration: [PR #73](https://github.com/commaai/comma_video_compression_challenge/pull/73) (emir_flatpack)
- challenge: [comma.ai 2026 video compression challenge](https://github.com/commaai/comma_video_compression_challenge)
