'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowRight, Loader2, Info } from 'lucide-react';

export default function RegisterForm() {
    const [isLoading, setIsLoading] = useState(false);
    const [companyName, setCompanyName] = useState('');
    const [adminEmail, setAdminEmail] = useState('');
    const [subdomain, setSubdomain] = useState('');

    // Auto-generate subdomain based on company name
    const handleCompanyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setCompanyName(val);
        // Clean up and suggest a subdomain
        setSubdomain(val.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        // This is a placeholder for the actual API call
        // In a real implementation, you would call your backend to provision the tenant
        // and create the first admin user here.

        setTimeout(() => {
            setIsLoading(false);
            // After successful registration, redirect to the new tenant's login page
            const currentHost = window.location.hostname;
            const port = window.location.port ? `:${window.location.port}` : '';
            const protocol = window.location.protocol;

            let targetHost = '';
            if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
                targetHost = `${subdomain}.localhost${port}`;
            } else {
                targetHost = `${subdomain}.polyflow.uk${port}`;
            }

            window.location.href = `${protocol}//${targetHost}/login`;
        }, 1500);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
                <Label htmlFor="companyName" className="text-zinc-900 dark:text-zinc-100">Company Name</Label>
                <Input
                    id="companyName"
                    required
                    value={companyName}
                    onChange={handleCompanyChange}
                    className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-primary/50"
                    placeholder="Acme Plastics Ltd."
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="adminEmail" className="text-zinc-900 dark:text-zinc-100">Admin Email</Label>
                <Input
                    id="adminEmail"
                    type="email"
                    required
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-primary/50"
                    placeholder="admin@acmeplastics.com"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="subdomain" className="text-zinc-900 dark:text-zinc-100">Workspace URL</Label>
                <div className="flex items-center rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus-within:ring-1 focus-within:border-primary/50 focus-within:ring-primary/20 transition-all">
                    <span className="pl-3 text-zinc-500 dark:text-zinc-400 text-sm whitespace-nowrap hidden sm:inline">https://</span>
                    <Input
                        id="subdomain"
                        required
                        value={subdomain}
                        onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                        className="border-0 bg-transparent text-zinc-900 dark:text-white focus-visible:ring-0 px-2 sm:px-1 text-right sm:text-left h-10"
                        placeholder="acme"
                    />
                    <span className="pr-3 text-zinc-500 dark:text-zinc-400 text-sm whitespace-nowrap bg-zinc-50 dark:bg-zinc-900 h-full flex items-center rounded-r-md border-l border-zinc-200 dark:border-zinc-700">.polyflow.uk</span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 flex items-center gap-1">
                    <Info className="w-3 h-3" /> This will be your dedicated login address.
                </p>
            </div>

            <Button
                type="submit"
                className="w-full h-12 mt-4 text-base font-semibold bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                disabled={isLoading || !companyName || !adminEmail || !subdomain}
            >
                {isLoading ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Setting up workspace...
                    </>
                ) : (
                    <>
                        Create Workspace <ArrowRight className="ml-2 w-4 h-4" />
                    </>
                )}
            </Button>

            <p className="text-center text-xs text-zinc-500 dark:text-zinc-400 mt-6">
                By creating a workspace, you agree to our Terms of Service and Privacy Policy.
            </p>
        </form>
    );
}
