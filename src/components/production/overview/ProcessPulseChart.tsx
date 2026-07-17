'use client';

import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  Legend,
} from 'recharts';
type ProcessKey = 'MIXING' | 'EXTRUSION' | 'PACKING' | 'OTHER';
type TabKey = ProcessKey | 'ALL';

type HourlyPoint = { hour: number; today: number; avg7d: number };
type StackedPoint = {
  hour: number;
  MIXING: number;
  EXTRUSION: number;
  PACKING: number;
  OTHER: number;
};

interface ProcessPulseChartProps {
  tab: TabKey;
  processHourly?: HourlyPoint[];
  stackedHourly: StackedPoint[];
}

const BUSINESS_TZ = 'Asia/Jakarta';
function getCurrentWibHour() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TZ,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date());
  const v = parts.find((p) => p.type === 'hour')?.value;
  return v ? parseInt(v, 10) % 24 : new Date().getHours();
}

const PROCESS_COLORS: Record<ProcessKey, string> = {
  MIXING: '#8b7cf7',
  EXTRUSION: '#3dd68c',
  PACKING: '#5eb1ff',
  OTHER: '#8a97a8',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border bg-background/95 p-3 shadow-xl backdrop-blur-sm text-xs">
      <p className="font-bold mb-1.5">{label}</p>
      <div className="space-y-1">
        {payload.map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p: any) => (
            <p key={p.dataKey} className="flex justify-between gap-4" style={{ color: p.color || p.fill }}>
              <span>{p.name}:</span>
              <span className="font-mono font-bold">
                {Number(p.value).toLocaleString('id-ID', { maximumFractionDigits: 1 })}
              </span>
            </p>
          )
        )}
      </div>
    </div>
  );
};

export function ProcessPulseChart({
  tab,
  processHourly,
  stackedHourly,
}: ProcessPulseChartProps) {
  const currentHour = getCurrentWibHour();

  if (tab === 'ALL') {
    const chartData = stackedHourly.map((d) => ({
      ...d,
      timeString: `${String(d.hour).padStart(2, '0')}:00`,
    }));

    return (
      <Card className="shadow-sm bg-card/65 backdrop-blur-sm border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-bold tracking-tight">
            Semua proses — output dicatat per jam
          </CardTitle>
          <CardDescription>
            Stack visual per proses. Bandingkan share, bukan total ekonomi. Timestamp = waktu log kiosk.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <XAxis
                  dataKey="timeString"
                  stroke="#888888"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#888888"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="MIXING" name="Mixing" stackId="a" fill={PROCESS_COLORS.MIXING} />
                <Bar dataKey="EXTRUSION" name="Extrusion" stackId="a" fill={PROCESS_COLORS.EXTRUSION} />
                <Bar dataKey="PACKING" name="Packing" stackId="a" fill={PROCESS_COLORS.PACKING} />
                <Bar
                  dataKey="OTHER"
                  name="Lainnya"
                  stackId="a"
                  fill={PROCESS_COLORS.OTHER}
                  radius={[4, 4, 0, 0]}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    );
  }

  const color = PROCESS_COLORS[tab];
  const chartData = (processHourly ?? []).map((d) => ({
    ...d,
    timeString: `${String(d.hour).padStart(2, '0')}:00`,
  }));

  return (
    <Card className="shadow-sm bg-card/65 backdrop-blur-sm border">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 gap-2">
        <div>
          <CardTitle className="text-lg font-bold tracking-tight">
            {tab === 'OTHER' ? 'Lainnya' : tab} — output dicatat per jam
          </CardTitle>
          <CardDescription>
            Hari ini vs rerata 7 hari (proses yang sama). Bukan run-rate mesin.
          </CardDescription>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded" style={{ background: color }} />
            <span className="font-medium">Hari Ini</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 border-t border-dashed border-muted-foreground" />
            <span className="font-medium text-muted-foreground">Rerata 7 Hari</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <XAxis
                dataKey="timeString"
                stroke="#888888"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#888888"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="today" name="Hari ini" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={color}
                    fillOpacity={entry.hour === currentHour ? 1 : 0.45}
                  />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="avg7d"
                name="Rerata 7 hari"
                stroke="#888888"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                activeDot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 border border-dashed rounded-md px-2 py-1.5">
          Multi-log kiosk (8–9×/shift) bikin spike jam catat — normal. Bandingkan hanya dalam proses yang sama.
        </p>
      </CardContent>
    </Card>
  );
}
