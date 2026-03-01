'use client';

import { useState } from 'react';
import { ArrowRight, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function WorkspaceDiscovery() {
    const [workspace, setWorkspace] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!workspace.trim()) return;

        setIsLoading(true);

        // Clean up workspace input (remove protocol, spaces, etc)
        const cleanWorkspace = workspace.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

        // Determine the base domain from current URL to support both localhost and production
        const currentHost = window.location.hostname;
        const currentPort = window.location.port ? `:${window.location.port}` : '';
        const protocol = window.location.protocol;

        // Construct the tenant URL
        // If current host is already a subdomain, we replace it. Otherwise we prepend.
        let targetHost = '';

        if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
            targetHost = `${cleanWorkspace}.localhost${currentPort}`;
        } else if (currentHost === 'polyflow.uk' || currentHost === 'www.polyflow.uk') {
            targetHost = `${cleanWorkspace}.polyflow.uk${currentPort}`;
        } else {
            // Fallback for other environments
            const parts = currentHost.split('.');
            if (parts.length > 2) {
                // Keep the root domain, replace the subdomain
                parts[0] = cleanWorkspace;
                targetHost = parts.join('.') + currentPort;
            } else {
                targetHost = `${cleanWorkspace}.${currentHost}${currentPort}`;
            }
        }

        window.location.href = `${protocol}//${targetHost}/login`;
    };

    return (
        <div className="w-full max-w-md mx-auto px-6 py-8">
            <div className="mb-8 text-center">
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
                    <Building2 className="w-6 h-6 text-primary" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
                    Sign in to your workspace
                </h1>
                <p className="text-muted-foreground">
                    Enter your workspace URL to continue to your ERP dashboard.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row shadow-sm rounded-md bg-transparent">
                        <div className="flex items-center rounded-md border border-input focus-within:ring-1 focus-within:ring-ring focus-within:border-primary transition-all overflow-hidden bg-background w-full">
                            <span className="pl-4 text-muted-foreground whitespace-nowrap hidden sm:inline select-none">https://</span>
                            <Input
                                type="text"
                                placeholder="your-company"
                                value={workspace}
                                onChange={(e) => setWorkspace(e.target.value)}
                                className="border-0 bg-transparent focus-visible:ring-0 px-2 sm:px-1 text-center sm:text-left h-12 text-lg shadow-none flex-1"
                                autoFocus
                                required
                            />
                            <span className="pr-4 pl-3 bg-muted h-full flex items-center border-l border-border text-muted-foreground font-medium select-none">.polyflow.uk</span>
                        </div>
                    </div>
                </div>

                <Button
                    type="submit"
                    className="w-full h-12 text-base font-semibold"
                    disabled={!workspace.trim() || isLoading}
                >
                    {isLoading ? 'Connecting...' : 'Continue to Workspace'}
                    {!isLoading && <ArrowRight className="ml-2 w-4 h-4" />}
                </Button>
            </form>

            <div className="mt-8 text-center text-sm text-muted-foreground">
                <p>Not sure about your workspace URL?</p>
                <p className="mt-1">Check your welcome email from the administrator.</p>
            </div>

            <div className="mt-6 pt-6 border-t border-zinc-200 text-center">
                <p className="text-sm text-muted-foreground mb-3">Don&apos;t have a workspace yet?</p>
                <Button variant="outline" className="w-full h-10 border-zinc-300" asChild>
                    <a href="/register">Register New Company</a>
                </Button>
            </div>

        </div>
    );
}
