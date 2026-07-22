#!/usr/bin/env bash
# check-agents-consistency.sh — Validate AGENTS.md consistency across polyflow
# Run: bash scripts/check-agents-consistency.sh
# Pre-commit: auto-runs when AGENTS.md files change

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ERRORS=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; ERRORS=$((ERRORS + 1)); }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }

echo "=== AGENTS.md Consistency Check ==="
echo ""

# ─── A1: All action modules have AGENTS.md ───────────────────────────
echo "A1: Checking action modules have AGENTS.md..."

ACTION_MODULES=(
  "src/actions/finance"
  "src/actions/inventory"
  "src/actions/production"
  "src/actions/sales"
  "src/actions/purchasing"
  "src/actions/hrd"
)

for module in "${ACTION_MODULES[@]}"; do
  if [ -f "$REPO_ROOT/$module/AGENTS.md" ]; then
    pass "$module/AGENTS.md exists"
  else
    fail "$module/AGENTS.md MISSING"
  fi
done

# ─── A2: Service and lib modules have AGENTS.md ─────────────────────
echo ""
echo "A2: Checking service/lib modules have AGENTS.md..."

LIB_MODULES=(
  "src/services"
  "src/lib"
)

for module in "${LIB_MODULES[@]}"; do
  if [ -f "$REPO_ROOT/$module/AGENTS.md" ]; then
    pass "$module/AGENTS.md exists"
  else
    fail "$module/AGENTS.md MISSING"
  fi
done

# ─── A3: Root AGENTS.md has Context Routing section ─────────────────
echo ""
echo "A3: Checking root AGENTS.md has Context Routing..."

ROOT_AGENTS="$REPO_ROOT/.agents/AGENTS.md"
if [ -f "$ROOT_AGENTS" ]; then
  if grep -q "## Context Routing" "$ROOT_AGENTS"; then
    pass "Root AGENTS.md has 'Context Routing' section"
  else
    fail "Root AGENTS.md MISSING 'Context Routing' section"
  fi
  
  if grep -q "## Common Pitfalls" "$ROOT_AGENTS"; then
    pass "Root AGENTS.md has 'Common Pitfalls' section"
  else
    fail "Root AGENTS.md MISSING 'Common Pitfalls' section"
  fi
  
  if grep -q "## Architecture Overview" "$ROOT_AGENTS"; then
    pass "Root AGENTS.md has 'Architecture Overview' section"
  else
    fail "Root AGENTS.md MISSING 'Architecture Overview' section"
  fi
else
  fail "Root AGENTS.md NOT FOUND at $ROOT_AGENTS"
fi

# ─── A4: Count consistency ───────────────────────────────────────────
echo ""
echo "A4: Counting AGENTS.md files..."

TOTAL_AGENTS=$(find "$REPO_ROOT/src" -name "AGENTS.md" | wc -l | tr -d ' ')
EXPECTED=8  # 6 action modules + services + lib

if [ "$TOTAL_AGENTS" -eq "$EXPECTED" ]; then
  pass "AGENTS.md count matches expected ($EXPECTED)"
else
  fail "AGENTS.md count mismatch: found $TOTAL_AGENTS, expected $EXPECTED"
fi

# ─── A5: Root AGENTS.md references match actual files ────────────────
echo ""
echo "A5: Checking root AGENTS.md references..."

# Extract module references from Context Routing table
for module in "${ACTION_MODULES[@]}" "${LIB_MODULES[@]}"; do
  module_name=$(basename "$module")
  if grep -q "$module_name/AGENTS.md" "$ROOT_AGENTS"; then
    pass "Root references $module_name/AGENTS.md"
  else
    warn "Root does not reference $module_name/AGENTS.md (may be intentional)"
  fi
done

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
