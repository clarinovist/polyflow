import { describe, expect, it } from "vitest";
import {
  isInactiveLocation,
  isPackagingSuppliesWarehouse,
  isRiskyOutputLocation,
  locationMatchesRole,
  resolveLocationByRole,
  resolveLocationIdByRole,
  resolveMaterialConsumptionLocationId,
  resolveMaterialSourceLocationId,
  resolveOutputLocationId,
  resolvePackagingSuppliesLocationId,
  resolvePackingProcessLocation,
  resolveSourceLocationId,
  resolveTransferSourceLocationId,
  type LocationLike,
} from "../resolve-location";

const kiyowo: LocationLike[] = [
  { id: "rm", name: "Raw Material Warehouse", slug: "rm_warehouse", locationPurpose: "RAW_MATERIAL" },
  { id: "mix", name: "Mixing Area", slug: "mixing_area", locationPurpose: "MIXING" },
  { id: "wip", name: "WIP Storage", slug: "wip_storage", locationPurpose: "WIP" },
  { id: "fg", name: "Finished Goods Warehouse", slug: "fg_warehouse", locationPurpose: "FINISHED_GOOD" },
  { id: "pack", name: "Packing Area", slug: "packing_area", locationPurpose: "PACKING" },
];

const melindo: LocationLike[] = [
  { id: "rm-m", name: "Gudang Bahan Baku", slug: "gudang-bahan-baku", locationPurpose: "RAW_MATERIAL" },
  { id: "wip-m", name: "Gudang WIP & Intermediate", slug: "gudang-wip-intermediate", locationPurpose: "WIP" },
  { id: "fg-m", name: "Gudang Barang Jadi & Hasil Produksi", slug: "gudang-barang-jadi", locationPurpose: "FINISHED_GOOD" },
  { id: "pack-m", name: "Gudang Bahan Pembantu & Pengemas", slug: "gudang-packaging", locationPurpose: "PACKING" },
  { id: "scrap-m", name: "Gudang Scrap / Afval", slug: "gudang-scrap", locationPurpose: "SCRAP" },
  {
    id: "dead",
    name: "[NONAKTIF] Gudang Utama",
    slug: "inactive-gudang-utama",
    locationPurpose: "FINISHED_GOOD",
  },
];

describe("isInactiveLocation", () => {
  it("detects inactive slug and name markers", () => {
    expect(isInactiveLocation(melindo[5])).toBe(true);
    expect(isInactiveLocation(melindo[0])).toBe(false);
  });
});

describe("resolveLocationByRole — Kiyowo slugs", () => {
  it("resolves canonical slugs", () => {
    expect(resolveLocationByRole(kiyowo, "RAW_MATERIAL")?.id).toBe("rm");
    expect(resolveLocationByRole(kiyowo, "MIXING")?.id).toBe("mix");
    expect(resolveLocationByRole(kiyowo, "FINISHED_GOOD")?.id).toBe("fg");
  });
});

describe("resolveLocationByRole — Melindo purpose/alias", () => {
  it("resolves Indonesian slugs and purpose", () => {
    expect(resolveLocationByRole(melindo, "RAW_MATERIAL")?.id).toBe("rm-m");
    expect(resolveLocationByRole(melindo, "WIP")?.id).toBe("wip-m");
    expect(resolveLocationByRole(melindo, "FINISHED_GOOD")?.id).toBe("fg-m");
  });

  it("MIXING falls back to WIP when no mixing_area / MIXING purpose", () => {
    expect(resolveLocationByRole(melindo, "MIXING")?.id).toBe("wip-m");
  });

  it("never returns inactive locations when active purpose match exists", () => {
    expect(resolveLocationByRole(melindo, "FINISHED_GOOD")?.id).toBe("fg-m");
    expect(resolveLocationByRole(melindo, "FINISHED_GOOD")?.id).not.toBe("dead");
  });
});

describe("locationMatchesRole — multi-tenant RM filter", () => {
  it("matches Kiyowo rm_warehouse and Melindo gudang-bahan-baku", () => {
    expect(locationMatchesRole(kiyowo[0], "RAW_MATERIAL")).toBe(true);
    expect(locationMatchesRole(melindo[0], "RAW_MATERIAL")).toBe(true);
  });

  it("matches by locationPurpose RAW_MATERIAL", () => {
    expect(
      locationMatchesRole(
        { id: "x", name: "RM", slug: "custom-rm", locationPurpose: "RAW_MATERIAL" },
        "RAW_MATERIAL",
      ),
    ).toBe(true);
  });

  it("rejects WIP / FG / inactive as RAW_MATERIAL", () => {
    expect(locationMatchesRole(melindo[1], "RAW_MATERIAL")).toBe(false); // WIP
    expect(locationMatchesRole(melindo[2], "RAW_MATERIAL")).toBe(false); // FG
    expect(locationMatchesRole(melindo[5], "RAW_MATERIAL")).toBe(false); // inactive
  });
});

describe("resolveSourceLocationId / resolveOutputLocationId", () => {
  it("Kiyowo mixing: source RM, output mixing area", () => {
    expect(resolveSourceLocationId(kiyowo, "mixing")).toBe("rm");
    expect(resolveOutputLocationId(kiyowo, "mixing")).toBe("mix");
  });

  it("Melindo mixing: source RM, output WIP (not RM)", () => {
    expect(resolveSourceLocationId(melindo, "mixing")).toBe("rm-m");
    expect(resolveOutputLocationId(melindo, "mixing")).toBe("wip-m");
    expect(resolveOutputLocationId(melindo, "mixing")).not.toBe("rm-m");
  });

  it("Melindo extrusion: source WIP/mixing, output FG", () => {
    expect(resolveSourceLocationId(melindo, "extrusion")).toBe("wip-m");
    expect(resolveOutputLocationId(melindo, "extrusion")).toBe("fg-m");
  });

  it("Melindo packing: source FG, output FG (not supplies warehouse)", () => {
    expect(resolveSourceLocationId(melindo, "packing")).toBe("fg-m");
    // gudang-packaging is supplies-only — product output must land on FG
    expect(resolveOutputLocationId(melindo, "packing")).toBe("fg-m");
    expect(resolveOutputLocationId(melindo, "packing")).not.toBe("pack-m");
  });

  it("Kiyowo packing: source FG (rolls), output packing_area (bags)", () => {
    expect(resolveSourceLocationId(kiyowo, "packing")).toBe("fg");
    expect(resolveOutputLocationId(kiyowo, "packing")).toBe("pack");
  });
});

describe("isPackagingSuppliesWarehouse / packing process floor", () => {
  it("flags Melindo gudang-packaging as supplies, not Kiyowo packing_area", () => {
    expect(isPackagingSuppliesWarehouse(melindo[3])).toBe(true); // pack-m
    expect(isPackagingSuppliesWarehouse(kiyowo[4])).toBe(false); // pack
  });

  it("resolvePackingProcessLocation null for Melindo, set for Kiyowo", () => {
    expect(resolvePackingProcessLocation(melindo)).toBeNull();
    expect(resolvePackingProcessLocation(kiyowo)?.id).toBe("pack");
  });

  it("resolvePackagingSuppliesLocationId returns Melindo packaging warehouse", () => {
    expect(resolvePackagingSuppliesLocationId(melindo)).toBe("pack-m");
    expect(resolvePackagingSuppliesLocationId(kiyowo)).toBe("pack");
  });
});

describe("resolveTransferSourceLocationId", () => {
  it("maps BOM category to source role", () => {
    expect(resolveTransferSourceLocationId(melindo, "MIXING")).toBe("rm-m");
    expect(resolveTransferSourceLocationId(melindo, "EXTRUSION")).toBe("wip-m");
  });
});

// Mirrors tenant melindo_rafia production data (7 locations, exact slugs).
// bahan_baku_maklon is locationType CUSTOMER_OWNED / locationPurpose RAW_MATERIAL —
// locationType isn't part of LocationLike (resolver only sees slug + purpose),
// which is exactly why the tenant's alias slug must be whitelisted explicitly.
const melindoRafia: LocationLike[] = [
  { id: "maklon-m", name: "Bahan Baku Maklon", slug: "bahan_baku_maklon", locationPurpose: "RAW_MATERIAL" },
  { id: "atk-m", name: "Gudang ATK Kantor", slug: "gudang-atk-kantor", locationPurpose: "OPERATIONAL" },
  { id: "rm-m2", name: "Gudang Bahan Baku", slug: "gudang-bahan-baku", locationPurpose: "RAW_MATERIAL" },
  { id: "fg-m2", name: "Gudang Barang Jadi", slug: "gudang-barang-jadi", locationPurpose: "FINISHED_GOOD" },
  { id: "pack-m2", name: "Gudang Packaging", slug: "gudang-packaging", locationPurpose: "PACKING" },
  { id: "scrap-m2", name: "Gudang Scrap", slug: "gudang-scrap", locationPurpose: "SCRAP" },
  { id: "wip-m2", name: "Gudang WIP Intermediate", slug: "gudang-wip-intermediate", locationPurpose: "WIP" },
];

describe("resolveSourceLocationId / resolveLocationIdByRole — melindo_rafia CUSTOMER_OWNED alias", () => {
  it("maklon mixing source resolves to bahan_baku_maklon, not the internal RM warehouse", () => {
    expect(resolveSourceLocationId(melindoRafia, "mixing", true)).toBe("maklon-m");
    expect(resolveSourceLocationId(melindoRafia, "mixing", true)).not.toBe("rm-m2");
  });

  it("non-maklon mixing source is unaffected and still resolves to the internal RM warehouse", () => {
    expect(resolveSourceLocationId(melindoRafia, "mixing", false)).toBe("rm-m2");
  });

  it("resolveLocationIdByRole CUSTOMER_OWNED resolves to bahan_baku_maklon", () => {
    expect(resolveLocationIdByRole(melindoRafia, "CUSTOMER_OWNED")).toBe("maklon-m");
  });

  it("resolveLocationIdByRole RAW_MATERIAL still prefers the internal warehouse over the maklon location (slug wins before purpose)", () => {
    expect(resolveLocationIdByRole(melindoRafia, "RAW_MATERIAL")).toBe("rm-m2");
  });
});

describe("resolveMaterialConsumptionLocationId", () => {
  it("prefers the canonical WIP warehouse for mixing when several WIP-purpose locations exist", () => {
    const locations: LocationLike[] = [
      { id: "telukan", name: "Gudang Telukan", slug: "gudang_telukan", locationPurpose: "WIP" },
      { id: "wip", name: "Gudang WIP", slug: "gudang-wip-intermediate", locationPurpose: "WIP" },
      { id: "rm", name: "Gudang Bahan Baku", slug: "gudang-bahan-baku", locationPurpose: "RAW_MATERIAL" },
    ];

    expect(resolveMaterialConsumptionLocationId(locations, "mixing")).toBe("wip");
  });

  it("never selects raw-material, inactive, or supplies-only locations", () => {
    const locations: LocationLike[] = [
      { id: "rm", name: "Gudang Bahan Baku", slug: "gudang-bahan-baku", locationPurpose: "RAW_MATERIAL" },
      { id: "dead", name: "[NONAKTIF] Gudang WIP", slug: "inactive-gudang-wip", locationPurpose: "WIP" },
      { id: "pack", name: "Gudang Packaging", slug: "gudang-packaging", locationPurpose: "PACKING" },
    ];

    expect(resolveMaterialConsumptionLocationId(locations, "mixing")).toBe("");
  });
});

describe("isRiskyOutputLocation", () => {
  it("flags RM, inactive, and packaging supplies as risky for WO output", () => {
    expect(isRiskyOutputLocation(melindo[0])).toBe(true); // RM
    expect(isRiskyOutputLocation(melindo[5])).toBe(true); // inactive
    expect(isRiskyOutputLocation(melindo[3])).toBe(true); // packaging supplies
    expect(isRiskyOutputLocation(melindo[1])).toBe(false); // WIP
    expect(isRiskyOutputLocation(kiyowo[1])).toBe(false); // mixing area
    expect(isRiskyOutputLocation(kiyowo[4])).toBe(false); // packing floor OK
  });
});

describe("resolveMaterialSourceLocationId", () => {
  // Local fixture: Indonesian-slug layout with a dedicated supplies warehouse
  const idSlugs: LocationLike[] = [
    { id: "rm-i", name: "Gudang Bahan Baku", slug: "gudang-bahan-baku", locationPurpose: "RAW_MATERIAL" },
    { id: "wip-i", name: "Gudang WIP & Intermediate", slug: "gudang-wip-intermediate", locationPurpose: "WIP" },
    { id: "fg-i", name: "Gudang Barang Jadi", slug: "gudang-barang-jadi", locationPurpose: "FINISHED_GOOD" },
    { id: "pack-i", name: "Gudang Bahan Pembantu & Pengemas", slug: "gudang-packaging", locationPurpose: "PACKING" },
  ];

  it("routes packaging supplies to the pengemas warehouse, not raw material", () => {
    // Arrange
    const stageDefault = "fg-i";

    // Act
    const auxiliary = resolveMaterialSourceLocationId(idSlugs, "AUXILIARY", stageDefault);
    const packaging = resolveMaterialSourceLocationId(idSlugs, "PACKAGING", stageDefault);

    // Assert
    expect(auxiliary).toBe("pack-i");
    expect(packaging).toBe("pack-i");
  });

  it("routes half-finished batches to WIP so a mix can be re-consumed", () => {
    // Arrange
    const stageDefault = "rm-i";

    // Act
    const intermediate = resolveMaterialSourceLocationId(idSlugs, "INTERMEDIATE", stageDefault);
    const wip = resolveMaterialSourceLocationId(idSlugs, "WIP", stageDefault);

    // Assert
    expect(intermediate).toBe("wip-i");
    expect(wip).toBe("wip-i");
  });

  it("keeps raw material and finished goods on their own warehouses", () => {
    // Act & Assert
    expect(resolveMaterialSourceLocationId(idSlugs, "RAW_MATERIAL", "fg-i")).toBe("rm-i");
    expect(resolveMaterialSourceLocationId(idSlugs, "FINISHED_GOOD", "rm-i")).toBe("fg-i");
  });

  it("falls back to the stage default when the product type has no home", () => {
    // Act & Assert
    expect(resolveMaterialSourceLocationId(idSlugs, "SERVICE", "rm-i")).toBe("rm-i");
    expect(resolveMaterialSourceLocationId(idSlugs, null, "rm-i")).toBe("rm-i");
    expect(resolveMaterialSourceLocationId(idSlugs, undefined, "")).toBe("");
  });

  it("uses the packing floor on canonical tenants where supplies live there", () => {
    // Arrange — canonical slug layout: packing is a process floor, not a store
    const canonical: LocationLike[] = [
      { id: "rm-c", name: "Raw Material Warehouse", slug: "rm_warehouse", locationPurpose: "RAW_MATERIAL" },
      { id: "pack-c", name: "Packing Area", slug: "packing_area", locationPurpose: "PACKING" },
    ];

    // Act
    const result = resolveMaterialSourceLocationId(canonical, "AUXILIARY", "rm-c");

    // Assert
    expect(result).toBe("pack-c");
  });

  it("falls back rather than returning an inactive warehouse", () => {
    // Arrange — only an inactive FG warehouse exists
    const locations: LocationLike[] = [
      { id: "rm-x", name: "Gudang Bahan Baku", slug: "gudang-bahan-baku", locationPurpose: "RAW_MATERIAL" },
      { id: "dead-x", name: "[NONAKTIF] Gudang Barang Jadi", slug: "inactive-fg", locationPurpose: "FINISHED_GOOD" },
    ];

    // Act
    const result = resolveMaterialSourceLocationId(locations, "FINISHED_GOOD", "rm-x");

    // Assert
    expect(result).toBe("rm-x");
  });
});
