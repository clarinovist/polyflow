import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isMiniAppEnabled, isKillSwitchActive, getPilotSubdomain } from '../kill-switch';

describe('kill-switch', () => {
  let prevEnabled: string | undefined;
  let prevKill: string | undefined;
  let prevPilot: string | undefined;

  beforeEach(() => {
    prevEnabled = process.env.TELEGRAM_MINI_APP_ENABLED;
    prevKill = process.env.TELEGRAM_KILL_SWITCH;
    prevPilot = process.env.TELEGRAM_PILOT_TENANT_SUBDOMAIN;
  });

  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.TELEGRAM_MINI_APP_ENABLED;
    else process.env.TELEGRAM_MINI_APP_ENABLED = prevEnabled;
    if (prevKill === undefined) delete process.env.TELEGRAM_KILL_SWITCH;
    else process.env.TELEGRAM_KILL_SWITCH = prevKill;
    if (prevPilot === undefined) delete process.env.TELEGRAM_PILOT_TENANT_SUBDOMAIN;
    else process.env.TELEGRAM_PILOT_TENANT_SUBDOMAIN = prevPilot;
  });

  it('enabled by default when no env', () => {
    delete process.env.TELEGRAM_MINI_APP_ENABLED;
    delete process.env.TELEGRAM_KILL_SWITCH;
    expect(isMiniAppEnabled()).toBe(true);
    expect(isKillSwitchActive()).toBe(false);
  });

  it('disabled when MINI_APP_ENABLED=false', () => {
    process.env.TELEGRAM_MINI_APP_ENABLED = 'false';
    expect(isMiniAppEnabled()).toBe(false);
  });

  it('disabled when kill switch true', () => {
    process.env.TELEGRAM_KILL_SWITCH = 'true';
    expect(isKillSwitchActive()).toBe(true);
    expect(isMiniAppEnabled()).toBe(false);
  });

  it('kill switch recognizes 1 and on', () => {
    process.env.TELEGRAM_KILL_SWITCH = '1';
    expect(isKillSwitchActive()).toBe(true);
    process.env.TELEGRAM_KILL_SWITCH = 'on';
    expect(isKillSwitchActive()).toBe(true);
  });

  it('pilot subdomain defaults to melindo', () => {
    delete process.env.TELEGRAM_PILOT_TENANT_SUBDOMAIN;
    expect(getPilotSubdomain()).toBe('melindo');
  });
});
