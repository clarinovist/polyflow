// @vitest-environment jsdom
import {fireEvent,render,screen} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {ListToolbar} from '../list-toolbar';
import {ActiveFilterChips} from '../active-filter-chips';
import {StatusFilterChips} from '../status-filter-chips';
import {ListResultSummary} from '../list-result-summary';

describe('list workbench primitives',()=>{
 it('composes toolbar slots without route or domain knowledge',()=>{render(<ListToolbar search={<input aria-label="Cari record"/>} filters={<button>Filter</button>} actions={<button>Aksi</button>}/>);expect(screen.getByLabelText('Cari record')).toBeTruthy();expect(screen.getByRole('button',{name:'Filter'})).toBeTruthy();expect(screen.getByRole('button',{name:'Aksi'})).toBeTruthy();});
 it('removes individual active filters and resets all',()=>{const remove=vi.fn(),reset=vi.fn();render(<ActiveFilterChips filters={[{id:'customer',label:'Customer: Sintetis'}]} onRemove={remove} onReset={reset}/>);fireEvent.click(screen.getByRole('button',{name:'Hapus filter Customer: Sintetis'}));expect(remove).toHaveBeenCalledWith('customer');fireEvent.click(screen.getByRole('button',{name:'Reset semua'}));expect(reset).toHaveBeenCalledOnce();});
 it('uses aria-pressed for a single selected status with full-scope counts',()=>{const change=vi.fn();render(<StatusFilterChips options={[{value:'all',label:'Semua',count:51},{value:'open',label:'Perlu diproses',count:9}]} value="all" onChange={change}/>);expect(screen.getByRole('button',{name:/Semua/}).getAttribute('aria-pressed')).toBe('true');fireEvent.click(screen.getByRole('button',{name:/Perlu diproses/}));expect(change).toHaveBeenCalledWith('open');});
 it('normalizes result summary for zero rows',()=>{render(<ListResultSummary start={1} end={0} total={0} hint="Scope sintetis"/>);expect(screen.getByRole('status').textContent).toBe('Menampilkan 0–0 dari 0');expect(screen.getByText('Scope sintetis')).toBeTruthy();});
});
