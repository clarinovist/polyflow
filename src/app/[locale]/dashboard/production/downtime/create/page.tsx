'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { logMachineDowntime } from '@/actions/production';
import { getProductionFormData } from '@/actions/production';
import { toast } from 'sonner';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

// Helper type for machine from InitData
interface Machine {
    id: string;
    name: string;
    code: string;
}

export default function LogDowntimePage() {
    const router = useRouter();
    const [machines, setMachines] = useState<Machine[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Form State
    const [machineId, setMachineId] = useState('');
    const [reason, setReason] = useState('');
    // Default to current time, slice to minutes for datetime-local
    const [startTime, setStartTime] = useState(new Date().toISOString().slice(0, 16));
    const [endTime, setEndTime] = useState(''); // Optional

    useEffect(() => {
        async function loadData() {
            try {
                const data = await getProductionFormData();
                setMachines(data.machines || []);
            } catch (error) {
                toast.error("Failed to load machine data");
                console.error(error);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!machineId || !reason || !startTime) {
            toast.error("Please fill in all required fields");
            return;
        }

        setSubmitting(true);
        try {
            const result = await logMachineDowntime({
                machineId,
                reason,
                startTime: new Date(startTime),
                endTime: endTime ? new Date(endTime) : undefined,
            });

            if (result.success) {
                toast.success("Downtime logged successfully");
                router.push('/dashboard');
                router.refresh();
            } else {
                toast.error(result.error || "Failed to log downtime");
            }
        } catch (err) {
            toast.error("An unexpected error occurred");
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div className="p-8 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-zinc-400" /></div>;
    }

    return (
        <div className="max-w-xl mx-auto py-10 px-4">
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6">
                <ArrowLeft className="h-4 w-4" /> Back to Dashboard
            </Link>

            <Card>
                <CardHeader>
                    <CardTitle>Log Machine Downtime</CardTitle>
                    <CardDescription>Record unexpected machine stops or maintenance.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">

                        {/* Machine Selection */}
                        <div className="space-y-2">
                            <Label htmlFor="machine">Machine <span className="text-red-500">*</span></Label>
                            <Select value={machineId} onValueChange={setMachineId} required>
                                <SelectTrigger id="machine">
                                    <SelectValue placeholder="Select machine..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {machines.map((m) => (
                                        <SelectItem key={m.id} value={m.id}>
                                            {m.name} ({m.code})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Time Range */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="startTime">Start Time <span className="text-red-500">*</span></Label>
                                <Input
                                    id="startTime"
                                    type="datetime-local"
                                    value={startTime}
                                    onChange={(e) => setStartTime(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="endTime">End Time (Optional)</Label>
                                <Input
                                    id="endTime"
                                    type="datetime-local"
                                    value={endTime}
                                    onChange={(e) => setEndTime(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Reason */}
                        <div className="space-y-2">
                            <Label htmlFor="reason">Reason / Issue <span className="text-red-500">*</span></Label>
                            <Textarea
                                id="reason"
                                placeholder="Describe the issue (e.g., Heater failure, Belt snap)..."
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                required
                                rows={4}
                            />
                        </div>

                        <div className="pt-2 flex gap-3 justify-end">
                            <Button type="button" variant="outline" onClick={() => router.back()} disabled={submitting}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Log
                            </Button>
                        </div>

                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
