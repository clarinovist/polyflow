// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({inspect:vi.fn(),activate:vi.fn()}));
vi.mock('@/actions/finance/production-cost-recovery',()=>({inspectForwardCostPeriod:m.inspect,activateForwardCostPeriod:m.activate}));
import {ForwardCostPeriod} from '../ForwardCostPeriod';
const preview={alreadyApplied:false,fingerprint:'a'.repeat(64),historicalAmount:'40.00',movementCount:4,outputCount:1,storageReady:true};
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
        m.inspect.mockResolvedValueOnce({success:true,data:{...preview,storageReady:false}});fireEvent.click(screen.getByRole('button'));await screen.findByRole('alert');
        expect((screen.getByRole('button',{name:'Aktifkan batas biaya baru'}) as HTMLButtonElement).disabled).toBe(true);
    });
    it('retains same fingerprint/reason for retry after unknown response',async()=>{
        m.activate.mockRejectedValueOnce(new Error('lost'));render(<ForwardCostPeriod orderId="wo"/>);fireEvent.click(screen.getByRole('button'));await screen.findByRole('checkbox');
        fireEvent.change(screen.getByRole('textbox'),{target:{value:'Preserve historic values only'}});fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Aktifkan batas biaya baru'}));
        await screen.findByRole('button',{name:'Ulangi aktivasi yang sama'});fireEvent.click(screen.getByRole('button',{name:'Ulangi aktivasi yang sama'}));
        await screen.findByText(/Batas biaya sudah tercatat/);expect(m.activate.mock.calls[0]).toEqual(m.activate.mock.calls[1]);
    });
});
