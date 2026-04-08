import React from 'react';
import { Metadata } from 'next';
import { prisma } from '@/lib/core/prisma';
import { Warehouse, MapPin, Globe } from 'lucide-react';
import { LocationFormDialog } from './location-form-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Locations | Master Data | PolyFlow',
};

// Next.js Server Component
export default async function LocationsPage() {
    // Fetch all locations
    const locations = await prisma.location.findMany({
        orderBy: { name: 'asc' }
    });

    return (
        <div className="flex flex-col gap-6 max-w-6xl mx-auto">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Warehouse className="h-8 w-8 text-primary" />
                        Locations
                    </h1>
                    <p className="text-muted-foreground">
                        Manage internal warehouses and customer-owned storage (Maklon) areas.
                    </p>
                </div>
                <LocationFormDialog />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {locations.map((location) => (
                    <Card key={location.id} className="relative overflow-hidden group">
                        {/* Type indicator stripe */}
                        <div className={`absolute top-0 left-0 w-1 h-full ${
                            location.locationType === 'CUSTOMER_OWNED' ? 'bg-purple-500' : 'bg-blue-500'
                        }`} />
                        
                        <CardHeader className="pb-3">
                            <div className="flex justify-between items-start">
                                <CardTitle className="text-xl flex items-center gap-2">
                                    <MapPin className="h-5 w-5 text-muted-foreground" />
                                    {location.name}
                                </CardTitle>
                                <LocationFormDialog 
                                    trigger={
                                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                    }
                                    initialData={{
                                        id: location.id,
                                        name: location.name,
                                        slug: location.slug,
                                        description: location.description || '',
                                        locationType: location.locationType as 'INTERNAL' | 'CUSTOMER_OWNED'
                                    }}
                                />
                            </div>
                            <CardDescription className="flex items-center gap-2">
                                <Globe className="h-3 w-3" />
                                {location.slug}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col gap-3">
                                {location.description && (
                                    <p className="text-sm text-foreground/80 bg-muted/40 p-2 rounded-md line-clamp-2">
                                        {location.description}
                                    </p>
                                )}
                                
                                <div className="mt-2">
                                    <Badge variant={location.locationType === 'CUSTOMER_OWNED' ? "secondary" : "outline"}
                                           className={location.locationType === 'CUSTOMER_OWNED' ? "bg-purple-100 text-purple-800 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200" : ""}
                                    >
                                        {location.locationType === 'CUSTOMER_OWNED' ? 'Maklon Storage' : 'Internal Warehouse'}
                                    </Badge>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {locations.length === 0 && (
                    <div className="col-span-full py-12 text-center border-2 border-dashed rounded-lg">
                        <Warehouse className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                        <h3 className="text-lg font-medium text-foreground">No locations found</h3>
                        <p className="text-muted-foreground mb-4">You haven&apos;t added any warehouse locations yet.</p>
                        <LocationFormDialog />
                    </div>
                )}
            </div>
        </div>
    );
}
