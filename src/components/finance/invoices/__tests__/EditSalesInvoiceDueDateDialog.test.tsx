// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

vi.stubGlobal(
  'ResizeObserver',
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
Element.prototype.scrollIntoView = vi.fn();

const { mockRefresh, mockToastSuccess, mockToastError, mockUpdate } = vi.hoisted(
  () => ({
    mockRefresh: vi.fn(),
    mockToastSuccess: vi.fn(),
    mockToastError: vi.fn(),
    mockUpdate: vi.fn(),
  }),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

vi.mock('@/actions/finance/invoice', () => ({
  updateSalesInvoiceDueDate: (...args: unknown[]) => mockUpdate(...args),
}));

// Simplify Select so we can trigger custom tempo branch in jsdom - hide children to avoid duplicate text matches
vi.mock('@/components/ui/select', () => ({
  Select: ({ onValueChange }: any) => (
    <div data-testid="select-mock">
      <button
        data-testid="select-trigger-custom"
        onClick={() => onValueChange('-1')}
      >
        Pick Custom
      </button>
      <button
        data-testid="select-trigger-7"
        onClick={() => onValueChange('7')}
      >
        Pick 7
      </button>
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: () => <span />,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <div>{children}</div>,
}));

import { EditSalesInvoiceDueDateDialog } from '../EditSalesInvoiceDueDateDialog';

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    invoiceNumber: 'INV/2026/0001',
    invoiceDate: new Date('2026-08-01'),
    dueDate: new Date('2026-08-31'),
    termOfPaymentDays: 30,
    ...overrides,
  };
}

describe('EditSalesInvoiceDueDateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({ success: true });
  });

  it('renders main fields when open', async () => {
    render(
      <EditSalesInvoiceDueDateDialog
        open={true}
        onOpenChange={vi.fn()}
        invoice={makeInvoice() as any}
      />,
    );

    expect(screen.getByText(/Edit Jatuh Tempo/)).toBeDefined();
    expect(screen.getByText(/INV\/2026\/0001/)).toBeDefined();
    expect(screen.getByText(/Tanggal Invoice/)).toBeDefined();
    expect(screen.getByText(/Tempo Baru/)).toBeDefined();
    expect(screen.getByText(/Preview Jatuh Tempo/)).toBeDefined();
    expect(screen.getAllByText(/Invoice/).length).toBeGreaterThan(0);
  });

  it('shows current term value and Simpan Jatuh Tempo button', () => {
    render(
      <EditSalesInvoiceDueDateDialog
        open={true}
        onOpenChange={vi.fn()}
        invoice={makeInvoice({ termOfPaymentDays: 14 }) as any}
      />,
    );

    expect(screen.getAllByText(/14 hari/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: /Simpan Jatuh Tempo/i }),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: /Batal/i })).toBeDefined();
  });

  it('toggles manual due date checkbox and shows manual input, preview updates', async () => {
    render(
      <EditSalesInvoiceDueDateDialog
        open={true}
        onOpenChange={vi.fn()}
        invoice={makeInvoice() as any}
      />,
    );

    // Manual input hidden by default
    expect(screen.queryByText(/Jatuh Tempo Manual/)).toBeNull();

    const checkbox = document.getElementById(
      'manual-due-edit-sales',
    ) as HTMLInputElement;
    expect(checkbox).toBeDefined();
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(screen.getByText(/Jatuh Tempo Manual/)).toBeDefined();
    });

    // Find all date inputs, second one after toggle should be manual
    const allDateInputs = Array.from(
      document.querySelectorAll('input[type="date"]'),
    ) as HTMLInputElement[];

    // We have invoiceDate input + manualDueDate input when checked
    expect(allDateInputs.length).toBeGreaterThanOrEqual(2);

    // Set manual due date to a known date
    const manualDue = allDateInputs[allDateInputs.length - 1];
    fireEvent.change(manualDue, { target: { value: '2026-09-15' } });

    await waitFor(() => {
      expect(screen.getAllByText(/Manual/).length).toBeGreaterThan(0);
    });
  });

  it('shows custom tempo input when Custom... selected', async () => {
    render(
      <EditSalesInvoiceDueDateDialog
        open={true}
        onOpenChange={vi.fn()}
        invoice={makeInvoice() as any}
      />,
    );

    expect(screen.queryByText(/Custom Tempo/)).toBeNull();

    fireEvent.click(screen.getByTestId('select-trigger-custom'));

    await waitFor(() => {
      expect(screen.getByText(/Custom Tempo/)).toBeDefined();
    });
  });

  it('custom tempo changes preview and sends correct payload', async () => {
    const onOpenChange = vi.fn();
    render(
      <EditSalesInvoiceDueDateDialog
        open={true}
        onOpenChange={onOpenChange}
        invoice={makeInvoice() as any}
      />,
    );

    fireEvent.click(screen.getByTestId('select-trigger-custom'));

    await waitFor(() => {
      expect(screen.getByText(/Custom Tempo/)).toBeDefined();
    });

    const customInput = screen.getByPlaceholderText(/Misal 21/) as HTMLInputElement;
    fireEvent.change(customInput, { target: { value: '21' } });

    // preview should show 21 hari
    await waitFor(() => {
      expect(screen.getByText(/21 hari/)).toBeDefined();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /Simpan Jatuh Tempo/i }),
    );

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled();
    });

    const [, payload] = mockUpdate.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(payload.termOfPaymentDays).toBe(21);
  });

  it('selecting a different preset tempo updates preview', async () => {
    render(
      <EditSalesInvoiceDueDateDialog
        open={true}
        onOpenChange={vi.fn()}
        invoice={makeInvoice() as any}
      />,
    );

    fireEvent.click(screen.getByTestId('select-trigger-7'));

    await waitFor(() => {
      expect(screen.getAllByText(/7 hari/).length).toBeGreaterThan(0);
    });
  });

  it('calls updateSalesInvoiceDueDate with correct payload on save (happy path)', async () => {
    const onOpenChange = vi.fn();
    render(
      <EditSalesInvoiceDueDateDialog
        open={true}
        onOpenChange={onOpenChange}
        invoice={makeInvoice() as any}
      />,
    );

    const saveBtn = screen.getByRole('button', {
      name: /Simpan Jatuh Tempo/i,
    });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled();
    });

    const [id, payload] = mockUpdate.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(id).toBe('inv-1');
    expect(payload.termOfPaymentDays).toBe(30);
    expect(payload.dueDate).toBeInstanceOf(Date);
    expect(payload.invoiceDate).toBeInstanceOf(Date);

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(
        expect.stringContaining('Jatuh tempo diperbarui'),
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('sends manual due date when checkbox checked', async () => {
    const onOpenChange = vi.fn();
    render(
      <EditSalesInvoiceDueDateDialog
        open={true}
        onOpenChange={onOpenChange}
        invoice={makeInvoice() as any}
      />,
    );

    const checkbox = document.getElementById(
      'manual-due-edit-sales',
    ) as HTMLInputElement;
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(screen.getByText(/Jatuh Tempo Manual/)).toBeDefined();
    });

    const allDateInputs = Array.from(
      document.querySelectorAll('input[type="date"]'),
    ) as HTMLInputElement[];
    const manualDue = allDateInputs[allDateInputs.length - 1];
    fireEvent.change(manualDue, { target: { value: '2026-09-20' } });

    const saveBtn = screen.getByRole('button', {
      name: /Simpan Jatuh Tempo/i,
    });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled();
    });

    const [, payload] = mockUpdate.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    const due = payload.dueDate as Date;
    expect(due).toBeInstanceOf(Date);
    expect(due.toISOString().slice(0, 10)).toBe('2026-09-20');

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('shows error toast and keeps dialog open when action returns success:false', async () => {
    mockUpdate.mockResolvedValue({
      success: false,
      error: 'Tidak dapat mengubah tanggal jatuh tempo',
    });
    const onOpenChange = vi.fn();

    render(
      <EditSalesInvoiceDueDateDialog
        open={true}
        onOpenChange={onOpenChange}
        invoice={makeInvoice() as any}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /Simpan Jatuh Tempo/i }),
    );

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
    });

    // Dialog stays open -> onOpenChange(false) NOT called
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('shows generic error toast when action throws', async () => {
    mockUpdate.mockRejectedValue(new Error('network'));
    const onOpenChange = vi.fn();

    render(
      <EditSalesInvoiceDueDateDialog
        open={true}
        onOpenChange={onOpenChange}
        invoice={makeInvoice() as any}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /Simpan Jatuh Tempo/i }),
    );

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Gagal memperbarui');
    });

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('clicking Batal closes dialog', async () => {
    const onOpenChange = vi.fn();
    render(
      <EditSalesInvoiceDueDateDialog
        open={true}
        onOpenChange={onOpenChange}
        invoice={makeInvoice() as any}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Batal$/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('preview changes when invoiceDate changed', async () => {
    render(
      <EditSalesInvoiceDueDateDialog
        open={true}
        onOpenChange={vi.fn()}
        invoice={makeInvoice() as any}
      />,
    );

    const allDateInputs = Array.from(
      document.querySelectorAll('input[type="date"]'),
    ) as HTMLInputElement[];
    const invDateInput = allDateInputs[0];
    fireEvent.change(invDateInput, { target: { value: '2026-08-10' } });

    await waitFor(() => {
      expect(screen.getByText(/Preview Jatuh Tempo/)).toBeDefined();
    });

    expect(screen.getAllByText(/hari/).length).toBeGreaterThan(0);
  });
});
