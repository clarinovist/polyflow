'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/layout/theme-provider';
import { cn } from '@/lib/utils/utils';
import { Sun, Moon, Monitor } from 'lucide-react';

const OPTIONS = [
    { value: 'light' as const, label: 'Terang', icon: Sun },
    { value: 'dark' as const, label: 'Gelap', icon: Moon },
    { value: 'system' as const, label: 'Sistem', icon: Monitor },
];

export function ThemeSettings() {
    const { theme, setTheme } = useTheme();

    return (
        <Card className="flex flex-col">
            <CardHeader>
                <CardTitle>Tampilan</CardTitle>
                <CardDescription>
                    Sesuaikan tampilan dan nuansa aplikasi.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="space-y-0.5">
                        <h3 className="text-base font-medium">Preferensi Tema</h3>
                        <p className="text-sm text-muted-foreground">
                            Beralih antara mode terang, gelap, atau ikuti sistem.
                        </p>
                    </div>
                    <div className="flex gap-1">
                        {OPTIONS.map((opt) => (
                            <Button
                                key={opt.value}
                                type="button"
                                variant="outline"
                                size="sm"
                                className={cn(
                                    theme === opt.value && 'bg-muted border-primary'
                                )}
                                onClick={() => setTheme(opt.value)}
                                aria-pressed={theme === opt.value}
                            >
                                <opt.icon className="h-4 w-4 mr-1.5" />
                                {opt.label}
                            </Button>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
