'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Cell
} from 'recharts';

interface HourlyData {
  hour: number;
  today: number;
  avg7d: number;
}

interface HourlyOutputChartProps {
  data: HourlyData[];
}

// Simple custom tooltip to match polyflow premium dark theme
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 p-3 shadow-xl backdrop-blur-sm text-xs">
        <p className="font-bold text-zinc-950 dark:text-zinc-50 mb-1.5">{payload[0].payload.timeString}</p>
        <div className="space-y-1">
          <p className="text-primary font-medium flex justify-between gap-4">
            <span>Hari Ini:</span>
            <span className="font-mono font-bold">{Number(payload[0].value).toLocaleString('id-ID')} unit</span>
          </p>
          {payload[1] && (
            <p className="text-muted-foreground flex justify-between gap-4">
              <span>Rerata 7 Hari:</span>
              <span className="font-mono font-bold">{Number(payload[1].value).toFixed(1)} unit</span>
            </p>
          )}
        </div>
      </div>
    );
  }
  return null;
};

const BUSINESS_TZ = 'Asia/Jakarta';
function getCurrentWibHour() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TZ, hour: 'numeric', hour12: false }).formatToParts(new Date());
  const v = parts.find((p) => p.type === 'hour')?.value;
  return v ? parseInt(v, 10) % 24 : new Date().getHours();
}

export function HourlyOutputChart({ data }: HourlyOutputChartProps) {
  const currentHour = getCurrentWibHour();

  const chartData = data.map((d) => ({
    ...d,
    timeString: `${String(d.hour).padStart(2, '0')}:00`,
  }));

  return (
    <Card className="col-span-4 shadow-sm bg-card/65 backdrop-blur-sm border">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4">
        <div>
          <CardTitle className="text-lg font-bold tracking-tight">Tren Output Per Jam</CardTitle>
          <CardDescription>Visualisasi run-rate hari ini dibandingkan dengan rata-rata 7 hari terakhir.</CardDescription>
        </div>
        <div className="flex items-center gap-4 mt-2 sm:mt-0 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-primary" />
            <span className="font-medium">Hari Ini</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 border-t border-dashed border-muted-foreground" />
            <span className="font-medium text-muted-foreground">Rerata 7 Hari</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
            >
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
                tickFormatter={(value) => `${value}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="today" radius={[4, 4, 0, 0]} fill="hsl(var(--primary))" fillOpacity={0.45}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.hour === currentHour ? 'hsl(var(--primary))' : 'hsl(var(--primary))'}
                    fillOpacity={entry.hour === currentHour ? 1 : 0.45}
                    className={entry.hour === currentHour ? 'animate-pulse' : undefined}
                  />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="avg7d"
                stroke="#888888"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                activeDot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
