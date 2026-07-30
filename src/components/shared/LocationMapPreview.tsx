'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { isValidCoord } from '@/lib/utils/maps';

type LeafletModule = {
    default: typeof import('leaflet');
};

type Props = {
    latitude: number;
    longitude: number;
    radiusMeters?: number | null;
    label?: string;
    height?: number;
    zoom?: number;
    interactive?: boolean;
    secondaryMarker?: { latitude: number; longitude: number; label?: string } | null;
};

function createPinIcon(L: typeof import('leaflet'), label?: string, color = '#2563eb') {
    const safeLabel = label ? `<span style="font-size:10px;color:#1e3a8a;font-weight:600">${label}</span>` : '';
    return L.divIcon({
        className: '',
        iconSize: [32, 38],
        iconAnchor: [16, 38],
        html: `<div style="display:flex;flex-direction:column;align-items:center"><div style="width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);color:#fff;font-size:14px;line-height:1">📍</span></div>${safeLabel}</div>`,
    });
}

export function LocationMapPreview({
    latitude,
    longitude,
    radiusMeters,
    label,
    height = 280,
    zoom = 16,
    interactive = true,
    secondaryMarker,
}: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<import('leaflet').Map | null>(null);
    const layerRef = useRef<import('leaflet').LayerGroup | null>(null);
    const LRef = useRef<typeof import('leaflet') | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [tileError, setTileError] = useState(false);

    const valid = isValidCoord(latitude, longitude);

    useEffect(() => {
        let cancelled = false;
        async function init() {
            if (!containerRef.current || mapRef.current || !valid) return;
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
                center: [latitude, longitude],
                zoom,
                zoomControl: interactive,
                attributionControl: true,
                dragging: interactive,
                scrollWheelZoom: interactive,
                doubleClickZoom: interactive,
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
            const layer = L.layerGroup().addTo(map);
            layerRef.current = layer;
            mapRef.current = map;
        }
        init();
        return () => {
            cancelled = true;
        };
    }, [valid, latitude, longitude, zoom, interactive]);

    useEffect(() => {
        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, []);

    const secondaryLat = secondaryMarker?.latitude;
    const secondaryLon = secondaryMarker?.longitude;
    const secondaryLabel = secondaryMarker?.label;

    useEffect(() => {
        const L = LRef.current;
        const layer = layerRef.current;
        const map = mapRef.current;
        if (!L || !layer || !map || !valid) return;

        layer.clearLayers();

        const ll = L.latLng(latitude, longitude);
        const secondaryLatLng =
            secondaryLat != null &&
            secondaryLon != null &&
            isValidCoord(secondaryLat, secondaryLon)
                ? L.latLng(secondaryLat, secondaryLon)
                : null;

        if (secondaryLatLng) {
            const bounds = L.latLngBounds([ll, secondaryLatLng]).pad(0.25);
            map.fitBounds(bounds);
        } else {
            map.setView(ll, zoom);
        }

        if (radiusMeters && Number.isFinite(radiusMeters) && radiusMeters > 0) {
            L.circle(ll, {
                radius: radiusMeters,
                color: '#2563eb',
                weight: 2,
                opacity: 0.6,
                fillColor: '#3b82f6',
                fillOpacity: 0.15,
            }).addTo(layer);
        }

        const marker = L.marker(ll, { icon: createPinIcon(L, label) });
        if (label) marker.bindPopup(label);
        layer.addLayer(marker);

        if (secondaryLatLng) {
            const secondaryIcon = createPinIcon(L, secondaryLabel, '#059669');
            const secondaryM = L.marker(secondaryLatLng, { icon: secondaryIcon });
            if (secondaryLabel) secondaryM.bindPopup(secondaryLabel);
            layer.addLayer(secondaryM);
        }

        setTimeout(() => map.invalidateSize(), 100);
    }, [
        latitude,
        longitude,
        radiusMeters,
        label,
        zoom,
        valid,
        secondaryLat,
        secondaryLon,
        secondaryLabel,
    ]);

    if (!valid) {
        return (
            <div
                className="rounded-lg border bg-muted/30 flex items-center justify-center text-muted-foreground"
                style={{ height }}
            >
                <div className="flex flex-col items-center gap-2 text-xs p-4 text-center">
                    <MapPin className="h-6 w-6 opacity-50" />
                    <span>Koordinat belum valid</span>
                </div>
            </div>
        );
    }

    if (loadError) {
        return (
            <div
                className="rounded-lg border bg-muted/30 flex items-center justify-center"
                style={{ height }}
            >
                <p className="text-xs text-destructive text-center px-4">
                    Map gagal dimuat
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-lg border overflow-hidden relative" style={{ height }}>
            <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
            {tileError && (
                <div className="absolute top-2 right-2 z-[500] bg-yellow-50 border border-yellow-300 rounded px-2 py-1 text-[10px] text-yellow-800 shadow-sm">
                    Beberapa tile gagal dimuat
                </div>
            )}
        </div>
    );
}
