#!/usr/bin/env python3
"""Read-only local backup of every gpchat post (public Firestore REST runQuery, same read gp_lift_check does).
Writes backups/gpchat_posts_<project>_<stamp>.json with full fields + createTime/updateTime. Free; no gcloud, no bucket.
Pass the printed path to: backfill_gpchat.py --apply --i-have-a-backup <path>
Emulator: FIRESTORE_EMULATOR_HOST + BACKFILL_PROJECT=demo-... like backfill_gpchat.py."""
import datetime as dt, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import backfill_gpchat as b
docs = b.fetch()
out_dir = os.path.join(b.HERE, "backups"); os.makedirs(out_dir, exist_ok=True)
p = os.path.join(out_dir, "gpchat_posts_%s_%s.json" % (b.PROJ, dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")))
json.dump({"project": b.PROJ, "site": "gpchat", "count": len(docs), "docs": docs}, open(p, "w"))
print(p); print("posts:", len(docs), file=sys.stderr)
