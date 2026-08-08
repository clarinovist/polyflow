'use client';

import { useEffect, useRef, useState } from 'react';
import { Map, MapPin } from 'lucide-react';

export type RouteMapCustomer = {
    id: string;
    name: string;
    code: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    sortOrder: number;
};

type RouteMapPreviewProps = {
    customers: RouteMapCustomer[];
    height?: number;
    /** Stop yang sedang di-highlight (mis. dipilih dari RouteStopList). */
    selectedStopId?: string | null;
};

type LeafletModule = {
    default: typeof import('leaflet');
};

function createNumberIcon(
    L: typeof import('leaflet'),
    num: number,
    isSelected: boolean,
) {
    const size = isSelected ? 34 : 28;
    const bg = isSelected ? '#dc2626' : '#2563eb';
    return L.divIcon({
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)">${num}</div>`,
    });
}

export function RouteMapPreview({
    customers,
    height = 400,
    selectedStopId = null,
}: RouteMapPreviewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<import('leaflet').Map | null>(null);
    const overlayRef = useRef<import('leaflet').LayerGroup | null>(null);
    const LRef = useRef<typeof import('leaflet') | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [tileError, setTileError] = useState(false);

    const validCustomers = customers.filter(
        (c) =>
            c.latitude != null &&
            c.longitude != null &&
            Number.isFinite(c.latitude) &&
            Number.isFinite(c.longitude) &&
            c.latitude >= -90 &&
            c.latitude <= 90 &&
            c.longitude >= -180 &&
            c.longitude <= 180,
    );

    // Initialize map once — always render container
    useEffect(() => {
        let cancelled = false;

        async function init() {
            if (!containerRef.current || mapRef.current) return;

            let L: typeof import('leaflet');
            try {
                const mod = (await import('leaflet')) as LeafletModule;
                L = mod.default;
            } catch {
                if (!cancelled) setLoadError(true);
                return;
            }

            if (cancelled || !containerRef.current) return;

            LRef.current = L;

            const map = L.map(containerRef.current, {
                center: [-2.5, 118],
                zoom: 5,
                zoomControl: true,
                attributionControl: true,
            });

            const tileLayer = L.tileLayer(
                'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                {
                    attribution:
                        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
                    maxZoom: 19,
                },
            );

            tileLayer.on('tileerror', () => {
                if (!cancelled) setTileError(true);
            });

            tileLayer.addTo(map);

            // Overlay layer for markers + polyline only (never touches tiles)
            const overlay = L.layerGroup().addTo(map);
            overlayRef.current = overlay;

            mapRef.current = map;
        }

        init();

        return () => {
            cancelled = true;
        };
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, []);

    // Update markers/polyline when validCustomers change
    useEffect(() => {
        const overlay = overlayRef.current;
        const L = LRef.current;
        if (!overlay || !L) return;

        overlay.clearLayers();

        if (validCustomers.length === 0) return;

        const latLngs: ReturnType<typeof L.latLng>[] = [];

        for (const c of validCustomers) {
            const latLng = L.latLng(c.latitude!, c.longitude!);
            latLngs.push(latLng);

            const marker = L.marker(latLng, {
                icon: createNumberIcon(L, c.sortOrder, c.id === selectedStopId),
                zIndexOffset: c.id === selectedStopId ? 1000 : 0,
            });

            const nameDiv = document.createElement('div');
            nameDiv.style.fontWeight = '600';
            nameDiv.style.fontSize = '13px';
            nameDiv.textContent = c.name;

            const codeDiv = document.createElement('div');
            codeDiv.style.fontSize = '11px';
            codeDiv.style.color = '#666';
            codeDiv.textContent = c.code || '-';

            const cityDiv = document.createElement('div');
            cityDiv.style.fontSize = '11px';
            cityDiv.style.color = '#666';
            cityDiv.textContent = c.city || '';

            const popupDiv = document.createElement('div');
            popupDiv.appendChild(nameDiv);
            popupDiv.appendChild(codeDiv);
            if (c.city) popupDiv.appendChild(cityDiv);

            marker.bindPopup(popupDiv);
            overlay.addLayer(marker);
        }

        if (latLngs.length >= 2) {
            const polyline = L.polyline(latLngs, {
                color: '#2563eb',
                weight: 3,
                opacity: 0.7,
                dashArray: '6 4',
            });
            overlay.addLayer(polyline);

            const map = mapRef.current;
            if (map) {
                map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
            }
        } else if (latLngs.length === 1) {
            const map = mapRef.current;
            if (map) {
                map.setView(latLngs[0], 13);
            }
        }
    }, [validCustomers, selectedStopId]);

    const showEmpty = customers.length === 0;
    const showNoGps = customers.length > 0 && validCustomers.length === 0;
    const showOverlay = showEmpty || showNoGps;

    return (
        <div
            className="rounded-lg border overflow-hidden relative"
            style={{ height }}
        >
            {loadError ? (
                <div className="flex items-center justify-center bg-muted/30 h-full">
                    <div className="flex flex-col items-center gap-2 text-destructive">
                        <Map className="h-8 w-8" />
                        <p className="text-xs text-center px-4">
                            Basemap tidak tersedia; urutan rute tetap bisa
                            diedit
                        </p>
                    </div>
                </div>
            ) : (
                <>
                    <div
                        ref={containerRef}
                        style={{ height: '100%', width: '100%' }}
                    />
                    {showOverlay && (
                        <div className="absolute inset-0 flex items-center justify-center bg-muted/30 pointer-events-none z-[400]">
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <MapPin className="h-8 w-8 opacity-50" />
                                <p className="text-xs text-center px-4">
                                    {showEmpty
                                        ? 'Pilih customer untuk melihat peta'
                                        : 'Belum ada customer dengan koordinat valid'}
                                </p>
                            </div>
                        </div>
                    )}
                    {tileError && !showOverlay && (
                        <div className="absolute top-2 right-2 z-[500] bg-yellow-50 border border-yellow-300 rounded px-2 py-1 text-[10px] text-yellow-800 shadow-sm">
                            Beberapa tile gagal dimuat
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
