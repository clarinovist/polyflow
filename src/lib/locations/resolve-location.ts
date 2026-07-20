/**
 * Tenant-aware location resolution.
 *
 * Canonical tenants (Kiyowo) use WAREHOUSE_SLUGS (rm_warehouse, mixing_area, …).
 * Melindo-style tenants use Indonesian slugs + locationPurpose
 * (gudang-bahan-baku / RAW_MATERIAL, gudang-wip-intermediate / WIP, …).
 *
 * Resolve order:
 * 1. Canonical + known alias slugs (skip inactive)
 * 2. locationPurpose candidates (skip inactive)
 * 3. null (caller decides final fallback)
 */

import {
  MAKLON_STAGE_SLUGS,
  WAREHOUSE_SLUGS,
} from "@/lib/constants/locations";

export type LocationLike = {
  id: string;
  name: string;
  slug: string;
  locationPurpose?: string | null;
};

/** Logical warehouse roles used by production / inventory flows */
export type LocationRole =
  | "RAW_MATERIAL"
  | "MIXING"
  | "WIP"
  | "FINISHED_GOOD"
  | "PACKING"
  | "SCRAP"
  | "CUSTOMER_OWNED";

export type ProductionStage = "mixing" | "extrusion" | "packing" | "rework";

/** Known slug aliases across tenants (canonical first) */
const ROLE_SLUGS: Record<LocationRole, readonly string[]> = {
  RAW_MATERIAL: [
    WAREHOUSE_SLUGS.RAW_MATERIAL,
    "gudang-bahan-baku",
    "gudang-utama", // legacy Melindo active name if ever restored
  ],
  MIXING: [WAREHOUSE_SLUGS.MIXING, "mixing_warehouse", "gudang-mixing"],
  WIP: [WAREHOUSE_SLUGS.WIP_STORAGE, "gudang-wip-intermediate", "gudang-wip"],
  FINISHED_GOOD: [
    WAREHOUSE_SLUGS.FINISHING,
    "gudang-barang-jadi",
    "gudang-fg",
  ],
  PACKING: [
    WAREHOUSE_SLUGS.PACKING_AREA,
    "gudang-packaging",
    "gudang-packing",
  ],
  SCRAP: [WAREHOUSE_SLUGS.SCRAP, "gudang-scrap"],
  CUSTOMER_OWNED: [WAREHOUSE_SLUGS.CUSTOMER_OWNED],
};

/** Purpose fallbacks when slug miss (priority order) */
const ROLE_PURPOSES: Record<LocationRole, readonly string[]> = {
  RAW_MATERIAL: ["RAW_MATERIAL"],
  MIXING: ["MIXING", "WIP"], // Melindo has no MIXING purpose → WIP
  WIP: ["WIP", "MIXING"],
  FINISHED_GOOD: ["FINISHED_GOOD"],
  PACKING: ["PACKING", "FINISHED_GOOD"],
  SCRAP: ["SCRAP"],
  CUSTOMER_OWNED: [], // rely on slug / type elsewhere
};

export function isInactiveLocation(loc: LocationLike): boolean {
  const slug = (loc.slug || "").toLowerCase();
  const name = (loc.name || "").toLowerCase();
  return (
    slug.startsWith("inactive-") ||
    slug.includes("nonaktif") ||
    name.includes("[nonaktif]") ||
    name.startsWith("nonaktif")
  );
}

/**
 * Output locations that are risky for WO staging (RM warehouse or inactive).
 * Used for create-SPK guardrails and transfer destination warnings.
 */
export function isRiskyOutputLocation(loc: LocationLike | null | undefined): boolean {
  if (!loc) return true;
  if (isInactiveLocation(loc)) return true;
  if (loc.locationPurpose === "RAW_MATERIAL") return true;
  const slug = (loc.slug || "").toLowerCase();
  if (
    slug === WAREHOUSE_SLUGS.RAW_MATERIAL ||
    slug === "gudang-bahan-baku" ||
    slug.includes("bahan-baku")
  ) {
    return true;
  }
  return false;
}

export function stageLabelId(stage: ProductionStage): string {
  if (stage === "mixing") return "Mixing (Adonan)";
  if (stage === "extrusion") return "Extrusion";
  if (stage === "packing") return "Packing";
  return "Rework";
}

/** Human-readable default output role for a stage (for form hints). */
export function recommendedOutputHint(stage: ProductionStage): string {
  if (stage === "mixing") return "Gudang WIP / Mixing Area";
  if (stage === "extrusion") return "Gudang Barang Jadi (FG)";
  if (stage === "packing") return "Packing Area / FG";
  return "Gudang Barang Jadi (FG)";
}

function activeLocations(locations: LocationLike[]): LocationLike[] {
  return locations.filter((l) => !isInactiveLocation(l));
}

/**
 * Resolve a single logical role to a location id.
 */
export function resolveLocationByRole(
  locations: LocationLike[],
  role: LocationRole,
): LocationLike | null {
  const active = activeLocations(locations);
  if (active.length === 0) return null;

  for (const slug of ROLE_SLUGS[role] || []) {
    const hit = active.find((l) => l.slug === slug);
    if (hit) return hit;
  }

  for (const purpose of ROLE_PURPOSES[role] || []) {
    const hit = active.find((l) => l.locationPurpose === purpose);
    if (hit) return hit;
  }

  return null;
}

export function resolveLocationIdByRole(
  locations: LocationLike[],
  role: LocationRole,
): string {
  return resolveLocationByRole(locations, role)?.id || "";
}

/**
 * Material *source* default for a production stage (where stock is taken from).
 */
export function resolveSourceLocationId(
  locations: LocationLike[],
  stage: ProductionStage,
  isMaklon = false,
): string {
  if (!isMaklon) {
    if (stage === "mixing") {
      return resolveLocationIdByRole(locations, "RAW_MATERIAL");
    }
    if (stage === "extrusion") {
      return (
        resolveLocationIdByRole(locations, "MIXING") ||
        resolveLocationIdByRole(locations, "WIP")
      );
    }
    if (stage === "packing" || stage === "rework") {
      return resolveLocationIdByRole(locations, "FINISHED_GOOD");
    }
    return "";
  }

  // Maklon: prefer stage slugs, then purpose
  const bySlug = (slug: string) =>
    activeLocations(locations).find((l) => l.slug === slug)?.id || "";

  if (stage === "mixing") {
    return (
      bySlug(MAKLON_STAGE_SLUGS.RAW_MATERIAL) ||
      resolveLocationIdByRole(locations, "CUSTOMER_OWNED") ||
      resolveLocationIdByRole(locations, "RAW_MATERIAL")
    );
  }
  if (stage === "extrusion") {
    return (
      bySlug(MAKLON_STAGE_SLUGS.WIP) ||
      bySlug(MAKLON_STAGE_SLUGS.RAW_MATERIAL) ||
      resolveLocationIdByRole(locations, "CUSTOMER_OWNED") ||
      resolveLocationIdByRole(locations, "WIP") ||
      resolveLocationIdByRole(locations, "MIXING")
    );
  }
  if (stage === "packing" || stage === "rework") {
    return (
      bySlug(MAKLON_STAGE_SLUGS.FINISHED_GOOD) ||
      bySlug(MAKLON_STAGE_SLUGS.WIP) ||
      resolveLocationIdByRole(locations, "CUSTOMER_OWNED") ||
      resolveLocationIdByRole(locations, "FINISHED_GOOD")
    );
  }
  return "";
}

/**
 * Output / WO *destination* default for a production stage.
 * MIXING → mixing area or WIP (never RM).
 */
export function resolveOutputLocationId(
  locations: LocationLike[],
  stage: ProductionStage,
  isMaklon = false,
): string {
  if (!isMaklon) {
    if (stage === "mixing") {
      return (
        resolveLocationIdByRole(locations, "MIXING") ||
        resolveLocationIdByRole(locations, "WIP")
      );
    }
    if (stage === "extrusion") {
      return resolveLocationIdByRole(locations, "FINISHED_GOOD");
    }
    if (stage === "packing") {
      return (
        resolveLocationIdByRole(locations, "PACKING") ||
        resolveLocationIdByRole(locations, "FINISHED_GOOD")
      );
    }
    if (stage === "rework") {
      return resolveLocationIdByRole(locations, "FINISHED_GOOD");
    }
    return "";
  }

  const bySlug = (slug: string) =>
    activeLocations(locations).find((l) => l.slug === slug)?.id || "";

  if (stage === "mixing") {
    return (
      bySlug(MAKLON_STAGE_SLUGS.WIP) ||
      resolveLocationIdByRole(locations, "WIP") ||
      resolveLocationIdByRole(locations, "MIXING")
    );
  }
  if (stage === "extrusion") {
    return (
      bySlug(MAKLON_STAGE_SLUGS.FINISHED_GOOD) ||
      resolveLocationIdByRole(locations, "FINISHED_GOOD")
    );
  }
  if (stage === "packing") {
    return (
      bySlug(MAKLON_STAGE_SLUGS.PACKING) ||
      resolveLocationIdByRole(locations, "PACKING") ||
      resolveLocationIdByRole(locations, "FINISHED_GOOD")
    );
  }
  if (stage === "rework") {
    return (
      bySlug(MAKLON_STAGE_SLUGS.FINISHED_GOOD) ||
      resolveLocationIdByRole(locations, "FINISHED_GOOD")
    );
  }
  return "";
}

/** Map BOM / machine category strings to ProductionStage */
export function stageFromBomCategory(
  category: string | null | undefined,
): ProductionStage {
  const c = (category || "").toUpperCase();
  if (c === "EXTRUSION") return "extrusion";
  if (c === "PACKING") return "packing";
  if (c === "REWORK") return "rework";
  return "mixing";
}

/**
 * Transfer-dialog default *source* for an order category
 * (same semantics as BatchIssueMaterialDialog defaults).
 */
export function resolveTransferSourceLocationId(
  locations: LocationLike[],
  bomCategory: string | null | undefined,
  fallbackId?: string | null,
): string {
  const stage = stageFromBomCategory(bomCategory);
  const id = resolveSourceLocationId(locations, stage, false);
  if (id) return id;
  if (fallbackId && locations.some((l) => l.id === fallbackId && !isInactiveLocation(l))) {
    return fallbackId;
  }
  return activeLocations(locations)[0]?.id || locations[0]?.id || "";
}
