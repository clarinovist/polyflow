'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Users, Loader2 } from 'lucide-react';
import { getSalesTeamAction } from '@/actions/sales/sales-team';
import { CustomerAssignmentDialog } from './CustomerAssignmentDialog';

interface SalesTeamMember {
    id: string;
    name: string;
    email: string;
    role: string;
    roles: string[];
    activeCustomerCount: number;
}

export function SalesTeamListClient() {
    const [members, setMembers] = useState<SalesTeamMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedMember, setSelectedMember] = useState<SalesTeamMember | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);

    const loadMembers = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getSalesTeamAction();
            const data =
                result && typeof result === 'object' && 'data' in result
                    ? (result as { data: SalesTeamMember[] | null }).data
                    : null;
            setMembers(data ?? []);
        } catch {
            setMembers([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadMembers();
    }, [loadMembers]);

    const filtered = members.filter((m) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            m.name.toLowerCase().includes(q) ||
            m.email.toLowerCase().includes(q)
        );
    });

    function handleViewCustomers(member: SalesTeamMember) {
        setSelectedMember(member);
        setDialogOpen(true);
    }

    return (
        <>
            <div className="space-y-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Cari nama atau email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>

                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <>
                        {/* Desktop Table */}
                        <div className="hidden md:block">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nama</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead className="text-center">
                                            Customer Aktif
                                        </TableHead>
                                        <TableHead className="w-[120px] text-right">
                                            Aksi
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filtered.length === 0 ? (
                                        <TableRow>
                                            <TableCell
                                                colSpan={5}
                                                className="h-64 text-center"
                                            >
                                                <div className="flex flex-col items-center justify-center space-y-3">
                                                    <Users className="h-8 w-8 text-muted-foreground opacity-50" />
                                                    <p className="text-muted-foreground">
                                                        {search
                                                            ? 'Tidak ada sales yang cocok.'
                                                            : 'Tidak ada data sales ditemukan.'}
                                                    </p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filtered.map((member) => (
                                            <TableRow key={member.id}>
                                                <TableCell className="font-medium">
                                                    {member.name}
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {member.email}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-wrap gap-1">
                                                        {member.roles.map((r) => (
                                                            <Badge
                                                                key={r}
                                                                variant={
                                                                    r === 'ADMIN'
                                                                        ? 'destructive'
                                                                        : 'secondary'
                                                                }
                                                                className="text-[10px]"
                                                            >
                                                                {r}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <span className="text-lg font-semibold">
                                                        {member.activeCustomerCount}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() =>
                                                            handleViewCustomers(member)
                                                        }
                                                    >
                                                        Lihat Customer
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-3">
                            {filtered.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                    <p>Tidak ada data sales ditemukan.</p>
                                </div>
                            ) : (
                                filtered.map((member) => (
                                    <div
                                        key={member.id}
                                        className="border rounded-lg p-4 space-y-3"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <h3 className="font-semibold text-sm">
                                                    {member.name}
                                                </h3>
                                                <p className="text-xs text-muted-foreground">
                                                    {member.email}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg font-semibold">
                                                    {member.activeCustomerCount}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    customer
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex flex-wrap gap-1">
                                                {member.roles.map((r) => (
                                                    <Badge
                                                        key={r}
                                                        variant="secondary"
                                                        className="text-[10px]"
                                                    >
                                                        {r}
                                                    </Badge>
                                                ))}
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                    handleViewCustomers(member)
                                                }
                                                className="text-xs"
                                            >
                                                Lihat Customer
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}
            </div>

            {selectedMember && (
                <CustomerAssignmentDialog
                    open={dialogOpen}
                    onOpenChange={setDialogOpen}
                    userId={selectedMember.id}
                    userName={selectedMember.name}
                    onAssignmentChange={loadMembers}
                />
            )}
        </>
    );
}
