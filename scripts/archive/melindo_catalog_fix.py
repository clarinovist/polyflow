#!/usr/bin/env python3
"""
Melindo Product Catalog Migration
Move misclassified items to OPERATIONAL product type
"""

import subprocess
import sys

# OPERATIONAL product ID (Barang Operasional)
OPERATIONAL_PRODUCT_ID = "699383de-070e-4adc-8a6d-1682d72b382e"

# Items to move from RAW_MATERIAL to OPERATIONAL
# These are Bahan Penolong / Office Supplies / Equipment
RAW_MATERIAL_TO_OPERATIONAL = [
    # Bahan Penolong (auxiliary materials)
    "AT222008",  # Cairan Pembersih
    "AT222011",  # Double Tape
    "AT222014",  # Gloves Sarung Tangan
    "AT222016",  # Isi Lakban
    "AT222017",  # Kabel Tis
    "AT222019",  # Kantong Plastik Bening
    "AT222021",  # Lakban Bening
    "AT222022",  # Lakban Coklat
    "AT222025",  # Masker
    "AT222032",  # Plastik Mika
    "AT222035",  # Sapu Tangan / Lap
    "AT222036",  # Selotip
    "AT222042",  # Tali Rafia
    "AT222045",  # Karung Goni
    "BP000001",  # Dispenser Isolasi / Lakban
    "BP000002",  # Isolasi Kecil
    "BP000003",  # ISOLASI/LAKBAN BENING 1"
    "BP000004",  # Isolasi/Lakban Bening 2"
    "BP000005",  # Jarum Jahit
    "BP000006",  # LEM ALTECO
    "BP000008",  # Refil Cutter/Silet Besar
    "BP000009",  # Refill Cutter Kecil
    "BP000011",  # Sarung Tangan
    "BP000013",  # Timbangan Digital
    "R2200000",  # SPIDOL PUTIH SNOWMAN
    "R2300000",  # BALLPOINT HITAM TECHNO
    "R2400000",  # KARET PENTIL
]

# Items to move from PACKAGING to OPERATIONAL
# These are Office Supplies / ATK
PACKAGING_TO_OPERATIONAL = [
    "AT222001",  # Amplop Gaji
    "AT222002",  # Amplop Surat
    "AT222003",  # Ballpoint Hitam
    "AT222004",  # Batteray Alkaline A2
    "AT222006",  # Binding Jilid Lakop Covers
    "AT222007",  # Busa Pembersih
    "AT222009",  # Clip Kertas
    "AT222010",  # Daftar Harga Sticker
    "AT222012",  # Eskpedisi Kwitansi
    "AT222013",  # FPN Pajak
    "AT222015",  # Gunting
    "AT222018",  # Kalkulator
    "AT222020",  # Kertas HVS
    "AT222023",  # Lem Kertas
    "AT222024",  # Map Kertas
    "AT222026",  # Nota Kontan
    "AT222027",  # Pembolong Kertas
    "AT222028",  # Pensil
    "AT222029",  # Penggaris
    "AT222030",  # Penghapus
    "AT222031",  # Perforator
    "AT222033",  # Rapido / Spidol
    "AT222034",  # Refil Tinta Stempel
    "AT222037",  # Spidol Whiteboard
    "AT222038",  # Stapler
    "AT222039",  # Stempel
    "AT222040",  # Steples
    "AT222041",  # Stopmap
    "AT222043",  # Tinta Stempel
    "AT222044",  # Tip Ex
]

# Naming fixes (SKU -> new name)
NAMING_FIXES = {
    # Case standardization
    "BP000003": "Isolasi/Lakban Bening 1\"",  # ISOLASI/LAKBAN BENING 1" -> Isolasi/Lakban Bening 1"
    "R2200000": "Spidol Putih Snowman",        # SPIDOL PUTIH SNOWMAN -> Spidol Putih Snowman
    "R2300000": "Ballpoint Hitam Techno",      # BALLPOINT HITAM TECHNO -> Ballpoint Hitam Techno
    "R2400000": "Karet Pentil",                # KARET PENTIL -> Karet Pentil
    "BP000006": "Lem Alteco",                  # LEM ALTECO -> Lem Alteco
    "BK121001": "Etiket Angsa",                # ETIKET ANGSA -> Etiket Angsa
}


def run_sql(sql: str) -> str:
    """Execute SQL on Melindo database via VPS"""
    cmd = f'cat << \'SQLEOF\' | ssh nugrohopramono \'docker exec -i polyflow-db psql -U polyflow -d melindo_rafia\'\n{sql}\nSQLEOF'
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        print(f"ERROR: {result.stderr}", file=sys.stderr)
        return result.stderr
    return result.stdout


def verify_before():
    """Verify current state before migration"""
    print("=== VERIFIKASI SEBELUM MIGRASI ===\n")
    
    sql = f"""
SELECT p."productType", COUNT(pv.id) as count
FROM "ProductVariant" pv
JOIN "Product" p ON pv."productId" = p.id
GROUP BY p."productType"
ORDER BY p."productType";
"""
    print("Distribusi productType saat ini:")
    print(run_sql(sql))
    
    # Count items to move
    all_skus = RAW_MATERIAL_TO_OPERATIONAL + PACKAGING_TO_OPERATIONAL
    sku_list = ", ".join([f"'{s}'" for s in all_skus])
    sql = f"""
SELECT COUNT(*) as total_to_move
FROM "ProductVariant"
WHERE "skuCode" IN ({sku_list});
"""
    print(f"Total item yang akan dipindahkan: {run_sql(sql)}")


def execute_migration():
    """Execute the migration"""
    print("\n=== EKSEKUSI MIGRASI ===\n")
    
    # Build UPDATE statement for all items to move
    all_skus = RAW_MATERIAL_TO_OPERATIONAL + PACKAGING_TO_OPERATIONAL
    sku_list = ", ".join([f"'{s}'" for s in all_skus])
    
    sql = f"""
-- Update productId to OPERATIONAL for all misclassified items
UPDATE "ProductVariant"
SET "productId" = '{OPERATIONAL_PRODUCT_ID}'
WHERE "skuCode" IN ({sku_list});
"""
    print("Menjalankan UPDATE...")
    result = run_sql(sql)
    print(result)
    
    # Apply naming fixes
    if NAMING_FIXES:
        print("\nMemperbaiki nama variant...")
        for sku, new_name in NAMING_FIXES.items():
            sql = f"""
UPDATE "ProductVariant"
SET name = '{new_name}'
WHERE "skuCode" = '{sku}';
"""
            result = run_sql(sql)
            if "UPDATE 1" in result:
                print(f"  ✓ {sku} -> {new_name}")
            else:
                print(f"  ✗ {sku} gagal")


def verify_after():
    """Verify state after migration"""
    print("\n=== VERIFIKASI SETELAH MIGRASI ===\n")
    
    sql = f"""
SELECT p."productType", COUNT(pv.id) as count
FROM "ProductVariant" pv
JOIN "Product" p ON pv."productId" = p.id
GROUP BY p."productType"
ORDER BY p."productType";
"""
    print("Distribusi productType setelah migrasi:")
    print(run_sql(sql))
    
    # Show OPERATIONAL items
    sql = f"""
SELECT pv.name, pv."skuCode", pv."primaryUnit"
FROM "ProductVariant" pv
WHERE pv."productId" = '{OPERATIONAL_PRODUCT_ID}'
ORDER BY pv.name;
"""
    print("\nSemua item di kategori OPERATIONAL:")
    print(run_sql(sql))


if __name__ == "__main__":
    print("MELINDO PRODUCT CATALOG MIGRATION")
    print("=" * 50)
    
    verify_before()
    
    response = input("\nLanjutkan migrasi? (y/n): ")
    if response.lower() != 'y':
        print("Dibatalkan.")
        sys.exit(0)
    
    execute_migration()
    verify_after()
    
    print("\n" + "=" * 50)
    print("MIGRASI SELESAI!")
