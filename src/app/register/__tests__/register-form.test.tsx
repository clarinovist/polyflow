// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RegisterForm from '../register-form';

describe('RegisterForm mobile input safety', () => {
    it('keeps inputs at least 44px tall with 16px mobile text and preserves slug generation', () => {
        render(<RegisterForm />);

        const company = screen.getByLabelText('Company Name');
        const email = screen.getByLabelText('Admin Email');
        const workspace = screen.getByLabelText('Workspace URL');
        for (const input of [company, email, workspace]) {
            expect(input.className).toContain('h-11');
            expect(input.className).toContain('text-base');
        }

        fireEvent.change(company, { target: { value: 'Acme Plastik 2026' } });
        expect((workspace as HTMLInputElement).value).toBe('acme-plastik-2026');
        expect(screen.getByRole('button', { name: /Create Workspace/i }).className).toContain(
            'h-12',
        );
    });
});
