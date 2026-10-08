import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = readFileSync(join(process.cwd(), 'scripts/backup-db.sh'), 'utf8');

describe('scheduled database backup contract', () => {
    it('treats an offsite upload failure as a failed backup job', () => {
        expect(script).toContain('OFFSITE_UPLOAD_FAILURES=0');
        expect(script).toContain('OFFSITE_UPLOAD_FAILURES=$((OFFSITE_UPLOAD_FAILURES + 1))');
        expect(script).toContain('Offsite upload failed for $OFFSITE_UPLOAD_FAILURES database(s)');
        expect(script).not.toContain('WARNING: R2 upload failed (local backup still exists)');
    });

    it('retains local backups when an offsite upload fails', () => {
        const failure = script.indexOf('OFFSITE_UPLOAD_FAILURES=$((OFFSITE_UPLOAD_FAILURES + 1))');
        const cleanup = script.indexOf('find "$BACKUP_DIR" -maxdepth 1');
        const finalFailure = script.indexOf('Offsite upload failed for $OFFSITE_UPLOAD_FAILURES database(s)');
        expect(failure).toBeGreaterThan(-1);
        expect(cleanup).toBeGreaterThan(failure);
        expect(finalFailure).toBeGreaterThan(cleanup);
    });
});
