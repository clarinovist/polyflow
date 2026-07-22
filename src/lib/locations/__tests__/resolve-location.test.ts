import { describe, expect, it } from "vitest";
import {
  isInactiveLocation,
  isRiskyOutputLocation,
  locationMatchesRole,
  resolveLocationByRole,
  resolveOutputLocationId,
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

  it("Melindo packing: source FG, output packaging", () => {
    expect(resolveSourceLocationId(melindo, "packing")).toBe("fg-m");
    expect(resolveOutputLocationId(melindo, "packing")).toBe("pack-m");
  });
});

describe("resolveTransferSourceLocationId", () => {
  it("maps BOM category to source role", () => {
    expect(resolveTransferSourceLocationId(melindo, "MIXING")).toBe("rm-m");
    expect(resolveTransferSourceLocationId(melindo, "EXTRUSION")).toBe("wip-m");
  });
});

describe("isRiskyOutputLocation", () => {
  it("flags RM and inactive as risky for WO output", () => {
    expect(isRiskyOutputLocation(melindo[0])).toBe(true); // RM
    expect(isRiskyOutputLocation(melindo[5])).toBe(true); // inactive
    expect(isRiskyOutputLocation(melindo[1])).toBe(false); // WIP
    expect(isRiskyOutputLocation(kiyowo[1])).toBe(false); // mixing area
  });
});
