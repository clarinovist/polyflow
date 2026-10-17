#!/usr/bin/env python3
"""Install only the owned cron block. Preserve unrelated lines and save a backup."""
import datetime
import os
from pathlib import Path
import subprocess

BEGIN = '# BEGIN polyflow-product-learning'
END = '# END polyflow-product-learning'
# Hourly heartbeat/retry, but source snapshots are completed Jakarta days only.
BLOCK = f'''{BEGIN}
23 * * * * docker exec polyflow-app node scripts/run-product-learning.mjs >> "$HOME/logs/polyflow-product-learning.log" 2>&1
{END}'''


def merge_crontab(current):
    lines = current.splitlines()
    if lines.count(BEGIN) != lines.count(END) or lines.count(BEGIN) > 1:
        raise ValueError('Malformed owned cron block')
    if BEGIN in lines:
        start, end = lines.index(BEGIN), lines.index(END)
        if end < start:
            raise ValueError('Malformed owned cron block')
        lines[start:end + 1] = BLOCK.splitlines()
    else:
        lines += BLOCK.splitlines()
    return '\n'.join(lines).rstrip() + '\n'


def main():
    result = subprocess.run(['crontab', '-l'], capture_output=True, text=True)
    if result.returncode and not (result.returncode == 1 and 'no crontab for' in result.stderr.lower()):
        raise RuntimeError('Unable to read current crontab')
    current = result.stdout
    updated = merge_crontab(current)
    if updated == current:
        print('Product learning schedule already installed')
        return
    backup_dir = Path.home() / '.local/state/polyflow/cron-backups'
    backup_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    backup = backup_dir / f"learning-{datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}.cron"
    with os.fdopen(os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as stream:
        stream.write(current)
    (Path.home() / 'logs').mkdir(exist_ok=True)
    subprocess.run(['crontab', '-'], input=updated, text=True, check=True)
    installed = subprocess.run(['crontab', '-l'], capture_output=True, text=True, check=True).stdout
    if installed != updated:
        raise RuntimeError('Crontab verification failed; recover from saved backup')
    print('Product learning schedule installed; previous crontab backed up')


if __name__ == '__main__':
    main()
