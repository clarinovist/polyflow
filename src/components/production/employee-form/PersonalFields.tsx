import type { Dispatch, SetStateAction } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { PersonalData } from './types';

type PersonalFieldsProps = {
    personal: PersonalData;
    setPersonal: Dispatch<SetStateAction<PersonalData>>;
    showPersonal: boolean;
    setShowPersonal: Dispatch<SetStateAction<boolean>>;
};

export function PersonalFields({
    personal,
    setPersonal,
    showPersonal,
    setShowPersonal,
}: PersonalFieldsProps) {
    return (
        <div className="rounded-lg border border-dashed">
            <button
                type="button"
                onClick={() => setShowPersonal((s) => !s)}
                className="w-full flex items-center justify-between px-3 py-2 text-left bg-muted/30 hover:bg-muted/50 transition-colors"
            >
                <div className="flex items-center gap-2">
                    {showPersonal ? (
                        <ChevronDown className="h-4 w-4" />
                    ) : (
                        <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="text-sm font-semibold tracking-tight">
                        Data Pribadi &amp; Kepegawaian
                    </span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                    Opsional — isi bertahap
                </span>
            </button>
            {showPersonal && (
                <div className="p-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                Status Kepegawaian
                            </Label>
                            <Select
                                value={personal.employmentStatus}
                                onValueChange={(v) =>
                                    setPersonal({
                                        ...personal,
                                        employmentStatus:
                                            v as PersonalData['employmentStatus'],
                                    })
                                }
                            >
                                <SelectTrigger className="h-9 bg-background/50">
                                    <SelectValue placeholder="Pilih status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="PROBATION">
                                        Probation
                                    </SelectItem>
                                    <SelectItem value="PERMANENT">
                                        Tetap
                                    </SelectItem>
                                    <SelectItem value="CONTRACT">
                                        Kontrak
                                    </SelectItem>
                                    <SelectItem value="RESIGNED">
                                        Resign
                                    </SelectItem>
                                    <SelectItem value="TERMINATED">
                                        PHK
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                Tanggal Masuk
                            </Label>
                            <Input
                                type="date"
                                value={personal.joinDate}
                                onChange={(e) =>
                                    setPersonal({
                                        ...personal,
                                        joinDate: e.target.value,
                                    })
                                }
                                className="h-9 bg-background/50"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                Akhir Probation
                            </Label>
                            <Input
                                type="date"
                                value={personal.probationEndDate}
                                onChange={(e) =>
                                    setPersonal({
                                        ...personal,
                                        probationEndDate:
                                            e.target.value,
                                    })
                                }
                                className="h-9 bg-background/50"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                Akhir Kontrak
                            </Label>
                            <Input
                                type="date"
                                value={personal.contractEndDate}
                                onChange={(e) =>
                                    setPersonal({
                                        ...personal,
                                        contractEndDate: e.target.value,
                                    })
                                }
                                className="h-9 bg-background/50"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                NIK
                            </Label>
                            <Input
                                value={personal.nik}
                                onChange={(e) =>
                                    setPersonal({
                                        ...personal,
                                        nik: e.target.value,
                                    })
                                }
                                maxLength={16}
                                placeholder="16 digit"
                                className="h-9 bg-background/50"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                NPWP
                            </Label>
                            <Input
                                value={personal.npwp}
                                onChange={(e) =>
                                    setPersonal({
                                        ...personal,
                                        npwp: e.target.value,
                                    })
                                }
                                className="h-9 bg-background/50"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                Tanggal Lahir
                            </Label>
                            <Input
                                type="date"
                                value={personal.birthDate}
                                onChange={(e) =>
                                    setPersonal({
                                        ...personal,
                                        birthDate: e.target.value,
                                    })
                                }
                                className="h-9 bg-background/50"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                Tempat Lahir
                            </Label>
                            <Input
                                value={personal.birthPlace}
                                onChange={(e) =>
                                    setPersonal({
                                        ...personal,
                                        birthPlace: e.target.value,
                                    })
                                }
                                className="h-9 bg-background/50"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                Jenis Kelamin
                            </Label>
                            <Select
                                value={personal.gender}
                                onValueChange={(v) =>
                                    setPersonal({
                                        ...personal,
                                        gender: v as PersonalData['gender'],
                                    })
                                }
                            >
                                <SelectTrigger className="h-9 bg-background/50">
                                    <SelectValue placeholder="Pilih" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="MALE">
                                        Laki-laki
                                    </SelectItem>
                                    <SelectItem value="FEMALE">
                                        Perempuan
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                Status Pernikahan
                            </Label>
                            <Select
                                value={personal.maritalStatus}
                                onValueChange={(v) =>
                                    setPersonal({
                                        ...personal,
                                        maritalStatus:
                                            v as PersonalData['maritalStatus'],
                                    })
                                }
                            >
                                <SelectTrigger className="h-9 bg-background/50">
                                    <SelectValue placeholder="Pilih" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="SINGLE">
                                        Belum Menikah
                                    </SelectItem>
                                    <SelectItem value="MARRIED">
                                        Menikah
                                    </SelectItem>
                                    <SelectItem value="DIVORCED">
                                        Cerai
                                    </SelectItem>
                                    <SelectItem value="WIDOWED">
                                        Janda/Duda
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs font-semibold">
                            Alamat
                        </Label>
                        <Textarea
                            value={personal.address}
                            onChange={(e) =>
                                setPersonal({
                                    ...personal,
                                    address: e.target.value,
                                })
                            }
                            rows={2}
                            className="bg-background/50"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                No. HP
                            </Label>
                            <Input
                                value={personal.phone}
                                onChange={(e) =>
                                    setPersonal({
                                        ...personal,
                                        phone: e.target.value,
                                    })
                                }
                                className="h-9 bg-background/50"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                Bank
                            </Label>
                            <Input
                                value={personal.bankName}
                                onChange={(e) =>
                                    setPersonal({
                                        ...personal,
                                        bankName: e.target.value,
                                    })
                                }
                                placeholder="BCA / Mandiri / dll"
                                className="h-9 bg-background/50"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                No. Rekening
                            </Label>
                            <Input
                                value={personal.bankAccountNo}
                                onChange={(e) =>
                                    setPersonal({
                                        ...personal,
                                        bankAccountNo: e.target.value,
                                    })
                                }
                                className="h-9 bg-background/50"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                Nama Pemilik Rekening
                            </Label>
                            <Input
                                value={personal.bankAccountName}
                                onChange={(e) =>
                                    setPersonal({
                                        ...personal,
                                        bankAccountName: e.target.value,
                                    })
                                }
                                className="h-9 bg-background/50"
                            />
                        </div>
                    </div>
                    <div className="rounded-md bg-muted/20 p-2 space-y-2">
                        <div className="text-xs font-semibold text-muted-foreground">
                            Kontak Darurat
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs font-semibold">
                                    Nama
                                </Label>
                                <Input
                                    value={
                                        personal.emergencyContactName
                                    }
                                    onChange={(e) =>
                                        setPersonal({
                                            ...personal,
                                            emergencyContactName:
                                                e.target.value,
                                        })
                                    }
                                    className="h-9 bg-background/50"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-semibold">
                                    No. HP
                                </Label>
                                <Input
                                    value={
                                        personal.emergencyContactPhone
                                    }
                                    onChange={(e) =>
                                        setPersonal({
                                            ...personal,
                                            emergencyContactPhone:
                                                e.target.value,
                                        })
                                    }
                                    className="h-9 bg-background/50"
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                Hubungan
                            </Label>
                            <Input
                                value={
                                    personal.emergencyContactRelation
                                }
                                onChange={(e) =>
                                    setPersonal({
                                        ...personal,
                                        emergencyContactRelation:
                                            e.target.value,
                                    })
                                }
                                placeholder="Istri / Orang Tua / dll"
                                className="h-9 bg-background/50"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
