'use client';

import { Construction } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PlaceholderPageProps {
    title: string;
    description: string;
    moduleName: string;
}

export function PlaceholderPage({ title, description, moduleName }: PlaceholderPageProps) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 space-y-6">
            <div className="bg-slate-100 p-6 rounded-full dark:bg-slate-800">
                <Construction className="h-12 w-12 text-slate-400" />
            </div>
            <div className="space-y-2 max-w-md">
                <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
                <p className="text-muted-foreground">{description}</p>
            </div>
            <div className="p-4 border rounded-lg bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-950/30 dark:border-orange-900 dark:text-orange-400">
                <p className="text-sm font-medium">
                    The <strong>{moduleName}</strong> module is currently under development.
                </p>
                <p className="text-xs mt-1 opacity-80">
                    Check back soon for updates.
                </p>
            </div>
            <Button variant="outline" onClick={() => window.history.back()}>
                Go Back
            </Button>
        </div>
    );
}
