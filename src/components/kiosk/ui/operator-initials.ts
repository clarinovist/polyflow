/** Up to two initials, e.g. "Budi Santoso" → "BS", "Operator 3" → "O3". */
export function operatorInitials(name: string): string {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word.charAt(0))
        .join('')
        .toUpperCase();
}
