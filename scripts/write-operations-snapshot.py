#!/usr/bin/env python3
"""Write a minimal, sanitized operations snapshot consumed by Super Admin."""
import json
import os
import re
import subprocess
import time
from collections import Counter
from pathlib import Path

OUTPUT = Path(os.environ.get("OPERATIONS_SNAPSHOT_OUTPUT", "/opt/polyflow-operations/health.json"))
DB_DIR = Path(os.environ.get("DB_BACKUP_DIR", "/opt/backups/polyflow"))
ASSISTANT_DIR = Path(os.environ.get("ASSISTANT_BACKUP_DIR", "/opt/backups/polyflow-assistant"))
MAX_AGE = 93_600


def newest_age(root: Path, pattern: str):
    files = list(root.rglob(pattern)) if root.exists() else []
    return max(0, int(time.time() - max(item.stat().st_mtime for item in files))) if files else None


def recent_database_count():
    stamps = Counter()
    now = time.time()
    for item in DB_DIR.glob("*.sql.gz") if DB_DIR.exists() else []:
        match = re.search(r"_(\d{8}_\d{6})\.sql\.gz$", item.name)
        if match and now - item.stat().st_mtime <= MAX_AGE:
            stamps[match.group(1)] += 1
    return max(stamps.values(), default=0)


def command_output(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=15, check=False)
    return result.stdout.strip() if result.returncode == 0 else ""


def assistant_sources():
    value = command_output(["docker", "exec", "polyflow-assistant-worker", "sh", "-c",
        "find /data/tenants -mindepth 2 -maxdepth 2 -type f -name assistant.sqlite -print 2>/dev/null | awk 'END {print NR+0}'"])
    return int(value or 0)


def container_health(name):
    value = command_output(["docker", "inspect", "--format", "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}", name])
    return value if value in {"healthy", "unhealthy", "running", "exited"} else "unknown"


def disk_percent():
    result = subprocess.run(["df", "-P", "/"], capture_output=True, text=True, timeout=10, check=True)
    return int(result.stdout.splitlines()[-1].split()[4].rstrip("%"))


def release_sha():
    value = command_output(["git", "-C", "/home/sekolahdesain/polyflow", "rev-parse", "HEAD"])
    return value[:12] if len(value) == 40 else None


age = newest_age(DB_DIR, "*.sql.gz")
db_count = recent_database_count()
sources = assistant_sources()
assistant_age = newest_age(ASSISTANT_DIR, "assistant.sqlite")
failure = DB_DIR / ".last-failure"
success = DB_DIR / ".last-success"
last_job = "failed" if failure.exists() and (not success.exists() or failure.stat().st_mtime > success.stat().st_mtime) else ("success" if success.exists() else "unknown")
disk = disk_percent()
disk_level = "critical" if disk >= 90 else "warning" if disk >= 80 else "normal"
services = {"web": container_health("polyflow-app"), "worker": container_health("polyflow-assistant-worker"), "database": container_health("polyflow-db")}
backup_status = "critical" if last_job != "success" or age is None or age > MAX_AGE or db_count < 3 or (sources > 0 and (assistant_age is None or assistant_age > MAX_AGE)) else "healthy"
service_status = "healthy" if all(value == "healthy" for value in services.values()) else "critical"
status = "critical" if backup_status == "critical" or disk_level == "critical" or service_status == "critical" else "warning" if disk_level == "warning" else "healthy"
payload = {"generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "status": status,
    "releaseSha": release_sha(), "services": services,
    "backup": {"status": backup_status, "databaseCount": db_count, "latestAgeSeconds": age,
        "assistantSources": sources, "lastJob": last_job},
    "disk": {"usedPercent": disk, "level": disk_level},
    "recovery": {"rpoHours": 24, "rtoHours": 2,
        "lastRestoreDrill": {"status": "passed", "durationSeconds": 111, "databaseCount": 3}}}
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
temporary = OUTPUT.with_suffix(".tmp")
temporary.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
os.chmod(temporary, 0o644)
temporary.replace(OUTPUT)
print(f"OPERATIONS_SNAPSHOT_OK status={status} databases={db_count} disk_percent={disk}")
