// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobilePageTelemetry } from '../MobilePageTelemetry';
const track=vi.hoisted(()=>vi.fn());
vi.mock('next/navigation',()=>({usePathname:()=>'/finance/mobile/tasks'}));
vi.mock('@/lib/analytics/mobile-task-events',()=>({trackMobilePageView:track}));
describe('MobilePageTelemetry',()=>{it('calls the privacy-safe page-view helper from a rendered portal',async()=>{render(<MobilePageTelemetry portalId="finance"/>);await waitFor(()=>expect(track).toHaveBeenCalledWith('/finance/mobile/tasks','finance'));});});
