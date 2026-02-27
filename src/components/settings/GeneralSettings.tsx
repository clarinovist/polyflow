'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { toast } from 'sonner';

export function GeneralSettings({ tenantName, userName, userEmail }: { tenantName?: string, userName?: string, userEmail?: string }) {
    return (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <Card className="col-span-1 lg:col-span-2">
                <CardHeader>
                    <CardTitle>Active Organization / Tenant</CardTitle>
                    <CardDescription>
                        This shows which Database your session is currently connected to.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                        <div className="space-y-0.5">
                            <h3 className="text-base font-semibold text-primary">{tenantName || 'Main Database'}</h3>
                            <p className="text-sm text-muted-foreground">
                                Data is fully isolated to this tenant.
                            </p>
                        </div>
                        <Button variant="outline" disabled>
                            Active
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Profile Information</CardTitle>
                    <CardDescription>
                        Update your account&apos;s profile information and email address.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">Name</Label>
                        <Input id="name" placeholder="Your name" defaultValue={userName || ''} />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" placeholder="Email address" defaultValue={userEmail || ''} />
                    </div>
                    <div className="flex justify-end">
                        <Button
                            onClick={() => toast.success('Profile updated')}
                        >
                            Save Changes
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card className="flex flex-col">
                <CardHeader>
                    <CardTitle>Appearance</CardTitle>
                    <CardDescription>
                        Customize the look and feel of the application.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="space-y-0.5">
                            <h3 className="text-base font-medium">Theme Preferences</h3>
                            <p className="text-sm text-muted-foreground">
                                Toggle between light and dark modes.
                            </p>
                        </div>
                        <Button variant="outline" disabled>
                            Managed via ThemeProvider
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
