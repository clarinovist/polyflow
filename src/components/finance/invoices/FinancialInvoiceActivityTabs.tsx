import type { ReactNode } from 'react';
import { History, ListChecks } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface FinancialInvoiceActivityTabsProps {
    audit: ReactNode;
}

export function FinancialInvoiceActivityTabs({
    audit,
}: FinancialInvoiceActivityTabsProps) {
    return (
        <section aria-labelledby="invoice-activity-title" className="space-y-3">
            <div>
                <h2 id="invoice-activity-title" className="text-lg font-semibold">
                    Aktivitas Invoice
                </h2>
                <p className="text-sm text-muted-foreground">
                    Tindak lanjut harian dipisahkan dari audit perubahan status.
                </p>
            </div>
            <Tabs defaultValue="follow-up">
                <TabsList className="grid h-auto w-full grid-cols-2 sm:w-[360px]">
                    <TabsTrigger value="follow-up" className="min-h-11">
                        <ListChecks className="mr-2 h-4 w-4" /> Tindak Lanjut
                    </TabsTrigger>
                    <TabsTrigger value="audit" className="min-h-11">
                        <History className="mr-2 h-4 w-4" /> Audit Status
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="follow-up" className="mt-4">
                    <Card>
                        <CardContent className="flex items-start gap-3 p-4 text-sm text-muted-foreground">
                            <ListChecks className="mt-0.5 h-4 w-4 shrink-0" />
                            <p>
                                Status invoice dan pembayaran dikelola dari
                                halaman ini. Perubahan item dan pengiriman tetap
                                dilakukan dari modul Penjualan.
                            </p>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="audit" className="mt-4">
                    {audit}
                </TabsContent>
            </Tabs>
        </section>
    );
}
