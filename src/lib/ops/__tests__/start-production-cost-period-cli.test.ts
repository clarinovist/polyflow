import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseCostPeriodRequest, savePeriodBackup } from '../../../../scripts/start-production-cost-period';
const input = { tenant:'synthetic',database:'synthetic_test',orderId:'11111111-1111-4111-8111-111111111111',orderNumber:'WO-SYNTHETIC',actorId:'finance',reason:'Reviewed forward-only boundary' };
describe('operational forward-only cost wrapper',()=>{
    it('requires exact target and reviewed fingerprint only for execute',()=>{
        expect(parseCostPeriodRequest(input,false)).toEqual(input);
        expect(()=>parseCostPeriodRequest(input,true)).toThrow('fingerprint');
        expect(parseCostPeriodRequest({...input,fingerprint:'a'.repeat(64)},true).fingerprint).toBe('a'.repeat(64));
        expect(()=>parseCostPeriodRequest({...input,amount:40},true)).toThrow();
        expect(()=>parseCostPeriodRequest({...input,tenant:'../other'},false)).toThrow();
    });
    it('creates an exclusive readback-verified durable evidence file',async()=>{
        const root=await mkdtemp(join(tmpdir(),'cost-period-cli-'));
        try{
            const ref=await savePeriodBackup(root,'tenant',{historicalAmount:'40.00'},'a'.repeat(64));
            const [path,digest]=ref.split('#sha256=');
            expect(createHash('sha256').update(await readFile(path)).digest('hex')).toBe(digest);
            await savePeriodBackup(root,'tenant',{},'a'.repeat(64));
            expect(await readdir(join(root,'production-cost-period'))).toHaveLength(2);
        }finally{await rm(root,{recursive:true,force:true});}
    });
    it('is deliberately bundled, smoke-tested and shipped by the CI image build',()=>{
        const docker=readFileSync('Dockerfile','utf8');
        expect(docker).toContain('esbuild scripts/start-production-cost-period.ts --bundle');
        expect(docker).toContain('node /app/ops-dist/scripts/start-production-cost-period.js --help');
        expect(docker).toContain('/app/ops-dist/scripts/start-production-cost-period.js \\');
    });
});
