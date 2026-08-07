#!/usr/bin/env bash
# check-node-version.sh — Pastikan versi Node konsisten di semua tempat
# Run: bash scripts/check-node-version.sh
#
# Kenapa ada: pernah drift diam-diam selama berbulan-bulan — job `test` di CI
# jalan di Node 20 sementara image produksi dibangun dari `node:26-alpine`.
# Enam major version jaraknya, dan tidak ada satu pun gate yang teriak. Bug yang
# hanya muncul di Node produksi lolos CI sepenuhnya.
#
# `.nvmrc` adalah sumber kebenaran untuk dev lokal dan CI; `Dockerfile` untuk
# produksi. Script ini memaksa keduanya sama, dan menolak workflow yang
# meng-hardcode versi Node lagi (harus lewat `node-version-file`).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ERRORS=0

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; ERRORS=$((ERRORS + 1)); }

echo "=== Node Version Consistency Check ==="
echo ""

NVMRC_FILE="$REPO_ROOT/.nvmrc"
DOCKERFILE="$REPO_ROOT/Dockerfile"
WORKFLOW_DIR="$REPO_ROOT/.github/workflows"

# ─── N1: .nvmrc ada dan bisa dibaca ──────────────────────────────────
echo "N1: Membaca .nvmrc..."

NVMRC_VERSION=""
if [ -f "$NVMRC_FILE" ]; then
  # Buang spasi/CR, ambil baris non-kosong pertama, buang prefix "v" kalau ada
  NVMRC_VERSION="$(tr -d ' \t\r' < "$NVMRC_FILE" | grep -v '^$' | head -1 || true)"
  NVMRC_VERSION="${NVMRC_VERSION#v}"

  if [ -n "$NVMRC_VERSION" ]; then
    pass ".nvmrc = $NVMRC_VERSION"
  else
    fail ".nvmrc ada tapi kosong"
  fi
else
  fail ".nvmrc TIDAK ADA (dibutuhkan sebagai sumber kebenaran versi Node)"
fi

# ─── N2: Dockerfile base image bisa di-parse ─────────────────────────
echo ""
echo "N2: Membaca base image di Dockerfile..."

DOCKER_VERSION=""
if [ -f "$DOCKERFILE" ]; then
  DOCKER_TAG="$(grep -m1 -E '^FROM[[:space:]]+node:' "$DOCKERFILE" \
    | sed -E 's/^FROM[[:space:]]+node:([^[:space:]]+).*/\1/' || true)"
  # "26-alpine" -> "26"; "26.1.0-alpine" -> "26.1.0"
  DOCKER_VERSION="${DOCKER_TAG%%-*}"

  if [ -n "$DOCKER_VERSION" ]; then
    pass "Dockerfile = node:$DOCKER_TAG (versi: $DOCKER_VERSION)"
  else
    fail "Tidak menemukan baris 'FROM node:<tag>' di Dockerfile"
  fi
else
  fail "Dockerfile TIDAK ADA di $DOCKERFILE"
fi

# ─── N3: .nvmrc == Dockerfile ────────────────────────────────────────
echo ""
echo "N3: Membandingkan .nvmrc dengan Dockerfile..."

if [ -n "$NVMRC_VERSION" ] && [ -n "$DOCKER_VERSION" ]; then
  if [ "$NVMRC_VERSION" = "$DOCKER_VERSION" ]; then
    pass "Konsisten — CI/dev dan produksi sama-sama Node $NVMRC_VERSION"
  else
    fail "DRIFT: .nvmrc = $NVMRC_VERSION, Dockerfile = $DOCKER_VERSION"
    echo "    Test akan jalan di Node $NVMRC_VERSION sementara produksi di Node $DOCKER_VERSION."
    echo "    Samakan keduanya, jangan salah satu saja."
  fi
else
  fail "Perbandingan dilewati — salah satu versi gagal dibaca (lihat N1/N2)"
fi

# ─── N4: workflow tidak boleh hardcode versi Node ────────────────────
echo ""
echo "N4: Memastikan workflow tidak meng-hardcode versi Node..."

if [ -d "$WORKFLOW_DIR" ]; then
  # Cari `node-version:` tapi BUKAN `node-version-file:`
  HARDCODED="$(grep -rnE '^[[:space:]]*node-version:' "$WORKFLOW_DIR" || true)"

  if [ -z "$HARDCODED" ]; then
    pass "Semua workflow memakai node-version-file (tidak ada versi hardcoded)"
  else
    fail "Ada versi Node hardcoded di workflow — pakai 'node-version-file: .nvmrc'"
    echo "$HARDCODED" | sed 's/^/    /'
  fi
else
  fail "Direktori $WORKFLOW_DIR tidak ada"
fi

# ─── Summary ─────────────────────────────────────────────────────────
echo ""
echo "=== Summary ==="
if [ "$ERRORS" -eq 0 ]; then
  echo -e "${GREEN}All checks passed!${NC}"
  exit 0
else
  echo -e "${RED}$ERRORS check(s) failed!${NC}"
  exit 1
fi
