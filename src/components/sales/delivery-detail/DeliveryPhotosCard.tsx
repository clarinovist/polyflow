import type { DeliveryOrderDetailData } from './types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { RefObject, Dispatch, SetStateAction } from 'react';
import Image from 'next/image';
import { Camera, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';

interface DeliveryPhotosCardProps {
    order: DeliveryOrderDetailData;
    canUploadVehicle: boolean;
    canUploadPOD: boolean;
    uploadingVehicle: boolean;
    uploadingPOD: boolean;
    vehicleInputRef: RefObject<HTMLInputElement | null>;
    podInputRef: RefObject<HTMLInputElement | null>;
    receivedByName: string;
    setReceivedByName: Dispatch<SetStateAction<string>>;
    handlePhotoUpload: (
        file: File,
        photoType: 'vehicle' | 'proof_of_delivery',
    ) => Promise<void>;
}

export function DeliveryPhotosCard({
    order,
    canUploadVehicle,
    canUploadPOD,
    uploadingVehicle,
    uploadingPOD,
    vehicleInputRef,
    podInputRef,
    receivedByName,
    setReceivedByName,
    handlePhotoUpload,
}: DeliveryPhotosCardProps) {
    return (
        <Card className="md:col-span-2">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Camera className="h-5 w-5" />
                    Foto Pengiriman
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Vehicle Photo */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground uppercase">
                            Foto Truk Saat Muat
                        </label>
                        {order.vehiclePhotoUrl ? (
                            <div className="relative border rounded-lg overflow-hidden h-48">
                                <Image
                                    src={order.vehiclePhotoUrl}
                                    alt="Foto Truk"
                                    fill
                                    unoptimized
                                    className="object-cover"
                                    sizes="(max-width: 768px) 100vw, 50vw"
                                />
                            </div>
                        ) : (
                            <div className="border-2 border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
                                Belum ada foto truk
                            </div>
                        )}
                        {canUploadVehicle && (
                            <>
                                <input
                                    ref={vehicleInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file)
                                            handlePhotoUpload(file, 'vehicle');
                                    }}
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full"
                                    onClick={() =>
                                        vehicleInputRef.current?.click()
                                    }
                                    disabled={uploadingVehicle}
                                >
                                    <Upload className="h-4 w-4 mr-2" />
                                    {uploadingVehicle
                                        ? 'Mengupload...'
                                        : order.vehiclePhotoUrl
                                          ? 'Ganti Foto Truk'
                                          : 'Upload Foto Truk'}
                                </Button>
                            </>
                        )}
                    </div>

                    {/* Proof of Delivery */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground uppercase">
                            Bukti Terima
                        </label>
                        {order.proofOfDeliveryUrl ? (
                            <>
                                <div className="relative border rounded-lg overflow-hidden h-48">
                                    <Image
                                        src={order.proofOfDeliveryUrl}
                                        alt="Bukti Terima"
                                        fill
                                        unoptimized
                                        className="object-cover"
                                        sizes="(max-width: 768px) 100vw, 50vw"
                                    />
                                </div>
                                {order.receivedBy && (
                                    <p className="text-sm text-muted-foreground">
                                        Diterima oleh:{' '}
                                        <span className="font-medium">
                                            {order.receivedBy}
                                        </span>
                                    </p>
                                )}
                                {order.proofOfDeliveryAt && (
                                    <p className="text-xs text-muted-foreground">
                                        Pada:{' '}
                                        {format(
                                            new Date(order.proofOfDeliveryAt),
                                            'PPpp',
                                        )}
                                    </p>
                                )}
                            </>
                        ) : (
                            <div className="border-2 border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
                                Belum ada bukti terima
                            </div>
                        )}
                        {canUploadPOD && (
                            <>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">
                                        Nama Penerima *
                                    </label>
                                    <input
                                        type="text"
                                        value={receivedByName}
                                        onChange={(e) =>
                                            setReceivedByName(e.target.value)
                                        }
                                        placeholder="Nama penerima"
                                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                                    />
                                </div>
                                <input
                                    ref={podInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file)
                                            handlePhotoUpload(
                                                file,
                                                'proof_of_delivery',
                                            );
                                    }}
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => podInputRef.current?.click()}
                                    disabled={
                                        uploadingPOD || !receivedByName.trim()
                                    }
                                >
                                    <Upload className="h-4 w-4 mr-2" />
                                    {uploadingPOD
                                        ? 'Mengupload...'
                                        : 'Upload Bukti Terima'}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
