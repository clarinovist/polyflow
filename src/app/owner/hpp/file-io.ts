/** Browser-only helpers for exporting and importing the workspace JSON. */
export function downloadJson(filename: string, data: unknown): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

export async function readJsonFile(file: File): Promise<unknown> {
    return JSON.parse(await file.text());
}
