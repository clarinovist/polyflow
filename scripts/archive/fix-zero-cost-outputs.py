#!/usr/bin/env python3
"""
Re-sync: Fix production output movements with cost=0
and recalculate inventory.averageCost for affected variants.

Run: python3 scripts/fix-zero-cost-outputs.py --dry-run
Then: python3 scripts/fix-zero-cost-outputs.py --apply
"""
import sys
import argparse
import subprocess
import tempfile
import os

SSH_TARGET = 'root@173.249.28.105'

def run_sql(sql):
    """Run SQL via SSH using heredoc to avoid escaping issues."""
    # Write SQL to temp file, cat it through SSH
    with tempfile.NamedTemporaryFile(mode='w', suffix='.sql', delete=False) as f:
        f.write(sql)
        tmp_path = f.name

    try:
        cmd = (
            f'cat {tmp_path} | ssh {SSH_TARGET} '
            f'"docker exec -i polyflow-db psql -U polyflow -d polyflow -t -A -F \\"|\\""'
        )
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
        if r.returncode != 0:
            print(f"SQL ERROR: {r.stderr.strip()}", file=sys.stderr)
            return []
        rows = []
        for line in r.stdout.strip().split('\n'):
            if line.strip():
                rows.append(line.split('|'))
        return rows
    finally:
        os.unlink(tmp_path)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    dry_run = not args.apply

    print(f"Mode: {'DRY RUN' if dry_run else 'APPLY'}")
    print("=" * 70)

    # Step 1: Find zero-cost production outputs + variant cost basis
    rows = run_sql("""
SELECT sm."id", sm."productVariantId", sm."quantity"::text, sm."toLocationId",
       pv."skuCode", pv."name",
       COALESCE(pv."standardCost"::text, '0'),
       COALESCE(pv."buyPrice"::text, '0'),
       COALESCE(pv."price"::text, '0')
FROM "StockMovement" sm
JOIN "ProductVariant" pv ON sm."productVariantId" = pv."id"
WHERE sm."type" = 'IN'
  AND sm."productionOrderId" IS NOT NULL
  AND sm."reference" LIKE 'Production Output%'
  AND (sm."cost" IS NULL OR sm."cost"::numeric = 0)
  AND sm."quantity"::numeric > 0
ORDER BY sm."productVariantId", sm."createdAt"
    """)
    print(f"Found {len(rows)} zero-cost production output movements\n")

    if not rows:
        print("Nothing to fix.")
        return

    # Build cost basis map
    cost_basis = {}
    for r in rows:
        vid = r[1]
        if vid not in cost_basis:
            sc, bp, pr = float(r[6]), float(r[7]), float(r[8])
            cost_basis[vid] = sc or bp or pr

    # Step 2: BOM costs for variants with no cost basis
    zero_vids = [v for v, c in cost_basis.items() if c == 0]
    if zero_vids:
        in_clause = "','".join(zero_vids)
        bom_rows = run_sql(f"""
SELECT b."productVariantId", b."outputQuantity"::text,
       bi."quantity"::text, bi."scrapPercentage"::text,
       COALESCE(pv."standardCost"::text, '0'),
       COALESCE(pv."buyPrice"::text, '0'),
       COALESCE(pv."price"::text, '0')
FROM "Bom" b
JOIN "BomItem" bi ON bi."bomId" = b."id"
JOIN "ProductVariant" pv ON bi."productVariantId" = pv."id"
WHERE b."productVariantId" IN ('{in_clause}')
  AND b."isDefault" = true
        """)
        bom_totals, bom_outputs = {}, {}
        for br in bom_rows:
            vid = br[0]
            bom_outputs[vid] = float(br[1]) if br[1] else 1
            qty, scrap = float(br[2]), float(br[3]) or 0
            ic = float(br[4]) or float(br[5]) or float(br[6])
            bom_totals[vid] = bom_totals.get(vid, 0) + ic * qty * (1 + scrap / 100)
        for vid in zero_vids:
            if vid in bom_totals and bom_outputs.get(vid, 0) > 0:
                cost_basis[vid] = bom_totals[vid] / bom_outputs[vid]

    # Step 3: ALL movements for affected variants
    affected_vids = [v for v, c in cost_basis.items() if c > 0]
    in_clause = "','".join(affected_vids)
    all_mvs = run_sql(f"""
SELECT sm."productVariantId", sm."type", sm."quantity"::text,
       COALESCE(sm."cost"::text, '0'), sm."toLocationId", sm."fromLocationId",
       sm."createdAt"::text, sm."id"
FROM "StockMovement" sm
WHERE sm."productVariantId" IN ('{in_clause}')
ORDER BY sm."productVariantId", sm."createdAt", sm."id"
    """)
    print(f"Loaded {len(all_mvs)} movements for {len(affected_vids)} variants\n")

    mv_by_vid = {}
    for m in all_mvs:
        mv_by_vid.setdefault(m[0], []).append(m)

    # Step 4: Replay
    movement_updates = []
    inventory_updates = []

    for vid in affected_vids:
        mvs = mv_by_vid.get(vid, [])
        fallback = cost_basis[vid]
        sku = next((r[4] for r in rows if r[1] == vid), vid[:8])
        name = next((r[5] for r in rows if r[1] == vid), '?')

        locs = {}
        fixed = 0

        for m in mvs:
            _, mtype, qty_s, cost_s, to_loc, from_loc, _, mid = m
            qty, cost = float(qty_s), float(cost_s)

            if mtype == 'IN' and cost == 0 and fallback > 0:
                cost = fallback
                movement_updates.append((mid, cost))
                fixed += 1

            if mtype == 'IN' and to_loc:
                loc = locs.setdefault(to_loc, [0.0, 0.0])
                loc[0] += qty
                if cost > 0:
                    loc[1] += qty * cost

            elif mtype == 'OUT' and from_loc:
                loc = locs.setdefault(from_loc, [0.0, 0.0])
                if loc[0] > 0:
                    avg = loc[1] / loc[0]
                    loc[1] = max(0, loc[1] - qty * avg)
                    loc[0] = max(0, loc[0] - qty)

            elif mtype == 'TRANSFER':
                if from_loc:
                    src = locs.setdefault(from_loc, [0.0, 0.0])
                    if src[0] > 0:
                        avg = src[1] / src[0]
                        src[1] = max(0, src[1] - qty * avg)
                        src[0] = max(0, src[0] - qty)
                if to_loc:
                    dst = locs.setdefault(to_loc, [0.0, 0.0])
                    t_cost = cost if cost > 0 else 0
                    if from_loc and from_loc in locs:
                        src = locs[from_loc]
                        if src[0] > 0:
                            t_cost = src[1] / src[0]
                    dst[0] += qty
                    dst[1] += qty * t_cost

            elif mtype == 'ADJUSTMENT' and to_loc:
                loc = locs.setdefault(to_loc, [0.0, 0.0])
                loc[0] = qty
                loc[1] = qty * cost if cost > 0 else 0

            elif mtype == 'PURCHASE' and to_loc:
                loc = locs.setdefault(to_loc, [0.0, 0.0])
                loc[0] += qty
                if cost > 0:
                    loc[1] += qty * cost

        for loc_id, data in locs.items():
            if data[0] > 0 and data[1] > 0:
                inventory_updates.append((vid, loc_id, data[1] / data[0]))

        if fixed > 0:
            print(f"  {sku} ({name}): {fixed} movements -> cost={fallback:,.2f}")

    print(f"\n{'=' * 70}")
    print(f"Total: {len(movement_updates)} movement cost updates, "
          f"{len(inventory_updates)} inventory avgCost updates")

    if dry_run:
        print("\n[DRY RUN] Run with --apply to execute.")
        return

    # Step 5: Apply
    print("\nApplying...")
    for mid, cost in movement_updates:
        run_sql(f"UPDATE \"StockMovement\" SET \"cost\" = {cost} WHERE \"id\" = '{mid}'")
    for vid, loc_id, avg in inventory_updates:
        run_sql(f"UPDATE \"Inventory\" SET \"averageCost\" = {avg} WHERE \"productVariantId\" = '{vid}' AND \"locationId\" = '{loc_id}'")
    print("Done!")

if __name__ == '__main__':
    main()
