#!/usr/bin/env python3
"""
Batch apply: Fix zero-cost production outputs in ONE transaction.
"""
import subprocess
import tempfile
import os

SSH_TARGET = 'root@173.249.28.105'

def run_sql(sql):
    with tempfile.NamedTemporaryFile(mode='w', suffix='.sql', delete=False) as f:
        f.write(sql)
        tmp = f.name
    try:
        cmd = 'cat ' + tmp + ' | ssh ' + SSH_TARGET + ' "docker exec -i polyflow-db psql -U polyflow -d polyflow -t -A"'
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
        return r.stdout.strip()
    finally:
        os.unlink(tmp)

def parse_rows(text):
    rows = []
    for line in text.strip().split('\n'):
        if line.strip():
            rows.append(line.split('|'))
    return rows

def main():
    print("Step 1: Querying data...")

    rows = parse_rows(run_sql("""
SELECT sm."id", sm."productVariantId", sm."quantity"::text, sm."toLocationId",
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
    """))
    print("  Found " + str(len(rows)) + " zero-cost movements")

    # Cost basis
    cost_basis = {}
    for r in rows:
        vid = r[1]
        if vid not in cost_basis:
            sc, bp, pr = float(r[4]), float(r[5]), float(r[6])
            cost_basis[vid] = sc or bp or pr

    # BOM fallback
    zero_vids = [v for v, c in cost_basis.items() if c == 0]
    if zero_vids:
        in_clause = "','".join(zero_vids)
        bom_text = run_sql(
            "SELECT b.\"productVariantId\", b.\"outputQuantity\"::text, "
            "bi.\"quantity\"::text, bi.\"scrapPercentage\"::text, "
            "COALESCE(pv.\"standardCost\"::text, '0'), "
            "COALESCE(pv.\"buyPrice\"::text, '0'), "
            "COALESCE(pv.\"price\"::text, '0') "
            "FROM \"Bom\" b JOIN \"BomItem\" bi ON bi.\"bomId\" = b.\"id\" "
            "JOIN \"ProductVariant\" pv ON bi.\"productVariantId\" = pv.\"id\" "
            "WHERE b.\"productVariantId\" IN ('" + in_clause + "') AND b.\"isDefault\" = true"
        )
        bom_totals, bom_outputs = {}, {}
        for br in parse_rows(bom_text):
            vid = br[0]
            bom_outputs[vid] = float(br[1]) if br[1] else 1
            qty, scrap = float(br[2]), float(br[3]) or 0
            ic = float(br[4]) or float(br[5]) or float(br[6])
            bom_totals[vid] = bom_totals.get(vid, 0) + ic * qty * (1 + scrap / 100)
        for vid in zero_vids:
            if vid in bom_totals and bom_outputs.get(vid, 0) > 0:
                cost_basis[vid] = bom_totals[vid] / bom_outputs[vid]

    # All movements
    affected_vids = [v for v, c in cost_basis.items() if c > 0]
    in_clause = "','".join(affected_vids)
    mv_text = run_sql(
        "SELECT sm.\"productVariantId\", sm.\"type\", sm.\"quantity\"::text, "
        "COALESCE(sm.\"cost\"::text, '0'), sm.\"toLocationId\", sm.\"fromLocationId\", "
        "sm.\"createdAt\"::text, sm.\"id\" "
        "FROM \"StockMovement\" sm "
        "WHERE sm.\"productVariantId\" IN ('" + in_clause + "') "
        "ORDER BY sm.\"productVariantId\", sm.\"createdAt\", sm.\"id\""
    )
    all_mvs = parse_rows(mv_text)
    print("  Loaded " + str(len(all_mvs)) + " movements")

    mv_by_vid = {}
    for m in all_mvs:
        mv_by_vid.setdefault(m[0], []).append(m)

    # Replay
    print("\nStep 2: Replaying movements...")
    sql_updates = []
    fixed = 0
    inv_updates = 0

    for vid in affected_vids:
        mvs = mv_by_vid.get(vid, [])
        fallback = cost_basis[vid]
        locs = {}

        for m in mvs:
            mtype = m[1]
            qty = float(m[2])
            cost = float(m[3])
            to_loc = m[4]
            from_loc = m[5]
            mid = m[7]

            if mtype == 'IN' and cost == 0 and fallback > 0:
                cost = fallback
                sql_updates.append(
                    "UPDATE \"StockMovement\" SET \"cost\" = " + str(cost) + " WHERE \"id\" = '" + mid + "';"
                )
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
                    if from_loc and from_loc in locs and locs[from_loc][0] > 0:
                        t_cost = locs[from_loc][1] / locs[from_loc][0]
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
                avg = data[1] / data[0]
                sql_updates.append(
                    "UPDATE \"Inventory\" SET \"averageCost\" = " + str(avg) +
                    " WHERE \"productVariantId\" = '" + vid +
                    "' AND \"locationId\" = '" + loc_id + "';"
                )
                inv_updates += 1

    print("  " + str(fixed) + " cost updates, " + str(inv_updates) + " inventory updates")

    # Execute in ONE transaction
    print("\nStep 3: Executing in single transaction...")
    sql_script = "BEGIN;\n"
    for s in sql_updates:
        sql_script += s + "\n"
    sql_script += "COMMIT;\n"

    with tempfile.NamedTemporaryFile(mode='w', suffix='.sql', delete=False) as f:
        f.write(sql_script)
        tmp = f.name

    try:
        cmd = 'cat ' + tmp + ' | ssh ' + SSH_TARGET + ' "docker exec -i polyflow-db psql -U polyflow -d polyflow"'
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=120)
        if r.returncode != 0:
            print("ERROR: " + r.stderr[-500:])
        else:
            print("SUCCESS! " + str(fixed) + " movement costs + " + str(inv_updates) + " inventory avgCosts updated.")
    finally:
        os.unlink(tmp)

if __name__ == '__main__':
    main()
