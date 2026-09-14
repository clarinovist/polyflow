export const STATUS_STYLES: Record<string, string> = {
    DRAFT: 'bg-yellow-100 text-yellow-800',
    ACTIVE: 'bg-blue-100 text-blue-800',
    CLOSED: 'bg-green-100 text-green-800',
    CONFIRMED: 'bg-blue-100 text-blue-800',
    IN_TRANSIT: 'bg-blue-100 text-blue-800',
    COMPLETED: 'bg-green-100 text-green-800',
};

export const STATUS_LABELS: Record<string, string> = {
    DRAFT: 'Draft',
    ACTIVE: 'Aktif',
    CLOSED: 'Selesai',
    CONFIRMED: 'Aktif',
    IN_TRANSIT: 'Aktif',
    COMPLETED: 'Selesai',
};

export const TRIP_STATUS_LABELS: Record<string, string> = {
    PLANNED: 'Direncanakan',
    CONFIRMED: 'Dikonfirmasi',
    DEPARTED: 'Berangkat',
    COMPLETED: 'Selesai',
    CANCELLED: 'Dibatalkan',
};

export const TRIP_STATUS_STYLES: Record<string, string> = {
    PLANNED: 'bg-gray-100 text-gray-700',
    CONFIRMED: 'bg-blue-100 text-blue-700',
    DEPARTED: 'bg-amber-100 text-amber-700',
    COMPLETED: 'bg-green-100 text-green-700',
    CANCELLED: 'bg-red-100 text-red-700',
};

export const STOP_STATUS_LABELS: Record<string, string> = {
    PLANNED: 'Belum diatur',
    LINKED: 'Terjadwal',
    GENERATED: 'Sudah SJ',
    CANCELLED: 'Batal',
};

export const STOP_STATUS_STYLES: Record<string, string> = {
    PLANNED: 'bg-gray-100 text-gray-700',
    LINKED: 'bg-blue-100 text-blue-700',
    GENERATED: 'bg-green-100 text-green-700',
    CANCELLED: 'bg-red-100 text-red-700',
};

export const TRANSPORT_MODE_LABELS: Record<string, string> = {
    INTERNAL_FLEET: 'Armada Internal',
    EXTERNAL_FLEET: 'Armada Luar',
    CUSTOMER_PICKUP: 'Customer Ambil',
    TBD: 'Belum Ditentukan',
};

export const TRANSPORT_MODE_STYLES: Record<string, string> = {
    INTERNAL_FLEET: 'bg-blue-100 text-blue-700',
    EXTERNAL_FLEET: 'bg-purple-100 text-purple-700',
    CUSTOMER_PICKUP: 'bg-teal-100 text-teal-700',
    TBD: 'bg-gray-100 text-gray-500',
};

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
    DELIVERY: 'Pengiriman',
    PICKUP_LOAD: 'Muat/Pickup',
    BACKHAUL: 'Backhaul',
    OTHER: 'Lainnya',
};

export const ACTIVITY_TYPE_STYLES: Record<string, string> = {
    DELIVERY: 'bg-blue-50 text-blue-700',
    PICKUP_LOAD: 'bg-amber-50 text-amber-700',
    BACKHAUL: 'bg-purple-50 text-purple-700',
    OTHER: 'bg-gray-50 text-gray-500',
};

export function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

export function formatDateWithDay(dateStr: string | null | Date): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const dayName = date.toLocaleDateString('id-ID', { weekday: 'long' });
    const formattedDate = date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
    return `${dayName}, ${formattedDate}`;
}
