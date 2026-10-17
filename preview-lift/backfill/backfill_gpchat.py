#!/usr/bin/env python3
"""gpchat G2 + steward backfill (CTO, Oct 17, 2026 local). DRY RUN BY DEFAULT.

Reads gpchat posts via the public Firestore REST runQuery (read-only; posts are world-readable)
and writes a plan: for each backdated post (|createTime - createdAt| > 5s) set createdAt = createTime
(the real write time) and zero the likes (likes={}, likeCount=0); for each admin-UID post without
steward:true (minus HUMAN_POST_IDS) set steward=true.

  python3 backfill_gpchat.py                 # dry run -> backfill_plan.json + backfill_plan.csv
  python3 backfill_gpchat.py --apply ...     # NOT RUN. Needs Jebb's deploy approval, a fresh
                                             # backup (backup_export.sh) and service-account creds.
"""
import argparse, csv, datetime as dt, json, os, sys, urllib.request

PROJ = "subx-skins"; KEY = os.environ.get("FB_API_KEY", "")
ADMIN = os.environ.get("ADMIN_UID", "o774wL9hUVSi19EkDCgLqQomP8i2")
HUMAN = set(x for x in os.environ.get("HUMAN_POST_IDS", "").split(",") if x)
HERE = os.path.dirname(os.path.abspath(__file__))
FS = "https://firestore.googleapis.com/v1/projects/%s/databases/(default)/documents" % PROJ


def ts(s): return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))


def fetch():
    q = {"structuredQuery": {"from": [{"collectionId": "posts"}], "where": {"fieldFilter": {
        "field": {"fieldPath": "siteId"}, "op": "EQUAL", "value": {"stringValue": "gpchat"}}}, "limit": 2000}}
    req = urllib.request.Request(FS + ":runQuery" + ("?key=" + KEY if KEY else ""), json.dumps(q).encode(),
                                 {"Content-Type": "application/json"})
    return [x["document"] for x in json.load(urllib.request.urlopen(req)) if "document" in x]


def plan(docs):
    rows = []
    for d in docs:
        f = d["fields"]; pid = d["name"].rsplit("/", 1)[1]; ch = {}
        ca = f.get("createdAt", {}).get("timestampValue")
        if ca and abs((ts(d["createTime"]) - ts(ca)).total_seconds()) > 5:
            ch["createdAt"] = {"from": ca, "to": d["createTime"]}
            lc = int(f.get("likeCount", {}).get("integerValue", 0) or 0)
            nl = len(f.get("likes", {}).get("mapValue", {}).get("fields", {}) or {})
            if lc or nl:
                ch["likes"] = {"from_likeCount": lc, "from_likes_keys": nl, "to": "{} / 0"}
        if f.get("authorUid", {}).get("stringValue") == ADMIN and not f.get("steward", {}).get("booleanValue") \
                and pid not in HUMAN:
            ch["steward"] = {"from": None, "to": True}
        if ch:
            rows.append({"id": pid, "changes": ch})
    return rows


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--apply", action="store_true")
    ap.add_argument("--i-have-a-backup", default=""); a = ap.parse_args()
    docs = fetch(); rows = plan(docs)
    out = {"generated": dt.datetime.now(dt.timezone.utc).isoformat(), "project": PROJ, "site": "gpchat",
           "posts_read": len(docs), "posts_to_change": len(rows),
           "createdAt_resets": sum("createdAt" in r["changes"] for r in rows),
           "likes_zeroed": sum("likes" in r["changes"] for r in rows),
           "steward_set": sum("steward" in r["changes"] for r in rows), "rows": rows}
    json.dump(out, open(os.path.join(HERE, "backfill_plan.json"), "w"), indent=1)
    with open(os.path.join(HERE, "backfill_plan.csv"), "w", newline="") as fh:
        w = csv.writer(fh); w.writerow(["post_id", "createdAt_from", "createdAt_to", "likeCount_from", "steward_to"])
        for r in rows:
            c = r["changes"]
            w.writerow([r["id"], c.get("createdAt", {}).get("from", ""), c.get("createdAt", {}).get("to", ""),
                        c.get("likes", {}).get("from_likeCount", ""), "true" if "steward" in c else ""])
    print({k: v for k, v in out.items() if k != "rows"})
    if not a.apply:
        print("DRY RUN: no writes. Plan in backfill_plan.json / .csv"); return
    if not a.i_have_a_backup.startswith("gs://"):
        sys.exit("refusing: pass --i-have-a-backup gs://<export path> from backup_export.sh")
    import firebase_admin  # noqa  (service-account creds via GOOGLE_APPLICATION_CREDENTIALS)
    from firebase_admin import firestore
    firebase_admin.initialize_app(); db = firestore.client(); batch = db.batch(); n = 0
    for r in rows:
        c = r["changes"]; patch = {}
        if "createdAt" in c: patch["createdAt"] = ts(c["createdAt"]["to"])
        if "likes" in c: patch.update({"likes": {}, "likeCount": 0})
        if "steward" in c: patch["steward"] = True
        batch.update(db.collection("posts").document(r["id"]), patch); n += 1
        if n % 400 == 0: batch.commit(); batch = db.batch()
    batch.commit(); print("applied", n)


if __name__ == "__main__":
    main()
