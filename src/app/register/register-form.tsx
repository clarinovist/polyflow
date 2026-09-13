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
        setSubdomain(
            val
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, ''),
        );
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

            // Cross-origin redirect to the new tenant subdomain — router.push()
            // cannot navigate across origins.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.href = `${protocol}//${targetHost}/login`;
        }, 1500);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
                <Label
                    htmlFor="companyName"
                    className="text-zinc-900 dark:text-zinc-100"
                >
                    Nama Perusahaan
                </Label>
                <Input
                    id="companyName"
                    required
                    value={companyName}
                    onChange={handleCompanyChange}
                    className="h-11 border-zinc-200 bg-white text-base text-zinc-900 placeholder:text-zinc-400 focus:border-primary/50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-zinc-600"
                    placeholder="Acme Plastics Ltd."
                />
            </div>

            <div className="space-y-2">
                <Label
                    htmlFor="adminEmail"
                    className="text-zinc-900 dark:text-zinc-100"
                >
                    Email Admin
                </Label>
                <Input
                    id="adminEmail"
                    type="email"
                    required
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="h-11 border-zinc-200 bg-white text-base text-zinc-900 placeholder:text-zinc-400 focus:border-primary/50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-zinc-600"
                    placeholder="admin@acmeplastics.com"
                />
            </div>

            <div className="space-y-2">
                <Label
                    htmlFor="subdomain"
                    className="text-zinc-900 dark:text-zinc-100"
                >
                    URL Workspace
                </Label>
                <div className="flex min-w-0 items-center overflow-hidden rounded-md border border-zinc-200 bg-white transition-all focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-950">
                    <span className="pl-3 text-zinc-500 dark:text-zinc-400 text-sm whitespace-nowrap hidden sm:inline">
                        https://
                    </span>
                    <Input
                        id="subdomain"
                        required
                        value={subdomain}
                        onChange={(e) =>
                            setSubdomain(
                                e.target.value
                                    .toLowerCase()
                                    .replace(/[^a-z0-9-]/g, ''),
                            )
                        }
                        className="h-11 min-w-0 border-0 bg-transparent px-2 text-right text-base text-zinc-900 focus-visible:ring-0 dark:text-white sm:px-1 sm:text-left"
                        placeholder="acme"
                    />
                    <span className="flex h-11 shrink-0 items-center whitespace-nowrap rounded-r-md border-l border-zinc-200 bg-zinc-50 pr-3 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                        .polyflow.uk
                    </span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 flex items-center gap-1">
                    <Info aria-hidden="true" className="h-3 w-3 shrink-0" />
                    Ini akan menjadi alamat login khusus perusahaan Anda.
                </p>
            </div>

            <Button
                type="submit"
                className="w-full h-12 mt-4 text-base font-semibold bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                disabled={
                    isLoading || !companyName || !adminEmail || !subdomain
                }
            >
                {isLoading ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Menyiapkan workspace...
                    </>
                ) : (
                    <>
                        Buat Workspace{' '}
                        <ArrowRight
                            aria-hidden="true"
                            className="ml-2 h-4 w-4"
                        />
                    </>
                )}
            </Button>

            <p className="text-center text-xs text-zinc-500 dark:text-zinc-400 mt-6">
                Dengan membuat workspace, Anda menyetujui Ketentuan Layanan
                dan Kebijakan Privasi kami.
            </p>
        </form>
    );
}
