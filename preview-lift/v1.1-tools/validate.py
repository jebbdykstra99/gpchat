#!/usr/bin/env python3
"""Validate every rendered v1.1 room file (CLO, Oct 10, 2026 evening MT). Read-only.
Checks per file:
  T1 no leftover {{...}} tokens except {{DMCA_AGENT}}; no [PLACEHOLDER]; no "DRAFT" (any case) in the body
  T2 phone: +1-650-539-5005 present; every phone-like / 10-digit number is exactly that,
     or NCMEC's 1-800-843-5678 (report.html only)
  T3 (terms) cap reads USD $100; no $50
  T4 age matches room (terms: "at least N years old"; privacy: "at least N to have an account");
     no other "at least 13/18/21" age
  T5 TSL counsel-not-operator sentence present
  T6 HTML valid: html5lib strict parse (raises on any parse error)
  T7 structure matches live page: identical <head> except <title>; body.legal-page > article.legal-doc;
     noindex meta kept
  T8 (terms) DMCA block present, visible, reads "DMCA designated agent registration pending", no reg. number
  T9 (report) NCMEC CyberTipline link present; mailto present; CTO wiring comment present; no <form action>
"""
import hashlib, html, json, os, re, sys
import html5lib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOMS_DIR = os.path.dirname(HERE)
LIVE = os.path.join(ROOMS_DIR, "_live")
sys.path.insert(0, HERE)
from render import ROOMS, CONFIG, SOLE_PROP_OPERATOR, SOLE_PROP_DMCA  # noqa
SOLE_PROP = False
NO_UPLOADS = set(CONFIG.get("no_uploads_rooms", []))

PHONE = "+1-650-539-5005"
NCMEC = "1-800-843-5678"
# Oct 15 2026: entity-name placeholders allowed until Jebb names OpCo; T10 reports them (NOT stampable).
ENTITY_TOKENS = {"{{OPCO_LLC_NAME}}", "{{OPCO_RA_STREET}}"}
OPCO_RE = re.compile(r"(\{\{OPCO_LLC_NAME\}\}|[A-Z][\w&.,' -]*LLC), a Wyoming limited liability company")
TSL = ("Tech Sector Law is counsel for Operator and is not the operator of the Service.")
PHONE_RE = re.compile(r"(?<![\w-])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)")


def visible_text(s):
    s = re.sub(r"<!--.*?-->", " ", s, flags=re.S)
    s = re.sub(r"<head>.*?</head>", " ", s, flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    return html.unescape(s)


def head_of(s):
    return re.sub(r"<title>.*?</title>", "<title/>", re.search(r"<head>.*?</head>", s, re.S).group(0))


def check(domain, room, age, fname, s, live_head):
    res = {}
    body = visible_text(s)
    toks = [t for t in re.findall(r"\{\{[^}]*\}\}", s) if t != "{{DMCA_AGENT}}" and t not in ENTITY_TOKENS]
    bad = toks + re.findall(r"\[PLACEHOLDER[^\]]*\]", s, re.I) + re.findall(r"\bdraft\b", body, re.I)
    res["T1_tokens_placeholder_draft"] = (not bad, bad[:5])
    nums = [m.group(0).strip() for m in PHONE_RE.finditer(body)]
    digit10 = re.findall(r"(?<!\d)\d{10,}(?!\d)", body)
    allowed = {PHONE} | ({NCMEC} if fname == "report.html" else set())
    badn = [n for n in nums if n not in allowed] + digit10
    res["T2_phone"] = (PHONE in body and not badn, badn[:5] or ("" if PHONE in body else "phone missing"))
    if fname == "terms.html":
        res["T3_cap_100"] = ("USD $100" in body and "$50" not in body, "")
    ages = re.findall(r"at least (\d+)", body)
    if fname == "terms.html":
        ok = (f"at least {age} years old" in body) and set(ages) == {str(age)}
    elif fname == "privacy.html":
        ok = (f"at least {age} to have an account" in body) and set(ages) == {str(age)} \
             and "under 13" in body  # COPPA line kept
    else:
        ok = not ages
    res["T4_age"] = (ok, ages)
    res["T5_tsl_sentence"] = (TSL in body, body.count(TSL))
    try:
        html5lib.HTMLParser(strict=True, namespaceHTMLElements=False).parse(s)
        res["T6_html5lib_strict"] = (True, "")
    except Exception as e:  # noqa
        res["T6_html5lib_strict"] = (False, repr(e)[:200])
    struct = (head_of(s) == live_head and '<body class="legal-page">' in s
              and '<article class="legal-doc">' in s and 'content="noindex, nofollow"' in s
              and 'class="legal-kicker"' in s)
    res["T7_live_structure"] = (struct, "")
    if fname == "terms.html":
        ok = ("DMCA designated agent registration pending." in body and "{{DMCA_AGENT}}" in s
              and not re.search(r"registration (no\.|number)\s*[:#]?\s*\w*\d", body, re.I)
              and "Designated agent: Jebb Dykstra" in body
              and (("Service provider: " + SOLE_PROP_DMCA) in body if SOLE_PROP
                   else "Service provider: Jebb Dykstra" not in body))
        res["T8_dmca_block"] = (ok, "")
    if fname == "report.html":
        ok = ("https://report.cybertip.org/" in s and "https://www.missingkids.org/gethelpnow/cybertipline" in s
              and "mailto:jebb@techsectorlaw.com?subject=NCII" in s and "CTO (before lift)" in s
              and "<form" not in s)
        res["T9_report_page"] = (ok, "")
    # T10 entity: operator line = OpCo WY LLC; no sole-prop / GROK names. Pending tokens reported in detail.
    pend = sorted(set(t for t in re.findall(r"\{\{[^}]*\}\}", body) if t in ENTITY_TOKENS))
    if fname in ("terms.html", "privacy.html") and SOLE_PROP:
        ok = (SOLE_PROP_OPERATOR in body and not pend and not re.search(r"\{\{OPCO_[A-Z_]+\}\}", s)
              and "doing business as" not in body and not re.search(r"grok", body, re.I)
              and "operated by SubX (operated by" not in body)
        res["T10_sole_prop_entity"] = (ok, "sole-prop")
    elif fname in ("terms.html", "privacy.html"):
        ok = bool(OPCO_RE.search(body)) and "operated by Jebb Dykstra" not in body and "doing business as" not in body \
             and not re.search(r"grok", body, re.I)
        res["T10_opco_entity"] = (ok, "pending:" + ",".join(pend) if pend else "named")
    # T11 no-uploads wording (CLO TERMS_S3_NO_UPLOADS_FINAL.md) for rooms flagged no_uploads
    if domain in NO_UPLOADS and fname in ("terms.html", "privacy.html"):
        bad = [x for x in ("images only for uploads", "other permitted uploads", "including images") if x in body]
        need = ("does not currently accept user image, video, or file uploads" if fname == "terms.html"
                else "does not accept user image or file uploads")
        res["T11_no_uploads"] = (not bad and need in body, bad)
    return res


def main():
    global SOLE_PROP
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--sole-prop", action="store_true", help="T10 expects SubX (operated by Jebb Dykstra)")
    ap.add_argument("--rooms", default=None)
    ap.add_argument("--all-rooms", action="store_true")
    a = ap.parse_args()
    SOLE_PROP = a.sole_prop
    sel = None if a.all_rooms else (a.rooms.split(",") if a.rooms else CONFIG.get("rooms"))
    out, allpass, n = [], True, 0
    for room, domain, age, _ in ROOMS:
        if sel and domain not in sel:
            continue
        live = open(os.path.join(LIVE, domain + "_terms.html"), encoding="utf-8").read()
        lh = head_of(live)
        for fname in ("terms.html", "privacy.html", "report.html"):
            path = os.path.join(ROOMS_DIR, domain, fname)
            s = open(path, encoding="utf-8").read()
            r = check(domain, room, age, fname, s, lh)
            n += 1
            ok = all(v[0] for v in r.values())
            allpass &= ok
            sha = hashlib.sha256(s.encode("utf-8")).hexdigest()
            out.append({"domain": domain, "file": fname, "min_age": age, "pass": ok, "sha256": sha,
                        "checks": {k: {"pass": v[0], "detail": v[1]} for k, v in r.items()}})
            fails = [k + ":" + str(v[1]) for k, v in r.items() if not v[0]]
            print(("PASS " if ok else "FAIL ") + domain + "/" + fname + ("" if ok else "  " + "; ".join(fails)))
    print("\nSUMMARY: %d files, %d rooms, %s" % (n, len(sel or ROOMS), "ALL PASS" if allpass else "FAILURES"))
    json.dump(out, open(os.path.join(ROOMS_DIR, "VALIDATION_RESULTS.json"), "w"), indent=1)
    sys.exit(0 if allpass else 1)


if __name__ == "__main__":
    main()
