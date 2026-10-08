import type { ReactNode } from 'react';
import { ClipboardList, History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ReturnActivityTabsProps {
    guidance: ReactNode;
    audit: ReactNode;
}

export function ReturnActivityTabs({ guidance, audit }: ReturnActivityTabsProps) {
    return (
        <section aria-labelledby="return-activity-title" className="space-y-3">
            <div>
                <h2 id="return-activity-title" className="text-lg font-semibold">
                    Tindak Lanjut Retur
                </h2>
                <p className="text-sm text-muted-foreground">
                    Panduan operasional dipisahkan dari audit sistem.
                </p>
            </div>
            <Tabs defaultValue="guidance">
                <TabsList className="grid h-auto w-full grid-cols-2 sm:w-[360px]">
                    <TabsTrigger value="guidance" className="min-h-11">
                        <ClipboardList className="mr-2 h-4 w-4" /> Panduan
                    </TabsTrigger>
                    <TabsTrigger value="audit" className="min-h-11">
                        <History className="mr-2 h-4 w-4" /> Audit Status
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="guidance" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Panduan Status</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm text-muted-foreground">
                            {guidance}
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
