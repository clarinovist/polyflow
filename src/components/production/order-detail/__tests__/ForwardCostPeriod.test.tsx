// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({inspect:vi.fn(),activate:vi.fn()}));
vi.mock('@/actions/finance/production-cost-recovery',()=>({inspectForwardCostPeriod:m.inspect,activateForwardCostPeriod:m.activate}));
import {ForwardCostPeriod} from '../ForwardCostPeriod';
const preview={alreadyApplied:false,version:1 as const,fingerprint:'a'.repeat(64),historicalAmount:'40.00',movementCount:4,outputCount:1,materialIssueCount:0,scrapRecordCount:0,balances:[],anomalies:[],storageReady:true};
describe('forward-only cost period UI',()=>{
    beforeEach(()=>{vi.resetAllMocks();m.inspect.mockResolvedValue({success:true,data:preview});m.activate.mockResolvedValue({success:true,data:{alreadyApplied:false}});});afterEach(cleanup);
    it('requires explicit approval of retained history, not historical correction',async()=>{
        render(<ForwardCostPeriod orderId="wo"/>);
        fireEvent.click(screen.getByRole('button',{name:'Periksa kelayakan batas biaya'}));
        await screen.findByLabelText('Alasan batas biaya (minimal 12 karakter)');
        const button=screen.getByRole('button',{name:'Aktifkan batas biaya baru'}) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        fireEvent.change(screen.getByRole('textbox'),{target:{value:'Preserve historic values only'}});fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(button);await screen.findByRole('status');
        expect(m.activate).toHaveBeenCalledWith({orderId:'wo',fingerprint:preview.fingerprint,reason:'Preserve historic values only',confirmed:true});
        expect(screen.queryByRole('checkbox')).toBeNull();
    });
    it('never activates a blocked preview or unavailable backup',async()=>{
        m.inspect.mockResolvedValueOnce({success:false,error:'Manual issue history unsupported'});
        render(<ForwardCostPeriod orderId="wo"/>);fireEvent.click(screen.getByRole('button'));await screen.findByRole('status');expect(screen.queryByRole('checkbox')).toBeNull();
        // The status message can render before React finishes the transition.
        // Wait for the actual retry control, not just the previous response.
        const retry=screen.getByRole('button',{name:'Periksa kelayakan batas biaya'}) as HTMLButtonElement;
        await waitFor(()=>expect(retry.disabled).toBe(false));
        m.inspect.mockResolvedValueOnce({success:true,data:{...preview,storageReady:false}});fireEvent.click(retry);
        await waitFor(()=>expect(m.inspect).toHaveBeenCalledTimes(2));
        await screen.findByRole('alert');
        expect((screen.getByRole('button',{name:'Aktifkan batas biaya baru'}) as HTMLButtonElement).disabled).toBe(true);
    });
    it('retains same fingerprint/reason for retry after unknown response',async()=>{
        m.activate.mockRejectedValueOnce(new Error('lost'));render(<ForwardCostPeriod orderId="wo"/>);fireEvent.click(screen.getByRole('button'));await screen.findByRole('checkbox');
        fireEvent.change(screen.getByRole('textbox'),{target:{value:'Preserve historic values only'}});fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Aktifkan batas biaya baru'}));
        await screen.findByRole('button',{name:'Ulangi aktivasi yang sama'});fireEvent.click(screen.getByRole('button',{name:'Ulangi aktivasi yang sama'}));
        await screen.findByText(/Batas biaya sudah tercatat/);expect(m.activate.mock.calls[0]).toEqual(m.activate.mock.calls[1]);
    });
    it('offers legacy seal mode only when STRICT fails with PRODUCTION_COST_PERIOD_INVALID',async()=>{
        render(<ForwardCostPeriod orderId="wo"/>);
        fireEvent.click(screen.getByRole('button',{name:'Periksa kelayakan batas biaya'}));
        await screen.findByLabelText('Alasan batas biaya (minimal 12 karakter)');
        expect(screen.queryByRole('button',{name:'Periksa mode riwayat khusus'})).toBeNull();
        cleanup();

        m.inspect.mockResolvedValueOnce({success:false,error:'Tidak diizinkan',code:'AUTHORIZATION_ERROR'});
        render(<ForwardCostPeriod orderId="wo"/>);
        fireEvent.click(screen.getByRole('button',{name:'Periksa kelayakan batas biaya'}));
        await screen.findByRole('status');
        expect(screen.queryByRole('button',{name:'Periksa mode riwayat khusus'})).toBeNull();
        cleanup();

        m.inspect.mockResolvedValueOnce({success:false,error:'Batas biaya SPK belum dapat digunakan: hasil pernah di-void.',code:'PRODUCTION_COST_PERIOD_INVALID'});
        render(<ForwardCostPeriod orderId="wo"/>);
        fireEvent.click(screen.getByRole('button',{name:'Periksa kelayakan batas biaya'}));
        await screen.findByRole('status');
        expect(screen.getByRole('button',{name:'Periksa mode riwayat khusus'})).toBeTruthy();
    });
    it('validates v2 acknowledgment, 30-char reason, storage readiness, and retries identical v2 payload',async()=>{
        const v2Preview={
            alreadyApplied:false,
            version:2 as const,
            fingerprint:'b'.repeat(64),
            historicalAmount:'-85.50',
            movementCount:6,
            outputCount:2,
            materialIssueCount:2,
            scrapRecordCount:1,
            storageReady:true,
            balances:[{accountId:'acc-wip',code:'1140',name:'Barang Dalam Proses',amount:'-85.50'}],
            anomalies:[{category:'VOIDED_EXECUTIONS',count:1},{category:'CUSTOM_ANOMALY',count:2}],
        };
        const strictError='Batas biaya SPK belum dapat digunakan: hasil lama harus sudah selesai dan cocok dengan total SPK.';
        m.inspect
            .mockResolvedValueOnce({success:false,error:strictError,code:'PRODUCTION_COST_PERIOD_INVALID'})
            .mockResolvedValueOnce({success:true,data:{...v2Preview,storageReady:false}});
        render(<ForwardCostPeriod orderId="wo"/>);
        fireEvent.click(screen.getByRole('button',{name:'Periksa kelayakan batas biaya'}));
        const legacyBtn=await screen.findByRole('button',{name:'Periksa mode riwayat khusus'}) as HTMLButtonElement;
        await waitFor(()=>expect(legacyBtn.disabled).toBe(false));
        fireEvent.click(legacyBtn);
        await screen.findByRole('alert');
        await waitFor(()=>expect(screen.queryByRole('status')).toBeNull());
        expect(m.inspect).toHaveBeenLastCalledWith({orderId:'wo',mode:'REVIEWED_LEGACY_SEAL'});
        expect(screen.getByText(/1140 — Barang Dalam Proses/)).toBeTruthy();
        expect(screen.getByText(/-Rp\s*85,50 \(negatif\)/)).toBeTruthy();
        const anomalySection=screen.getByText('Anomali historis yang dipertahankan:').parentElement!;
        expect(within(anomalySection).getByText(/hasil pernah di-void/i)).toBeTruthy();
        expect(within(anomalySection).getByText(/CUSTOM_ANOMALY/)).toBeTruthy();

        const longReason='Menyegel riwayat SPK lama yang memiliki hasil void setelah ditinjau Finance';
        fireEvent.change(screen.getByRole('textbox'),{target:{value:longReason}});
        fireEvent.click(screen.getByLabelText(/Saya memahami anomali di atas tetap dipertahankan dan tidak direkonsiliasi/i));
        fireEvent.click(screen.getByLabelText(/Saya menyetujui: catatan lama tetap utuh/i));
        expect((screen.getByRole('button',{name:'Aktifkan batas biaya (riwayat khusus)'}) as HTMLButtonElement).disabled).toBe(true);

        cleanup();
        render(<ForwardCostPeriod orderId="wo"/>);
        m.inspect.mockResolvedValueOnce({success:false,error:strictError,code:'PRODUCTION_COST_PERIOD_INVALID'}).mockResolvedValueOnce({success:true,data:v2Preview});
        fireEvent.click(screen.getByRole('button',{name:'Periksa kelayakan batas biaya'}));
        const legacyBtn2=await screen.findByRole('button',{name:'Periksa mode riwayat khusus'}) as HTMLButtonElement;
        await waitFor(()=>expect(legacyBtn2.disabled).toBe(false));
        fireEvent.click(legacyBtn2);
        const submit=await screen.findByRole('button',{name:'Aktifkan batas biaya (riwayat khusus)'}) as HTMLButtonElement;
        await waitFor(()=>expect( (screen.getByRole('textbox') as HTMLTextAreaElement).disabled ).toBe(false));
        expect(submit.disabled).toBe(true);

        fireEvent.change(screen.getByRole('textbox'),{target:{value:'Too short under 30 chars'}});
        fireEvent.click(screen.getByLabelText(/Saya memahami anomali di atas tetap dipertahankan dan tidak direkonsiliasi/i));
        fireEvent.click(screen.getByLabelText(/Saya menyetujui: catatan lama tetap utuh/i));
        expect(submit.disabled).toBe(true);

        fireEvent.change(screen.getByRole('textbox'),{target:{value:longReason}});
        expect(submit.disabled).toBe(false);

        m.activate.mockRejectedValueOnce(new Error('lost'));
        fireEvent.click(submit);
        const retryBtn=await screen.findByRole('button',{name:'Ulangi aktivasi yang sama'});
        fireEvent.click(retryBtn);
        await screen.findByText(/Batas biaya sudah tercatat/);
        expect(m.activate).toHaveBeenCalledWith({
            orderId:'wo',
            fingerprint:v2Preview.fingerprint,
            reason:longReason,
            confirmed:true,
            mode:'REVIEWED_LEGACY_SEAL',
            acknowledgeRetainedAnomalies:true,
        });
        expect(m.activate.mock.calls[0]).toEqual(m.activate.mock.calls[1]);
    });
});
