#!/usr/bin/env bash
# One edit fills the Terms DMCA block AND the DMCA filing sheet: sets lift_config.json provider_street,
# re-renders gpchat, validates (sole-prop), copies the 4 pages into the local branch. LOCAL ONLY; no push.
set -euo pipefail
ST="${1:?usage: fill_address.sh \"<street, suite, city, ST ZIP, USA>\"}"
D=/workspace/subx/overnight-2026-10-17; T=$D/v1.1/rooms/_tools
python3 - "$ST" "$T/lift_config.json" <<'P'
import json,sys; p=sys.argv[2]; c=json.load(open(p)); c["provider_street"]=sys.argv[1]; json.dump(c,open(p,"w"),indent=2)
P
(cd $T && python3 render.py && python3 validate.py --sole-prop && (cd .. && python3 _tools/validate_guidelines.py gpchat.com/guidelines.html))
for f in terms privacy report guidelines; do cp $D/v1.1/rooms/gpchat.com/$f.html $D/gpchat/$f.html; done
cp $T/lift_config.json $D/gpchat/preview-lift/v1.1-tools/lift_config.json
echo "Filled. DMCA sheet: $D/v1.1/DMCA_FILING_FIELDS_RENDERED.md. Review, then commit on the local branch."
