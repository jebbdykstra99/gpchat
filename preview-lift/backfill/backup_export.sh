#!/usr/bin/env bash
# Backup BEFORE any backfill write (NOT RUN tonight). Needs Jebb's gcloud login on subx-skins and a bucket.
# Managed export of the posts collection only; restore with: gcloud firestore import <path> --collection-ids=posts
set -euo pipefail
PROJECT=subx-skins
BUCKET="${BACKUP_BUCKET:?set BACKUP_BUCKET=gs://<bucket>}"
STAMP=$(TZ=America/Denver date +%Y-%m-%d_%H%M)
DEST="$BUCKET/firestore-backups/gpchat-posts-pre-g2-$STAMP"
echo "Exporting posts from $PROJECT to $DEST"
gcloud firestore export "$DEST" --project="$PROJECT" --collection-ids=posts
echo "Backup at $DEST  ->  python3 backfill_gpchat.py --apply --i-have-a-backup $DEST"
