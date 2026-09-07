import { useEffect, useState } from 'react';
import { getRealtimeStock } from '@/actions/inventory/inventory';
import type { MaterialRequirement } from './use-bom-material-preview';

type MaterialInfo = Record<string, Omit<MaterialRequirement, 'requiredQty'>>;
type Source = readonly [string, string];
type Location = { id: string; name: string };

async function checkSourceStocks(
    sources: Source[],
): Promise<Record<string, number>> {
    const values = await Promise.all(
        sources.map(async ([id, location]) => {
            if (!location)
                throw new Error('Pilih gudang asal untuk setiap bahan.');
            const result = await getRealtimeStock(location, id);
            if (
                !result.success ||
                typeof result.data !== 'number' ||
                !Number.isFinite(result.data)
            ) {
                throw new Error(
                    'Gagal memeriksa stok. Coba lagi sebelum membuat SPK.',
                );
            }
            return [id, result.data] as const;
        }),
    );
    return Object.fromEntries(values);
}

function withSourceStocks(
    sources: Source[],
    base: MaterialInfo,
    stock: Record<string, number>,
    locations: Location[],
): MaterialInfo {
    return Object.fromEntries(
        sources.map(([id, locationId]) => [
            id,
            {
                ...base[id],
                sourceLocationId: locationId,
                sourceLocationName:
                    locations.find((l) => l.id === locationId)?.name || '',
                currentStock: stock[id] ?? 0,
                totalStock: stock[id] ?? 0,
            },
        ]),
    );
}

export function useDirectMaterialSources({
    enabled,
    bomId,
    items,
    materialInfo,
    locations,
}: {
    enabled: boolean;
    bomId: string;
    items: { productVariantId: string; quantity: number }[];
    materialInfo: MaterialInfo;
    locations: Location[];
}) {
    const [overrides, setOverrides] = useState<{
        bomId: string;
        values: Record<string, string>;
    }>({ bomId: '', values: {} });
    const [revision, setRevision] = useState(0);
    const [checks, setChecks] = useState<{
        key: string;
        stock: Record<string, number>;
        error: string | null;
    }>({ key: '', stock: {}, error: null });
    const sources = items.map((item): Source => {
        const chosen =
            (overrides.bomId === bomId
                ? overrides.values[item.productVariantId]
                : undefined) ??
            materialInfo[item.productVariantId]?.sourceLocationId ??
            '';
        return [
            item.productVariantId,
            locations.some((l) => l.id === chosen) ? chosen : '',
        ];
    });
    const key = JSON.stringify([bomId, revision, sources]);
    useEffect(() => {
        if (!enabled) return;
        let active = true;
        const entries = (JSON.parse(key) as [string, number, Source[]])[2];
        checkSourceStocks(entries)
            .then((stock) => {
                if (active) setChecks({ key, stock, error: null });
            })
            .catch((error: unknown) => {
                if (active)
                    setChecks({
                        key,
                        stock: {},
                        error:
                            error instanceof Error
                                ? error.message
                                : 'Gagal memeriksa stok.',
                    });
            });
        return () => {
            active = false;
        };
    }, [key, enabled]);
    const pending = enabled && checks.key !== key;
    const error = enabled && checks.key === key ? checks.error : null;
    return {
        materialInfo: enabled
            ? withSourceStocks(
                  sources,
                  materialInfo,
                  checks.key === key ? checks.stock : {},
                  locations,
              )
            : materialInfo,
        pending,
        error,
        ready:
            !enabled ||
            (items.length > 0 &&
                sources.every(([, location]) => !!location) &&
                !pending &&
                !error),
        setSource: (id: string, location: string) =>
            setOverrides((prev) => ({
                bomId,
                values: {
                    ...(prev.bomId === bomId ? prev.values : {}),
                    [id]: location,
                },
            })),
        retry: () => setRevision((value) => value + 1),
    };
}