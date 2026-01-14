'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { classPresets } from '@/lib/design-tokens';
import { toast } from 'sonner';

export function GeneralSettings() {
    return (
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>Profile Information</CardTitle>
                    <CardDescription>
                        Update your account's profile information and email address.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">Name</Label>
                        <Input id="name" placeholder="Your name" defaultValue="PolyFlow Admin" className={classPresets.inputDefault} />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" placeholder="Email address" defaultValue="admin@polyflow.app" className={classPresets.inputDefault} />
                    </div>
                    <div className="flex justify-end">
                        <Button
                            className={classPresets.buttonPrimary}
                            onClick={() => toast.success('Profile updated')}
                        >
                            Save Changes
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card className="h-fit">
                <CardHeader>
                    <CardTitle>Appearance</CardTitle>
                    <CardDescription>
                        Customize the look and feel of the application.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="space-y-0.5">
                            <h3 className="text-base font-medium">Theme Preferences</h3>
                            <p className="text-sm text-muted-foreground">
                                Toggle between light and dark modes.
                            </p>
                        </div>
                        <Button variant="outline" className={classPresets.buttonOutline} disabled>
                            Managed via ThemeProvider
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
