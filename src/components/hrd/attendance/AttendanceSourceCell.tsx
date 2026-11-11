import { ExternalLink, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { googleMapsUrl } from '@/lib/utils/maps';
import {
    formatDistance,
    sourceBadgeClass,
    sourceLabel,
} from './attendance-format';
import type { AttendanceRecord } from './attendance-recap-types';

/** Sel "Sumber": badge sumber, jarak masuk, dan tautan peta lokasi masuk. */
export function AttendanceSourceCell({ record: r }: { record: AttendanceRecord }) {
    const hasCoordinates =
        r.clockInLatitude != null && r.clockInLongitude != null;
    return (
        <div className="flex flex-wrap items-center gap-1">
            <Badge
                variant="outline"
                className={`text-xs ${sourceBadgeClass(r.source)}`}
            >
                {sourceLabel(r.source)}
            </Badge>
            {r.clockInDistance != null && r.clockInDistance > 0 && (
                <span className="text-[10px] text-muted-foreground">
                    {formatDistance(r.clockInDistance)}
                </span>
            )}
            {hasCoordinates && (
                <a
                    href={googleMapsUrl(r.clockInLatitude!, r.clockInLongitude!)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline ml-1"
                    title={`${r.clockInLatitude}, ${r.clockInLongitude}`}
                >
                    <MapPin className="h-3 w-3" />
                    <ExternalLink className="h-2.5 w-2.5" />
                </a>
            )}
        </div>
    );
}
