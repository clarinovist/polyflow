/** Conservative markers for unresolved answers; not an accuracy classifier. */
const UNRESOLVED = [
    /tidak tahu/i,
    /tidak yakin/i,
    /maaf.*tidak bisa/i,
    /tidak memiliki informasi/i,
    /(?:tidak|belum) tersedia/i,
    /belum (?:dapat|bisa) (?:dipastikan|memastikan)/i,
    /(?:tidak|belum) (?:ada|menemukan|ditemukan).{0,90}(?:panduan|artikel|informasi|data)/i,
    /(?:tidak|belum) (?:punya|memiliki) (?:akses|dasar|panduan)/i,
    /(?:bisa|boleh) (?:diperjelas|sebutkan|jelaskan).{0,100}\?/i,
];
export function hasUnresolvedAnswer(answer: string): boolean {
    return UNRESOLVED.some((pattern) => pattern.test(answer));
}
