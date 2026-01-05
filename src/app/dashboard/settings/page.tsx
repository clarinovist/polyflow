import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings as SettingsIcon, Clock } from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
    return (
        <div className="p-8 space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
                <p className="text-slate-600 mt-2">Manage your system preferences</p>
            </div>

            <Card className="max-w-2xl">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <SettingsIcon className="h-5 w-5" />
                        System Configuration
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-slate-500 italic">
                        Settings configuration will be available in the next phase (Phase 2).
                    </p>
                    <div className="pt-4 border-t border-slate-100">
                        <div className="grid grid-cols-2 gap-4 py-2">
                            <span className="text-sm font-medium text-slate-700">ERP Version</span>
                            <span className="text-sm text-slate-500 text-right">0.1.5-beta</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 py-2">
                            <span className="text-sm font-medium text-slate-700">Environment</span>
                            <span className="text-sm text-slate-500 text-right">Development</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="max-w-2xl hover:bg-slate-50 transition-colors cursor-pointer group">
                <Link href="/dashboard/settings/shifts">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 group-hover:text-blue-600 transition-colors">
                            <Clock className="h-5 w-5" />
                            Shift Management
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-slate-500">
                            Configure standard work shifts and durations for production planning.
                        </p>
                    </CardContent>
                </Link>
            </Card>
        </div >
    );
}
