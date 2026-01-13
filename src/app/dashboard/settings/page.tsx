import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings as SettingsIcon } from 'lucide-react';

export default function SettingsPage() {
    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-foreground">Settings</h1>
                <p className="text-muted-foreground mt-2">Manage your system preferences</p>
            </div>

            <Card className="max-w-2xl">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <SettingsIcon className="h-5 w-5" />
                        System Configuration
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground italic">
                        Settings configuration will be available in the next phase (Phase 2).
                    </p>
                    <div className="pt-4 border-t border-border">
                        <div className="grid grid-cols-2 gap-4 py-2">
                            <span className="text-sm font-medium text-foreground">ERP Version</span>
                            <span className="text-sm text-muted-foreground text-right">0.1.5-beta</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 py-2">
                            <span className="text-sm font-medium text-foreground">Environment</span>
                            <span className="text-sm text-muted-foreground text-right">Development</span>
                        </div>
                    </div>
                </CardContent>
            </Card>


        </div >
    );
}
