#!/usr/bin/env bash
# PolyFlow — R2 orphan-object garbage collector (dry-run by default).
#
# Finds objects in the upload bucket that no database row references, and only
# deletes them when you pass --apply. Backups and archives are never touched,
# and objects younger than --min-age-days are kept so an in-flight upload cannot
# be collected before its database row is written.
#
#   ./scripts/r2-gc.sh                        # laporan saja
#   ./scripts/r2-gc.sh --min-age-days 30      # laporan, ambang lebih konservatif
#   ./scripts/r2-gc.sh --apply --list-out /tmp/orphans.txt
#
# Needs: docker (polyflow-db), awscli, python3, and S3_* credentials in ~/polyflow/.env.
# Run on the production host; deliberately NOT wired into cron yet.

set -euo pipefail

APPLY=0
MIN_AGE_DAYS=14
LIST_OUT=""
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

while [ $# -gt 0 ]; do
    case "$1" in
        --apply) APPLY=1 ;;
        --min-age-days) MIN_AGE_DAYS="${2:?}"; shift ;;
        --list-out) LIST_OUT="${2:?}"; shift ;;
        -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
        *) echo "Unknown argument: $1" >&2; exit 1 ;;
    esac
    shift
done

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ENV_FILE="${ENV_FILE:-$HOME/polyflow/.env}"

set -a
# shellcheck disable=SC1090
eval "$(grep -E "^S3_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|BUCKET|ENDPOINT|REGION)=" "$ENV_FILE")"
set +a
export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="${S3_REGION:-auto}"

AWS_CLI="${AWS_CLI:-$(command -v aws || echo /snap/bin/aws)}"

echo "[$(date '+%F %T')] listing objects in $S3_BUCKET"
"$AWS_CLI" s3 ls "s3://$S3_BUCKET/" --recursive --endpoint-url "$S3_ENDPOINT" \
    | awk '{ if (NF < 4) next; ts=$1"T"$2"Z"; size=$3; $1=$2=$3=""; sub(/^ +/, ""); print $0"\t"size"\t"ts }' \
    > "$WORKDIR/objects.tsv"

echo "[$(date '+%F %T')] collecting database references"
bash "$SCRIPT_DIR/r2-refs.sh" > "$WORKDIR/refs.tsv"

python3 - "$WORKDIR/objects.tsv" "$WORKDIR/refs.tsv" "$MIN_AGE_DAYS" "$WORKDIR/orphans.txt" <<'PY'
import sys, datetime as dt

objects_path, refs_path, min_age_days, out_path = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=min_age_days)).strftime("%Y-%m-%dT%H:%M:%SZ")

objects = {}
for line in open(objects_path):
    if not line.strip():
        continue
    key, size, ts = line.rstrip("\n").split("\t")
    objects[key] = (int(size), ts)

referenced = set()
for line in open(refs_path):
    if not line.strip():
        continue
    value = line.rstrip("\n").split("\t")[2]
    if "/api/images/" in value:
        referenced.add(value.split("/api/images/", 1)[1])

orphans, protected = [], 0
for key, (size, ts) in objects.items():
    if key in referenced:
        continue
    # Backups and archives are never garbage collected here.
    if "/backups/" in key or key.startswith(("backups/", "archive/")):
        continue
    if ts >= cutoff:
        protected += 1
        continue
    orphans.append((key, size, ts))

orphans.sort()
with open(out_path, "w") as fh:
    fh.write("".join(f"{k}\n" for k, _, _ in orphans))

total = sum(size for _, size, _ in orphans)
print(f"objek       : {len(objects):,}")
print(f"referensi DB: {len(referenced):,}")
print(f"orphan      : {len(orphans):,} objek / {total/1e6:.1f} MB")
print(f"dilindungi  : {protected:,} objek yatim berumur < {min_age_days} hari")
for prefix in sorted({"/".join(k.split("/")[:2]) for k, _, _ in orphans}):
    n = sum(1 for k, _, _ in orphans if "/".join(k.split("/")[:2]) == prefix)
    b = sum(s for k, s, _ in orphans if "/".join(k.split("/")[:2]) == prefix)
    print(f"  {prefix:<32}{n:>6} obj {b/1e6:>9.1f} MB")
PY

if [ -n "$LIST_OUT" ]; then
    cp "$WORKDIR/orphans.txt" "$LIST_OUT"
    echo "daftar orphan: $LIST_OUT"
fi

if [ "$APPLY" -eq 0 ]; then
    echo "DRY RUN — tidak ada yang dihapus. Jalankan ulang dengan --apply untuk menghapus."
    exit 0
fi

TOTAL=$(wc -l < "$WORKDIR/orphans.txt" | tr -d ' ')
[ "$TOTAL" -gt 0 ] || { echo "Tidak ada orphan untuk dihapus."; exit 0; }

if grep -qE '(^|/)(backups|archive)/' "$WORKDIR/orphans.txt"; then
    echo "REFUSED: daftar berisi path backup/archive" >&2
    exit 1
fi

echo "[$(date '+%F %T')] menghapus $TOTAL objek"
python3 - "$WORKDIR/orphans.txt" "$WORKDIR" <<'PY'
import json, sys
keys = [line.rstrip("\n") for line in open(sys.argv[1]) if line.strip()]
for i in range(0, len(keys), 500):
    json.dump({"Objects": [{"Key": k} for k in keys[i:i+500]], "Quiet": False},
              open(f"{sys.argv[2]}/batch_{i//500}.json", "w"))
PY

deleted=0; errors=0
for f in "$WORKDIR"/batch_*.json; do
    out=$("$AWS_CLI" s3api delete-objects --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT" \
          --delete "file://$f" --output json 2>&1)
    d=$(printf '%s' "$out" | grep -o '"Key"' | wc -l | tr -d ' ')
    e=$(printf '%s' "$out" | grep -c '"Code"' || true)
    echo "  $(basename "$f"): deleted=$d errors=$e"
    deleted=$((deleted + d)); errors=$((errors + e))
done

echo "TOTAL deleted=$deleted errors=$errors"
[ "$errors" -eq 0 ]
