// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import WorkspaceDiscovery from '../workspace-discovery';

describe('WorkspaceDiscovery', () => {
    it('renders the existing workspace chooser and superadmin entry point', () => {
        render(<WorkspaceDiscovery />);

        expect(
            screen.getByRole('heading', { name: /masuk ke workspace/i }),
        ).toBeTruthy();
        expect(screen.getByRole('textbox')).toBeTruthy();
        const continueButton = screen.getByRole('button', {
            name: /lanjut ke workspace/i,
        }) as HTMLButtonElement;
        expect(continueButton.disabled).toBe(true);
        expect(
            screen
                .getByRole('link', { name: 'Super Admin Login' })
                .getAttribute('href'),
        ).toBe('http://admin.localhost/login');
    });
});
