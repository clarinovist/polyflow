// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, type Employee, type EmployeeAllowance } from '@prisma/client';
import { EmployeeForm } from '../EmployeeForm';

const mocks = vi.hoisted(() => ({
    createEmployee: vi.fn<typeof import('@/actions/admin/employees').createEmployee>(),
    updateEmployee: vi.fn<typeof import('@/actions/admin/employees').updateEmployee>(),
    generateNextEmployeeCode: vi.fn<typeof import('@/actions/admin/employees').generateNextEmployeeCode>(),
    getJobRoles: vi.fn<typeof import('@/actions/admin/roles').getJobRoles>(),
    createJobRole: vi.fn<typeof import('@/actions/admin/roles').createJobRole>(),
    setEmployeePin: vi.fn<typeof import('@/actions/admin/attendance').setEmployeePin>(),
    clearEmployeePin: vi.fn<typeof import('@/actions/admin/attendance').clearEmployeePin>(),
    listEmployeeAllowances: vi.fn<typeof import('@/actions/hrd/payroll-monthly').listEmployeeAllowances>(),
    replaceEmployeeAllowances: vi.fn<typeof import('@/actions/hrd/payroll-monthly').replaceEmployeeAllowances>(),
    router: { push: vi.fn(), refresh: vi.fn(), back: vi.fn() },
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/actions/admin/employees', () => ({
    createEmployee: mocks.createEmployee,
    updateEmployee: mocks.updateEmployee,
    generateNextEmployeeCode: mocks.generateNextEmployeeCode,
}));
vi.mock('@/actions/admin/roles', () => ({
    getJobRoles: mocks.getJobRoles,
    createJobRole: mocks.createJobRole,
}));
vi.mock('@/actions/admin/attendance', () => ({
    setEmployeePin: mocks.setEmployeePin,
    clearEmployeePin: mocks.clearEmployeePin,
}));
vi.mock('@/actions/hrd/payroll-monthly', () => ({
    listEmployeeAllowances: mocks.listEmployeeAllowances,
    replaceEmployeeAllowances: mocks.replaceEmployeeAllowances,
}));
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }));
vi.mock('sonner', () => ({ toast: mocks.toast }));

// Entirely synthetic fixtures: no tenant, contact, bank or identity data.
const date = new Date('2026-01-02T00:00:00.000Z');
const decimal = (value: number) => new Prisma.Decimal(value);
function employee(overrides: Partial<Employee> = {}): Employee {
    return {
        id: 'synthetic-employee', name: 'Synthetic Worker', code: 'TEST-001',
        role: 'TEST ROLE', status: 'ACTIVE', payType: 'DAILY',
        createdAt: date, updatedAt: date, dailyRate: decimal(100),
        overtimeHourlyRate: null, standardDayHours: decimal(8), pinHash: null,
        employmentStatus: 'PROBATION', joinDate: null, probationEndDate: null,
        contractEndDate: null, nik: null, npwp: null, birthDate: null,
        birthPlace: null, gender: null, maritalStatus: null, address: null,
        phone: null, photoUrl: null, bankName: null, bankAccountNo: null,
        bankAccountName: null, emergencyContactName: null,
        emergencyContactPhone: null, emergencyContactRelation: null,
        monthlySalary: null, bpjsParticipant: false, bpjsEmployeeDeduction: null,
        bpjsEmployerCost: null, bpjsKesehatanNo: null, bpjsKetenagakerjaanNo: null,
        ...overrides,
    };
}
function allowance(overrides: Partial<EmployeeAllowance> = {}): EmployeeAllowance {
    return {
        id: 'synthetic-allowance', employeeId: 'synthetic-employee',
        name: 'Synthetic allowance', amount: decimal(15), isActive: true,
        createdAt: date, updatedAt: date, ...overrides,
    };
}
const emptyPersonal = {
    employmentStatus: 'PROBATION', joinDate: undefined, probationEndDate: undefined,
    contractEndDate: undefined, nik: undefined, npwp: undefined, birthDate: undefined,
    birthPlace: undefined, gender: undefined, maritalStatus: undefined,
    address: undefined, phone: undefined, bankName: undefined,
    bankAccountNo: undefined, bankAccountName: undefined,
    emergencyContactName: undefined, emergencyContactPhone: undefined,
    emergencyContactRelation: undefined,
};
const defaultPayload = {
    name: 'Synthetic Worker', code: 'TEST-002', role: '', status: 'ACTIVE',
    payType: 'DAILY', dailyRate: 0, overtimeHourlyRate: 0, standardDayHours: 8,
    monthlySalary: 0, bpjsParticipant: false, bpjsEmployeeDeduction: 0,
    bpjsEmployerCost: 0, bpjsKesehatanNo: '', bpjsKetenagakerjaanNo: '',
    personal: emptyPersonal,
};

// Radix/cmdk use browser APIs absent from jsdom; keep the real UI primitives.
class TestResizeObserver implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}
async function renderForm(props: React.ComponentProps<typeof EmployeeForm> = {}) {
    await act(async () => { render(<EmployeeForm {...props} />); });
}
function change(element: HTMLElement, value: string) {
    fireEvent.change(element, { target: { value } });
}
function inputByLabelText(text: string): HTMLInputElement {
    const input = screen.getByText(text, { selector: 'label' })
        .parentElement?.querySelector('input');
    if (!(input instanceof HTMLInputElement)) throw new Error(`Missing input: ${text}`);
    return input;
}
function submit() {
    const form = screen.getByLabelText('Full Name').closest('form');
    if (!form) throw new Error('Missing employee form');
    fireEvent.submit(form);
}
async function expectNavigation() {
    await waitFor(() => expect(mocks.router.refresh).toHaveBeenCalledOnce());
    expect(mocks.router.push).toHaveBeenCalledWith('/dashboard/employees');
    expect(mocks.router.push.mock.invocationCallOrder[0])
        .toBeLessThan(mocks.router.refresh.mock.invocationCallOrder[0]);
}

const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    mocks.getJobRoles.mockResolvedValue({ success: true, data: [] });
    mocks.generateNextEmployeeCode.mockResolvedValue({ success: true, data: 'TEST-002' });
    mocks.createEmployee.mockResolvedValue({ success: true, data: employee() });
    mocks.updateEmployee.mockResolvedValue({ success: true, data: employee() });
    mocks.listEmployeeAllowances.mockResolvedValue({ success: true, data: [] });
    mocks.replaceEmployeeAllowances.mockResolvedValue({ success: true, data: [] });
    mocks.setEmployeePin.mockResolvedValue({ success: true });
    mocks.clearEmployeePin.mockResolvedValue({ success: true });
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (scrollIntoViewDescriptor) {
        Object.defineProperty(Element.prototype, 'scrollIntoView', scrollIntoViewDescriptor);
    } else {
        Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
});

describe('EmployeeForm characterization (real form, mocked actions)', () => {
    it('creates the complete default payload with generated read-only code and no edit-only PIN', async () => {
        await renderForm();
        const code = screen.getByLabelText<HTMLInputElement>('Worker Code (Auto-generated)');
        expect(code.value).toBe('TEST-002');
        expect(code.readOnly).toBe(true);
        expect(screen.queryByText('PIN Kiosk')).toBeNull();
        expect(screen.queryByText('Status Kepegawaian')).toBeNull();
        change(screen.getByLabelText('Full Name'), 'Synthetic Worker');
        submit();
        await expectNavigation();
        expect(mocks.createEmployee).toHaveBeenCalledExactlyOnceWith(defaultPayload);
        expect(mocks.updateEmployee).not.toHaveBeenCalled();
        expect(mocks.replaceEmployeeAllowances).not.toHaveBeenCalled();
    });

    it('updates complete numeric/personal payload, date serialization and status without losing input focus', async () => {
        await renderForm({ initialData: employee({
            joinDate: date, probationEndDate: date, contractEndDate: date,
            birthDate: date, gender: 'FEMALE', maritalStatus: 'SINGLE',
            employmentStatus: 'CONTRACT', overtimeHourlyRate: decimal(12.5),
        }) });
        const name = screen.getByLabelText<HTMLInputElement>('Full Name');
        name.focus();
        change(name, 'Synthetic Edited');
        expect(document.activeElement).toBe(name);
        expect(screen.getByLabelText('Full Name')).toBe(name);
        fireEvent.click(screen.getByLabelText('Active Status'));
        fireEvent.click(screen.getByRole('button', { name: /Data Pribadi/ }));
        expect(inputByLabelText('Tanggal Masuk').value).toBe('2026-01-02');
        change(inputByLabelText('Tanggal Masuk'), '2026-02-03');
        submit();
        await expectNavigation();
        expect(mocks.updateEmployee).toHaveBeenCalledExactlyOnceWith('synthetic-employee', {
            ...defaultPayload, name: 'Synthetic Edited', code: 'TEST-001',
            role: 'TEST ROLE', status: 'INACTIVE', dailyRate: 100,
            overtimeHourlyRate: 12.5, personal: {
                ...emptyPersonal, employmentStatus: 'CONTRACT', joinDate: '2026-02-03',
                probationEndDate: '2026-01-02', contractEndDate: '2026-01-02',
                birthDate: '2026-01-02', gender: 'FEMALE', maritalStatus: 'SINGLE',
            },
        });
        expect(mocks.generateNextEmployeeCode).not.toHaveBeenCalled();
        expect(mocks.replaceEmployeeAllowances).not.toHaveBeenCalled();
    });

    it('hides all compensation/BPJS/allowance controls when canEditSalary is false but keeps personal and PIN', async () => {
        await renderForm({ initialData: employee({ payType: 'MONTHLY', bpjsParticipant: true }), canEditSalary: false });
        expect(screen.getByText(/Data gaji & BPJS dikelola/)).toBeTruthy();
        expect(screen.queryByText('Skema Gaji')).toBeNull();
        expect(screen.queryByLabelText('Gaji Pokok Bulanan (IDR)')).toBeNull();
        expect(screen.queryByText('Peserta BPJS')).toBeNull();
        expect(screen.queryByText('Tunjangan tetap')).toBeNull();
        expect(screen.getByText('Status Kepegawaian')).toBeTruthy();
        expect(screen.getByText('PIN Kiosk')).toBeTruthy();
    });

    it('keeps DAILY numeric normalization and standard-hour fallback with BPJS available', async () => {
        await renderForm();
        change(screen.getByLabelText('Full Name'), 'Synthetic Worker');
        change(screen.getByLabelText('Upah Harian / Daily Rate (IDR)'), '123.5');
        change(screen.getByLabelText('Tarif Lembur per Jam (IDR) — Opsional'), '');
        change(screen.getByLabelText('Jam Kerja Standar per Hari'), '0');
        expect(screen.getByLabelText<HTMLInputElement>('Jam Kerja Standar per Hari').value).toBe('8');
        expect(screen.getByText('Peserta BPJS')).toBeTruthy();
        expect(screen.queryByLabelText('Gaji Pokok Bulanan (IDR)')).toBeNull();
        submit();
        await expectNavigation();
        expect(mocks.createEmployee).toHaveBeenCalledWith({ ...defaultPayload, dailyRate: 123.5 });
    });

    it('switches PIECE to process-rate explanation, retaining DAILY state and BPJS inputs', async () => {
        await renderForm({ initialData: employee() });
        fireEvent.click(screen.getByRole('radio', { name: /Borongan/ }));
        expect(screen.getByText('Borongan mengikuti tarif proses mesin')).toBeTruthy();
        expect(screen.queryByLabelText('Upah Harian / Daily Rate (IDR)')).toBeNull();
        expect(screen.queryByLabelText('Gaji Pokok Bulanan (IDR)')).toBeNull();
        const bpjs = screen.getAllByRole('switch').find((item) => item.id !== 'status');
        if (!bpjs) throw new Error('Missing BPJS switch');
        fireEvent.click(bpjs);
        change(inputByLabelText('Potongan Karyawan /bln (IDR)'), '17');
        change(inputByLabelText('Beban Perusahaan /bln (IDR)'), '23');
        submit();
        await expectNavigation();
        expect(mocks.updateEmployee).toHaveBeenCalledWith('synthetic-employee', {
            ...defaultPayload, code: 'TEST-001', role: 'TEST ROLE', payType: 'PIECE',
            dailyRate: 100, bpjsParticipant: true, bpjsEmployeeDeduction: 17, bpjsEmployerCost: 23,
        });
        expect(mocks.replaceEmployeeAllowances).not.toHaveBeenCalled();
    });

    it('loads only active allowances and saves trimmed/filtered rows after an existing MONTHLY employee', async () => {
        mocks.listEmployeeAllowances.mockResolvedValue({ success: true, data: [
            allowance(), allowance({ id: 'inactive', name: 'Inactive synthetic', isActive: false }),
        ] });
        await renderForm({ initialData: employee({ payType: 'MONTHLY', monthlySalary: decimal(200) }) });
        expect(screen.getByText('Status Kepegawaian')).toBeTruthy();
        expect(screen.queryByLabelText('Upah Harian / Daily Rate (IDR)')).toBeNull();
        expect(screen.queryByDisplayValue('Inactive synthetic')).toBeNull();
        expect(screen.getByDisplayValue('15')).toBeTruthy();
        change(screen.getByLabelText('Gaji Pokok Bulanan (IDR)'), '250.5');
        const existingName = screen.getByDisplayValue('Synthetic allowance');
        existingName.focus();
        change(existingName, '  Synthetic renamed  ');
        fireEvent.click(screen.getAllByRole('button', { name: 'Tambah' })[0]);
        expect(screen.getAllByPlaceholderText('Tunjangan Transport')[0]).toBe(existingName);
        expect((existingName as HTMLInputElement).value).toBe('  Synthetic renamed  ');
        expect(document.activeElement).toBe(existingName);
        const rowNames = screen.getAllByPlaceholderText<HTMLInputElement>('Tunjangan Transport');
        change(rowNames[1], '   ');
        submit();
        await expectNavigation();
        expect(mocks.updateEmployee).toHaveBeenCalledWith('synthetic-employee', expect.objectContaining({ payType: 'MONTHLY', monthlySalary: 250.5 }));
        expect(mocks.replaceEmployeeAllowances).toHaveBeenCalledExactlyOnceWith('synthetic-employee', [
            { id: 'synthetic-allowance', name: 'Synthetic renamed', amount: 15, isActive: true },
        ]);
        expect(mocks.updateEmployee.mock.invocationCallOrder[0]).toBeLessThan(mocks.replaceEmployeeAllowances.mock.invocationCallOrder[0]);
        expect(mocks.replaceEmployeeAllowances.mock.invocationCallOrder[0]).toBeLessThan(mocks.router.push.mock.invocationCallOrder[0]);
    });

    it('creates MONTHLY without trying to save allowances until a stable employee id exists', async () => {
        await renderForm();
        change(screen.getByLabelText('Full Name'), 'Synthetic Worker');
        fireEvent.click(screen.getByRole('radio', { name: /Bulanan/ }));
        expect(screen.getByText('Simpan karyawan dulu, lalu edit ulang untuk menambah tunjangan.')).toBeTruthy();
        expect(screen.queryByText('Status Kepegawaian')).toBeNull();
        change(screen.getByLabelText('Gaji Pokok Bulanan (IDR)'), '900');
        submit();
        await expectNavigation();
        expect(mocks.createEmployee).toHaveBeenCalledWith({ ...defaultPayload, payType: 'MONTHLY', monthlySalary: 900 });
        expect(mocks.listEmployeeAllowances).not.toHaveBeenCalled();
        expect(mocks.replaceEmployeeAllowances).not.toHaveBeenCalled();
    });

    it('reports employee-saved/allowance-failed without navigation and re-enables submission', async () => {
        mocks.replaceEmployeeAllowances.mockResolvedValue({ success: false, error: '', code: 'SYNTHETIC_FAILURE' });
        await renderForm({ initialData: employee({ payType: 'MONTHLY' }) });
        submit();
        await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith('Gaji tersimpan, tapi tunjangan gagal disimpan'));
        expect(mocks.updateEmployee).toHaveBeenCalledOnce();
        expect(mocks.replaceEmployeeAllowances).toHaveBeenCalledWith('synthetic-employee', []);
        expect(mocks.updateEmployee.mock.invocationCallOrder[0]).toBeLessThan(mocks.replaceEmployeeAllowances.mock.invocationCallOrder[0]);
        expect(mocks.router.push).not.toHaveBeenCalled();
        expect(mocks.router.refresh).not.toHaveBeenCalled();
        expect(mocks.toast.success).not.toHaveBeenCalled();
        expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Perbarui Pekerja' }).disabled).toBe(false);
    });

    it('strips non-digits and rejects a short PIN before calling the action', async () => {
        await renderForm({ initialData: employee() });
        const pin = screen.getByPlaceholderText<HTMLInputElement>('4-6 digit');
        expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Simpan' }).disabled).toBe(true);
        change(pin, 'a12b3');
        expect(pin.value).toBe('123');
        fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
        expect(mocks.toast.error).toHaveBeenCalledWith('PIN harus 4-6 digit angka');
        expect(mocks.setEmployeePin).not.toHaveBeenCalled();
        expect(pin.value).toBe('123');
    });

    it('limits valid PIN to six digits, saves it, then clears PIN state only after successful actions', async () => {
        await renderForm({ initialData: employee(), hasPin: true });
        const pin = screen.getByPlaceholderText<HTMLInputElement>('••••');
        change(pin, '12345678');
        expect(pin.value).toBe('123456');
        fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
        await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('PIN berhasil disimpan'));
        expect(mocks.setEmployeePin).toHaveBeenCalledExactlyOnceWith('synthetic-employee', '123456');
        expect(pin.value).toBe('');
        expect(screen.getByText('Aktif')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Hapus' }));
        await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('PIN berhasil dihapus'));
        expect(mocks.clearEmployeePin).toHaveBeenCalledExactlyOnceWith('synthetic-employee');
        expect(screen.getByText('Belum diset')).toBeTruthy();
        expect(screen.getByPlaceholderText('4-6 digit')).toBe(pin);
        expect(screen.queryByRole('button', { name: 'Hapus' })).toBeNull();
        expect(mocks.updateEmployee).not.toHaveBeenCalled();
    });

    it('creates and selects a searched role while preserving the generated code', async () => {
        mocks.createJobRole.mockResolvedValue({ success: true, data: {
            id: 'synthetic-role', name: 'SYNTHETIC NEW ROLE', createdAt: date, updatedAt: date,
        } });
        await renderForm();
        change(screen.getByLabelText('Full Name'), 'Synthetic Worker');
        fireEvent.click(screen.getByRole('combobox'));
        const search = screen.getAllByRole('combobox').find((item) => item instanceof HTMLInputElement);
        if (!search) throw new Error('Missing role search');
        change(search, 'SYNTHETIC NEW ROLE');
        fireEvent.click(await screen.findByRole('button', { name: 'Add "SYNTHETIC NEW ROLE"' }));
        await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('Peran pekerjaan berhasil dibuat.'));
        expect(mocks.createJobRole).toHaveBeenCalledExactlyOnceWith('SYNTHETIC NEW ROLE');
        expect(screen.getByRole('combobox').textContent).toContain('SYNTHETIC NEW ROLE');
        submit();
        await expectNavigation();
        expect(mocks.createEmployee).toHaveBeenLastCalledWith({ ...defaultPayload, role: 'SYNTHETIC NEW ROLE' });
    });

    it('keeps employee errors explicit and never saves allowances or navigates on update failure', async () => {
        mocks.updateEmployee.mockResolvedValue({ success: false, error: 'Synthetic update failure', code: 'SYNTHETIC_FAILURE' });
        await renderForm({ initialData: employee({ payType: 'MONTHLY' }) });
        submit();
        await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith('Kesalahan sistem', { description: 'Synthetic update failure' }));
        expect(mocks.replaceEmployeeAllowances).not.toHaveBeenCalled();
        expect(mocks.router.push).not.toHaveBeenCalled();
        expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Perbarui Pekerja' }).disabled).toBe(false);
    });
});
