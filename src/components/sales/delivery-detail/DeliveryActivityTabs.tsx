import type { ReactNode } from 'react';
import { ClipboardList, History } from 'lucide-react';
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@/components/ui/tabs';

interface DeliveryActivityTabsProps {
    evidence: ReactNode;
    audit: ReactNode;
    hasEvidence: boolean;
}

export function DeliveryActivityTabs({
    evidence,
    audit,
    hasEvidence,
}: DeliveryActivityTabsProps) {
    return (
        <section
            aria-labelledby="delivery-record-title"
            className="space-y-3"
        >
            <div>
                <h2
                    id="delivery-record-title"
                    className="text-lg font-semibold"
                >
                    Bukti dan Aktivitas
                </h2>
                <p className="text-sm text-muted-foreground">
                    Bukti operasional dipisahkan dari audit sistem agar lebih
                    mudah dipindai.
                </p>
            </div>
            <Tabs defaultValue="evidence">
                <TabsList className="grid h-auto w-full grid-cols-2 sm:w-[360px]">
                    <TabsTrigger value="evidence" className="min-h-11">
                        <ClipboardList className="mr-2 h-4 w-4" />
                        Bukti Pengiriman
                    </TabsTrigger>
                    <TabsTrigger value="audit" className="min-h-11">
                        <History className="mr-2 h-4 w-4" />
                        Audit Status
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="evidence" className="mt-4 space-y-6">
                    {hasEvidence ? (
                        evidence
                    ) : (
                        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                            Belum ada bukti pengiriman pada tahap ini.
                        </div>
                    )}
                </TabsContent>
                <TabsContent value="audit" className="mt-4">
                    {audit}
                </TabsContent>
            </Tabs>
        </section>
    );
}
