#!/usr/bin/env python3
import hashlib, json, os, subprocess, sys, time
from pathlib import Path
CHECK=os.environ.get("BACKUP_HEALTH_CHECK","/home/sekolahdesain/polyflow/scripts/check-backup-health.sh")
STATE=Path(os.environ.get("BACKUP_ALERT_STATE","/tmp/polyflow-backup-alert-state.json"))
MONITORING=os.environ.get("POLYFLOW_MONITORING_DIR","/home/sekolahdesain/monitoring")
COOLDOWN=int(os.environ.get("BACKUP_ALERT_COOLDOWN_SECONDS","21600"))
result=subprocess.run([CHECK],capture_output=True,text=True,timeout=60,check=False)
summary=(result.stdout or result.stderr or "BACKUP_HEALTH_ALERT check_failed").strip().splitlines()[-1][:500]
if result.returncode==0:
    print(summary); raise SystemExit(0)
now=int(time.time()); key=hashlib.sha256(summary.encode()).hexdigest()
try: state=json.loads(STATE.read_text())
except Exception: state={}
if now-int(state.get(key,0))<COOLDOWN:
    print("BACKUP_HEALTH_ALERT cooldown_active"); raise SystemExit(result.returncode)
sys.path.insert(0,MONITORING)
try:
    from group_alert import send_group_alert
    response=send_group_alert("PolyFlow",[summary],title="PolyFlow Backup/Capacity Alert")
    if not response.get("ok"): raise RuntimeError("alert delivery failed")
except Exception as error:
    print(f"BACKUP_HEALTH_ALERT delivery_failed type={type(error).__name__}",file=sys.stderr); raise SystemExit(3)
state[key]=now; STATE.write_text(json.dumps(state)); print("BACKUP_HEALTH_ALERT delivered")
raise SystemExit(result.returncode)
