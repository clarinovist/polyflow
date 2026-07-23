import { useMemo } from "react";
import {
  resolveSourceLocationId,
  resolveOutputLocationId,
  isInactiveLocation,
  isRiskyOutputLocation,
  type LocationLike,
  type ProductionStage,
} from "@/lib/locations/resolve-location";

interface UseCreateSpkDefaultsArgs {
  locations: LocationLike[];
  stage: ProductionStage;
  isMaklon: boolean;
}

interface UseCreateSpkDefaultsReturn {
  /** Default source location for material stock check */
  sourceLocationId: string;
  /** Default output/staging location for the WO */
  outputLocationId: string;
  /** Active (non-inactive) locations for select dropdowns */
  activeLocations: LocationLike[];
  /** Whether the given output location is risky */
  isRiskyOutput: (locationId: string | undefined) => boolean;
  /** Whether the given output location matches the recommended default */
  isRecommendedOutput: (locationId: string | undefined) => boolean;
}

export function useCreateSpkDefaults({
  locations,
  stage,
  isMaklon,
}: UseCreateSpkDefaultsArgs): UseCreateSpkDefaultsReturn {
  const sourceLocationId = useMemo(
    () => resolveSourceLocationId(locations, stage, isMaklon),
    [locations, stage, isMaklon],
  );

  const outputLocationId = useMemo(
    () => resolveOutputLocationId(locations, stage, isMaklon),
    [locations, stage, isMaklon],
  );

  const activeLocations = useMemo(
    () => locations.filter((l) => !isInactiveLocation(l)),
    [locations],
  );

  const isRiskyOutput = (locationId: string | undefined): boolean => {
    if (!locationId) return true;
    const loc = locations.find((l) => l.id === locationId);
    return isRiskyOutputLocation(loc);
  };

  const isRecommendedOutput = (locationId: string | undefined): boolean => {
    if (!locationId || !outputLocationId) return false;
    return locationId === outputLocationId;
  };

  return {
    sourceLocationId,
    outputLocationId,
    activeLocations,
    isRiskyOutput,
    isRecommendedOutput,
  };
}
