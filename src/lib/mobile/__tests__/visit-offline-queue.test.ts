import { describe, expect, it } from 'vitest';
import { activeVisitKey, discardFailedVisits, enqueueVisit, readVisitQueue, visitQueueKey } from '../visit-offline-queue';
function memory(){const map=new Map<string,string>();return{getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>void map.set(k,v)};}
const log={id:'local-1',clientVisitId:'visit-1',customerId:'customer',customerName:'Synthetic',checkInTime:'2026-10-08T00:00:00Z',checkOutTime:'2026-10-08T00:05:00Z',durationSeconds:300,latitude:0,longitude:0,distance:0,notes:'Synthetic',synced:false,retryCount:0};
describe('visit offline queue partition',()=>{
 it('partitions queue and active state by tenant and user and upserts idempotently',()=>{const s=memory();const a={tenantId:'a',userId:'one'};const b={tenantId:'b',userId:'one'};enqueueVisit(s,a,log);enqueueVisit(s,a,{...log,notes:'updated'});expect(readVisitQueue(s,a)).toHaveLength(1);expect(readVisitQueue(s,a)[0].notes).toBe('updated');expect(readVisitQueue(s,b)).toEqual([]);expect(visitQueueKey(a)).not.toBe(visitQueueKey(b));expect(activeVisitKey(a)).not.toBe(activeVisitKey(b));});
 it('discards only bounded failures after caller confirmation',()=>{const s=memory();const p={tenantId:'a',userId:'one'};enqueueVisit(s,p,{...log,retryCount:3});enqueueVisit(s,p,{...log,id:'keep',clientVisitId:'keep',retryCount:2});expect(discardFailedVisits(s,p,3).map(x=>x.id)).toEqual(['keep']);});
});
