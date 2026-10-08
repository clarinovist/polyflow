import { describe,it,expect,vi } from 'vitest';
const action=vi.hoisted(()=>vi.fn());
vi.mock('@/actions/sales/visits',()=>({syncVisitLogsAction:action}));
import { getCommandDef } from '../offline-command-registry';
import { executeQueuedVisit, SALES_VISIT_SYNC_COMMAND } from '../sales-visit-offline-command';
const log={id:'x',customerId:'c',customerName:'Synthetic',checkInTime:'a',checkOutTime:'b',durationSeconds:1,latitude:0,longitude:0,distance:0,notes:'Synthetic'};
describe('sales visit offline command',()=>{it('registers the bounded visit command used by runtime',()=>{const def=getCommandDef(SALES_VISIT_SYNC_COMMAND);expect(def?.type).toBe('sales.visit.sync');expect(def?.requiresOnline).toBe(false);expect(def?.validate(log)).toBe(true);expect(def?.validate({type:'arbitrary.server.action'})).toBe(false);});it('executes through the idempotent batch sync action',async()=>{action.mockResolvedValue({success:true,data:{results:[]}});await executeQueuedVisit(log);expect(action).toHaveBeenCalledWith([expect.objectContaining({clientId:'x',customerId:'c'})]);});});
