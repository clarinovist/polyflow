import { getOpnameSessions } from '@/actions/opname';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Calendar, CheckCircle2, Clock } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { CreateOpnameDialog } from '@/components/inventory/opname/CreateOpnameDialog';

export default async function OpnameListPage() {
    const sessions = await getOpnameSessions();

    return (
        <div className="p-6 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Stock Opname</h1>
                    <p className="text-muted-foreground mt-2">Manage physical inventory audits and reconciliation</p>
                </div>
                <CreateOpnameDialog />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sessions.map((session) => (
                    <Link href={`/dashboard/inventory/opname/${session.id}`} key={session.id}>
                        <Card className="hover:shadow-md transition-shadow cursor-pointer h-full border shadow-sm">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <Badge
                                    variant="outline"
                                    className={session.status === 'OPEN'
                                        ? "bg-blue-500/10 text-blue-700 border-blue-200"
                                        : "bg-emerald-500/10 text-emerald-700 border-emerald-200"
                                    }
                                >
                                    {session.status}
                                </Badge>
                                {session.status === 'OPEN' ? (
                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                )}
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold mb-1">
                                    {session.remarks || "No Remarks"}
                                </div>
                                <div className="space-y-2 mt-4">
                                    <div className="flex items-center text-sm text-muted-foreground">
                                        <MapPin className="mr-2 h-4 w-4" />
                                        {session.location.name}
                                    </div>
                                    <div className="flex items-center text-sm text-muted-foreground">
                                        <Calendar className="mr-2 h-4 w-4" />
                                        {format(new Date(session.createdAt), 'PPP')}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}
