'use client';

import { useState } from 'react';
import { ArrowRight, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { workspaceDiscoveryLabels as L } from '@/lib/labels/auth';

/** Get the root domain for constructing subdomain URLs */
function getRootDomain(): string {
    if (typeof window === 'undefined') return 'polyflow.uk';
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'localhost';
    if (host === 'polyflow.uk' || host === 'www.polyflow.uk') return 'polyflow.uk';
    // Fallback: strip first subdomain segment
    const parts = host.split('.');
    return parts.length > 2 ? parts.slice(1).join('.') : host;
}

export default function WorkspaceDiscovery() {
    const [workspace, setWorkspace] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!workspace.trim()) return;

        setIsLoading(true);

        // Clean up workspace input (remove protocol, spaces, etc)
        const cleanWorkspace = workspace.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

        const currentHost = window.location.hostname;
        const currentPort = window.location.port ? `:${window.location.port}` : '';
        const protocol = window.location.protocol;

        let targetHost = '';

        if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
            targetHost = `${cleanWorkspace}.localhost${currentPort}`;
        } else if (currentHost === 'polyflow.uk' || currentHost === 'www.polyflow.uk') {
            targetHost = `${cleanWorkspace}.polyflow.uk${currentPort}`;
        } else {
            const parts = currentHost.split('.');
            if (parts.length > 2) {
                parts[0] = cleanWorkspace;
                targetHost = parts.join('.') + currentPort;
            } else {
                targetHost = `${cleanWorkspace}.${currentHost}${currentPort}`;
            }
        }

        window.location.href = `${protocol}//${targetHost}/login`;
    };

    const rootDomain = getRootDomain();
    const protocol = typeof window !== 'undefined' ? window.location.protocol : 'https:';
    const adminUrl = `${protocol}//admin.${rootDomain}/login`;

    return (
        <div className="w-full max-w-md mx-auto px-6 py-8">
            <div className="mb-8 text-center">
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
                    <Building2 className="w-6 h-6 text-primary" />
                </div>
                <h1 className="text-2xl sm:3xl font-bold text-foreground mb-3">
                    {L.signInToWorkspace}
                </h1>
                <p className="text-muted-foreground">
                    {L.description}
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row shadow-sm rounded-md bg-transparent">
                        <div className="flex items-center rounded-md border border-input focus-within:ring-1 focus-within:ring-ring focus-within:border-primary transition-all overflow-hidden bg-background w-full">
                            <span className="pl-4 text-muted-foreground whitespace-nowrap hidden sm:inline select-none">{L.protocolPrefix}</span>
                            <Input
                                type="text"
                                placeholder={L.placeholder}
                                value={workspace}
                                onChange={(e) => setWorkspace(e.target.value)}
                                className="border-0 bg-transparent focus-visible:ring-0 px-2 sm:px-1 text-center sm:text-left h-12 text-lg shadow-none flex-1"
                                autoFocus
                                required
                            />
                            <span className="pr-4 pl-3 bg-muted h-full flex items-center border-l border-border text-muted-foreground font-medium select-none">{L.domainSuffix}</span>
                        </div>
                    </div>
                </div>

                <Button
                    type="submit"
                    className="w-full h-12 text-base font-semibold"
                    disabled={!workspace.trim() || isLoading}
                >
                    {isLoading ? L.connecting : L.continueToWorkspace}
                    {!isLoading && <ArrowRight className="ml-2 w-4 h-4" />}
                </Button>
            </form>

            <div className="mt-8 text-center text-sm text-muted-foreground">
                <p>{L.notSure}</p>
                <p className="mt-1">{L.checkEmail}</p>
            </div>

            <div className="mt-6 pt-6 border-t border-zinc-200 text-center">
                <p className="text-sm text-muted-foreground mb-3">{L.noWorkspace}</p>
                <Button variant="outline" className="w-full h-10 border-zinc-300" asChild>
                    <a href="/register">{L.registerNewCompany}</a>
                </Button>
            </div>

            {/* Super Admin Access */}
            <div className="mt-4 text-center">
                <a
                    href={adminUrl}
                    className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                >
                    Super Admin Login
                </a>
            </div>

        </div>
    );
}
