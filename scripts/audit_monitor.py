#!/usr/bin/env python3
"""
PolyFlow Audit Log Monitor
Menghasilkan laporan harian/mingguan penggunaan fitur dari table AuditLog.
Tidak butuh psycopg2 — jalan via docker exec psql.
"""

import subprocess
import sys
from datetime import datetime, timedelta, timezone

# --- config ----------------------------------------------------------------
CONTAINER  = "polyflow-db"
DB_USER    = "polyflow"
DB_NAME    = "polyflow"
DB_PASS    = ""  # kosong = trust auth / pgpass
REPORT_TYPE = sys.argv[1] if len(sys.argv) > 1 else "daily"  # daily | weekly

def psql(query: str) -> list[dict]:
    """Jalankan SQL via docker exec psql, return list of dict."""
    cmd = [
        "docker", "exec", CONTAINER,
        "psql", "-U", DB_USER, "-d", DB_NAME,
        "--no-align", "--field-separator=|",
        "-c", query
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        print(f"[ERROR] psql failed: {result.stderr.strip()}", file=sys.stderr)
        return []
    raw = result.stdout.strip()
    if not raw:
        return []
    lines = [l.strip() for l in raw.splitlines() if l.strip()]
    if not lines:
        return []
    # psql unaligned output:
    #   line[0] = header
    #   line[1] = separator "----+----" (may be absent for single-value results)
    #   line[2+] = data rows
    #   last line may be "(N rows)" footer
    headers = [h.strip() for h in lines[0].split("|")]
    rows = []
    for line in lines[1:]:
        # skip separator
        if set(line) <= set("-+"):
            continue
        # skip "(N rows)" footer
        if line.startswith("(") and "row" in line:
            continue
        vals = [v.strip() for v in line.split("|")]
        if len(vals) == len(headers):
            rows.append(dict(zip(headers, vals)))
    return rows


def psql_single(query: str) -> dict:
    rows = psql(query)
    return rows[0] if rows else {}


def bar(pct: float, width: int = 20) -> str:
    filled = int(width * pct / 100)
    return "█" * filled + "░" * (width - filled)


def get_range():
    now = datetime.now(timezone.utc)
    if REPORT_TYPE == "weekly":
        start = now - timedelta(days=7)
        label = f"Weekly ({start.strftime('%Y-%m-%d')} → {now.strftime('%Y-%m-%d')})"
    else:
        start = now - timedelta(days=1)
        label = f"Daily ({start.strftime('%Y-%m-%d')} → {now.strftime('%Y-%m-%d')})"
    start_s = start.strftime("%Y-%m-%d %H:%M:%S")
    end_s   = now.strftime("%Y-%m-%d %H:%M:%S")
    return start_s, end_s, label


def main():
    start, end, label = get_range()
    B = "─" * 72
    out = []
    L = out.append

    # -- helper to add empty line
    def blank(): out.append("")

    # ── 1. Overall ──────────────────────────────────────────────
    ov = psql_single(f"""
        SELECT COUNT(*) AS total, COUNT(DISTINCT "userId") AS users
        FROM "AuditLog"
        WHERE "createdAt" BETWEEN '{start}' AND '{end}'
    """)
    total = int(ov.get("total", 0))
    users = int(ov.get("users", 0))

    L(f"📊 PolyFlow Feature Usage Report — {label}")
    L(f"   Total actions: {total} | Unique users: {users}")
    blank()
    blank()
    if total == 0:
        L("   (tidak ada aktivitas di periode ini)")
        report = "\n".join(out)
        print(report)
        return report

    # ── 2. Top actions ──────────────────────────────────────────
    actions = psql(f"""
        SELECT "action", "entityType", COUNT(*) AS cnt
        FROM "AuditLog"
        WHERE "createdAt" BETWEEN '{start}' AND '{end}'
        GROUP BY "action", "entityType"
        ORDER BY cnt DESC
        LIMIT 25
    """)
    max_a = int(actions[0]["cnt"]) if actions else 1

    L(B)
    L("  TOP ACTIONS BY FEATURE")
    L(B)
    for i, r in enumerate(actions, 1):
        cnt = int(r["cnt"])
        pct = cnt / max_a * 100
        L(f"  {i:2}. {r['action']:<36} {r['entityType']:<18} {cnt:>4}  {bar(pct)}")

    # ── 3. Per-user ─────────────────────────────────────────────
    users_rows = psql(f"""
        SELECT u.name, u.email, u.role, COUNT(a.id) AS actions
        FROM "AuditLog" a
        JOIN "User" u ON a."userId" = u.id
        WHERE a."createdAt" BETWEEN '{start}' AND '{end}'
        GROUP BY u.name, u.email, u.role
        ORDER BY actions DESC
    """)
    max_u = int(users_rows[0]["actions"]) if users_rows else 1

    blank()
    L(B)
    L("  PER-USER ACTIVITY")
    L(B)
    for r in users_rows:
        cnt = int(r["actions"])
        pct = cnt / max_u * 100
        L(f"  {r['name']:<26} {r['role']:<10} {cnt:>5} actions  {bar(pct, 16)}")

    # ── 4. Daily trend ──────────────────────────────────────────
    trend = psql(f"""
        SELECT DATE("createdAt") AS day, COUNT(*) AS cnt
        FROM "AuditLog"
        WHERE "createdAt" BETWEEN '{start}' AND '{end}'
        GROUP BY DATE("createdAt")
        ORDER BY day
    """)
    max_t = max(int(r["cnt"]) for r in trend) if trend else 1

    blank()
    L(B)
    L("  DAILY TREND")
    L(B)
    for r in trend:
        cnt = int(r["cnt"])
        pct = cnt / max_t * 100
        L(f"  {r['day']}  {cnt:>4}  {bar(pct)}")

    # ── 5. Inactive features ────────────────────────────────────
    all_ever = psql("""
        SELECT DISTINCT "action", "entityType" FROM "AuditLog"
    """)
    active_set = {(r["action"], r["entityType"]) for r in actions}
    inactive = [r for r in all_ever if (r["action"], r["entityType"]) not in active_set]

    if inactive:
        blank()
        L(B)
        L(f"  ⚠️  INACTIVE FEATURES ({len(inactive)} tidak dipakai di periode ini)")
        L(B)
        by_entity: dict[str, list[str]] = {}
        for r in inactive:
            by_entity.setdefault(r["entityType"], []).append(r["action"])
        for et, acts in sorted(by_entity.items()):
            L(f"  • {et}")
            for a in sorted(acts):
                L(f"      - {a}")

    blank()
    L(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")

    report = "\n".join(out)
    print(report)
    return report


if __name__ == "__main__":
    main()
