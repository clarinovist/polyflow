import { getOpnameSessions } from '@/actions/opname';
import { requireRole } from '@/lib/auth-checks';
import { Role } from '@prisma/client';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Calendar, CheckCircle2, Clock, History } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { CreateOpnameDialog } from '@/components/warehouse/inventory/opname/CreateOpnameDialog';
import { Separator } from '@/components/ui/separator';

export default async function OpnameListPage() {
    try {
        await requireRole([Role.WAREHOUSE, Role.PRODUCTION, Role.PPIC]);
    } catch (_) {
        // If user is not authorized, redirect to dashboard for safety
        redirect('/dashboard');
    }

    const sessions = await getOpnameSessions();

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Stock Opname</h2>
                    <p className="text-muted-foreground">Manage physical inventory audits and reconciliation</p>
                </div>
                <CreateOpnameDialog />
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sessions.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-xl bg-muted/10 text-muted-foreground">
                        <History className="h-10 w-10 mb-3 opacity-50" />
                        <p className="font-medium">No stock opname sessions found</p>
                        <p className="text-sm mt-1">Start a new audit session to track inventory.</p>
                    </div>
                ) : (
                    sessions.map((session) => (
                        <Link href={`/warehouse/analytics/opname/${session.id}`} key={session.id} className="block h-full">
                            <Card className="h-full hover:shadow-md transition-all cursor-pointer border-border/60 hover:border-primary/50 group">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <Badge
                                        variant={session.status === 'OPEN' ? 'secondary' : 'outline'}
                                        className={session.status === 'OPEN'
                                            ? "bg-primary/10 text-primary hover:bg-primary/20"
                                            : "border-emerald-500/30 text-emerald-600"
                                        }
                                    >
                                        {session.status}
                                    </Badge>
                                    {session.status === 'OPEN' ? (
                                        <Clock className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                    ) : (
                                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                    )}
                                </CardHeader>
                                <CardContent>
                                    <CardTitle className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">
                                        {session.remarks || "No Remarks"}
                                    </CardTitle>

                                    <div className="space-y-2 mt-4 text-sm text-muted-foreground">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1 rounded bg-muted">
                                                <MapPin className="h-3.5 w-3.5" />
                                            </div>
                                            <span>{session.location.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="p-1 rounded bg-muted">
                                                <Calendar className="h-3.5 w-3.5" />
                                            </div>
                                            <span>{format(new Date(session.createdAt), 'PPP')}</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))
                )}
            </div>
        </div>
    );
}
