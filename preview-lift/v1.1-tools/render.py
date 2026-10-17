#!/usr/bin/env python3
"""Render SubX v1.1 Terms / Privacy / Report pages per room (CLO, Oct 10, 2026 evening MT).

Inputs (read-only):
  ../../TERMS_v1.1_DRAFT.md, ../../PRIVACY_v1.1_DRAFT.md, ../../NCII_CSAM_PROCEDURE.md (Part 2)
  ../_live/<domain>_terms.html  (live page fetched tonight; source of the head block and the
                                 room's affiliation one-liner, so output drops into the live repo)
Output: ../<domain>/{terms,privacy,report}.html

Usage: python3 render.py [--effective-date "October 11, 2026"] [--opco-name "<Exact Name LLC>"] [--ra-street "<RA street>"]
Re-running with a different effective date or operator (D1) changes the sha256s; re-run
validate.py and regenerate STAMP_MANIFEST.md afterwards (make_manifest.py).
"""
import argparse, html, json, os, re, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOMS_DIR = os.path.dirname(HERE)
V11 = os.path.dirname(ROOMS_DIR)
LIVE = os.path.join(ROOMS_DIR, "_live")

ROOMS = [  # (room name, domain, MIN_AGE, ROOM_AGE_NOTE)  -- 16 rooms, domains.json + SKIN_OVERRIDES.md
    ("27chat", "27chat.com", 18, ""),
    ("415chat", "415chat.com", 18, ""),
    ("808chat", "808chat.com", 18, ""),
    ("bartchat", "bartchat.com", 18, ""),
    ("buffettchat", "buffettchat.com", 18, ""),
    ("popechat", "popechat.com", 18, ""),
    ("gaichat", "gaichat.com", 18, ""),
    ("gpchat", "gpchat.com", 18, ""),
    ("recruitchat", "recruitchat.com", 18, ""),
    ("samochat", "samochat.com", 18, ""),
    ("boozechat", "boozechat.com", 21,
     "This room discusses alcohol; you also represent that you are of legal drinking age where you live."),
    ("buffetchat", "buffetchat.com", 18, ""),
    ("ciachat", "ciachat.com", 18, ""),
    ("cobrachat", "cobrachat.com", 18, ""),
    ("boyfriendchat", "boyfriendchat.com", 18, "This room is intended for adults."),
    ("311chat", "311chat.com", 18, ""),
]

ALT_NAMES = "SubX, " + ", ".join(d for _, d, _, _ in [
    ("415chat", "415chat.com", 0, ""), ("samochat", "samochat.com", 0, ""), ("gpchat", "gpchat.com", 0, ""),
    ("popechat", "popechat.com", 0, ""), ("recruitchat", "recruitchat.com", 0, ""), ("27chat", "27chat.com", 0, ""),
    ("808chat", "808chat.com", 0, ""), ("bartchat", "bartchat.com", 0, ""), ("buffettchat", "buffettchat.com", 0, ""),
    ("gaichat", "gaichat.com", 0, ""), ("boozechat", "boozechat.com", 0, ""), ("buffetchat", "buffetchat.com", 0, ""),
    ("boyfriendchat", "boyfriendchat.com", 0, ""), ("ciachat", "ciachat.com", 0, ""), ("cobrachat", "cobrachat.com", 0, ""),
    ("311chat", "311chat.com", 0, "")]) + ", subx.at, airlineschat, amachat, atmchat, behindtheblackwall"
# Oct 15 2026: entity plan. OpCo (WY series LLC parent, not a series) is operator + DMCA provider.
OPCO_NAME = "{{OPCO_LLC_NAME}}"      # literal until Jebb names it; --opco-name fills it
RA_STREET = "{{OPCO_RA_STREET}}"     # registered agent physical street address; --ra-street fills it
def operator_line(name=None): return (name or OPCO_NAME) + ", a Wyoming limited liability company"
DEFAULT_OPERATOR = operator_line()

CONFIG_PATH = os.path.join(HERE, "lift_config.json")
def load_config():
    return json.load(open(CONFIG_PATH, encoding="utf-8")) if os.path.exists(CONFIG_PATH) else {}
CONFIG = load_config()
SOLE_PROP_OPERATOR = CONFIG.get("sole_prop_operator", "SubX (operated by Jebb Dykstra)")
SOLE_PROP_DMCA = CONFIG.get("sole_prop_dmca_provider", "Jebb Dykstra (SubX)")
SOLE_PROP_SENTENCE = "The Service is SubX, operated by Jebb Dykstra, an individual"
NO_UPLOADS_EDITS = {  # CLO TERMS_S3_NO_UPLOADS_FINAL.md (Oct 16, 2026)
    "terms": [("(text, images, and other permitted uploads)", "(text and links)"),
              ("Unless the product UI expressly allows otherwise: images only for uploads (reasonable size limits apply); do not upload others' copyrighted material without permission.",
               "The Service does not currently accept user image, video, or file uploads, and stories are disabled. Post only text and links. Do not link to child sexual abuse material, to intimate images shared without consent, or to material that infringes someone else's rights. If we enable uploads later, we will update these Terms first.")],
    "privacy": [("the content you post, including images and reports", "the content you post (text and links) and reports"),
                ("posts, replies, images, polls, direct messages (where enabled), reports, and similar UGC.",
                 "posts, replies, polls, direct messages (where enabled), reports, and similar UGC. The Service does not accept user image or file uploads.")],
}


def apply_edits(md, kind, ctx):
    if ctx.get("NO_UPLOADS"):
        for a, b in NO_UPLOADS_EDITS[kind]:
            assert a in md, "NO_UPLOADS anchor missing: " + a[:40]
            md = md.replace(a, b)
    if ctx.get("SOLE_PROP"):
        md = md.replace("The Service is operated by {{OPERATOR}}", SOLE_PROP_SENTENCE)
        md = md.replace("explains how {{OPERATOR}}", "explains how SubX, operated by Jebb Dykstra, an individual,")
    return md


EMAIL = "jebb@techsectorlaw.com"
PHONE = "+1-650-539-5005"
MAIL = "3019 Ocean Park Boulevard, #193, Santa Monica, CA 90405, USA"
COUNSEL = ("Tech Sector Law is counsel for Operator and is not the operator of the Service. The mail, "
           "email, and phone listed for notices are Operator\u2019s designated legal contact channels.")


def smart(s):
    """Typographic quotes, as on the live pages."""
    s = re.sub(r'(^|[\s(\[\u2014-])"', "\\1\u201c", s)
    s = s.replace('"', "\u201d")
    s = s.replace("'", "\u2019")
    return s


def inline(text, ctx):
    """Escape, then apply bold, links, emails, smart quotes."""
    t = html.escape(text, quote=False)
    t = smart(t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)", r"<em>\1</em>", t)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    room_url = ctx["ROOM_URL"]
    t = t.replace(room_url + "report.html", '<a href="report.html">' + room_url + "report.html</a>")
    t = t.replace("report.cybertip.org", '<a href="https://report.cybertip.org/">report.cybertip.org</a>')
    t = t.replace(EMAIL, '<a href="mailto:' + EMAIL + '">' + EMAIL + "</a>")
    t = re.sub(r"\bour Privacy Policy\b", 'our <a href="privacy.html">Privacy Policy</a>', t)
    t = re.sub(r"\bour Terms of Service\b", 'our <a href="terms.html">Terms of Service</a>', t)
    return t


def md_to_html(md, ctx, skip_h1=True):
    """Small converter for the constructs used in the v1.1 drafts: ## headings, paragraphs
    (consecutive lines joined with <br>, as in the live contact blocks), -, 1. lists."""
    out, para, lst, ltype = [], [], [], None

    def flush_para():
        nonlocal para
        if para:
            out.append("    <p>" + "<br>\n    ".join(inline(x, ctx) for x in para) + "</p>")
            para = []

    def flush_list():
        nonlocal lst, ltype
        if lst:
            out.append("    <%s>" % ltype)
            out.extend("      <li>" + inline(x, ctx) + "</li>" for x in lst)
            out.append("    </%s>" % ltype)
            lst, ltype = [], None

    for raw in md.splitlines():
        line = raw.rstrip()
        if not line.strip():
            flush_para(); flush_list(); continue
        if line.startswith("@@RAW@@"):
            flush_para(); flush_list(); out.append(line[len("@@RAW@@"):]); continue
        m = re.match(r"^(#{1,3}) (.*)$", line)
        if m:
            flush_para(); flush_list()
            lvl = len(m.group(1))
            if lvl == 1 and skip_h1:
                continue
            out.append("\n    <h%d>%s</h%d>" % (lvl, inline(m.group(2), ctx), lvl))
            continue
        m = re.match(r"^- (.*)$", line)
        if m:
            flush_para()
            if ltype not in (None, "ul"): flush_list()
            ltype = "ul"; lst.append(m.group(1)); continue
        m = re.match(r"^\d+\. (.*)$", line)
        if m:
            flush_para()
            if ltype not in (None, "ol"): flush_list()
            ltype = "ol"; lst.append(m.group(1)); continue
        flush_list(); para.append(line)
    flush_para(); flush_list()
    return "\n".join(out)


def strip_notes(md):
    return re.sub(r"<!--.*?-->\s*", "", md, flags=re.S)


def live_head(domain):
    s = open(os.path.join(LIVE, domain + "_terms.html"), encoding="utf-8").read()
    head = re.search(r"<!DOCTYPE html>.*?</head>", s, re.S).group(0)
    aff = re.search(r"<p><em>(.*?)</em></p>", s, re.S).group(1)
    assert 'content="noindex, nofollow"' in head, domain + ": live head lost noindex"
    return head, aff


def page(head, title, kicker, h1, body, footer):
    head = re.sub(r"<title>.*?</title>", "<title>" + html.escape(title, quote=False) + "</title>", head)
    return (head + "\n<body class=\"legal-page\">\n  <article class=\"legal-doc\">\n"
            + "    <p class=\"legal-kicker\">" + kicker + "</p>\n"
            + "    <h1>" + h1 + "</h1>\n" + body + "\n\n" + footer + "\n  </article>\n</body>\n</html>\n")


def dmca_block(ctx):
    return "\n".join([
        "@@RAW@@    <!-- {{DMCA_AGENT}} block. Stamp value BEFORE registration. When the U.S. Copyright Office",
        "@@RAW@@         confirms the designation, CTO swaps this whole <div> for the post-registration value in",
        "@@RAW@@         TERMS_v1.1_DRAFT.md (same facts plus the directory line). The page and the directory must",
        "@@RAW@@         match exactly (37 C.F.R. 201.38(a)(2)); if Jebb files a different provider street address",
        "@@RAW@@         (Decision A2/A3), change it here on the same day. No registration number is shown. -->",
        "@@RAW@@    <div class=\"dmca-agent dmca-agent-pending\" data-token=\"DMCA_AGENT\" style=\"border-left: 3px solid currentColor; padding-left: 0.9rem; margin: 0 0 1rem;\">",
        "@@RAW@@    <p><strong>DMCA designated agent registration pending.</strong> Until the U.S. Copyright Office lists our designation, send notices to the agent below; they will be handled the same way.</p>",
        "@@RAW@@    <p>Service provider: " + ctx.get("DMCA_PROVIDER", ctx.get("OPERATOR", DEFAULT_OPERATOR)) + "<br>",
        "@@RAW@@    Street address: " + ctx.get("RA_STREET", RA_STREET) + "<br>",
        "@@RAW@@    Also known as: " + ALT_NAMES + "</p>",
        "@@RAW@@    <p>Designated agent: Jebb Dykstra, Tech Sector Law (counsel to Operator)<br>",
        "@@RAW@@    Mail: " + MAIL + "<br>",
        "@@RAW@@    Email: <a href=\"mailto:" + EMAIL + "\">" + EMAIL + "</a><br>",
        "@@RAW@@    Phone: " + PHONE + "</p>",
        "@@RAW@@    </div>",
    ])


def join_contact(md):
    """Live v1 prints operator, counsel sentence and address lines as one <p> with <br>."""
    md = re.sub(r"\{\{OPERATOR\}\}\n\n(Tech Sector Law is counsel[^\n]*)\n\n(Mail:|3019 )",
                r"{{OPERATOR}}\n\1\n\2", md)
    return md


def fill(md, ctx):
    md = join_contact(md)
    for k, v in ctx.items():
        md = md.replace("{{" + k + "}}", v)
    return md


def render_terms(md, ctx, head, eff):
    body = apply_edits(strip_notes(md), "terms", ctx)
    body = body.replace("{{DMCA_AGENT}}", "@@DMCA@@")
    body = fill(body, ctx)
    body = re.sub(r"  +", " ", body)
    body = body.replace("@@DMCA@@", dmca_block(ctx))
    # version line becomes the legal-kicker (live pattern); drop it from the body
    body = re.sub(r"^\*\*Version 1\.1 .*?\*\*\s*$", "", body, flags=re.M)
    body = body.replace("govern your access to and use of " + ctx["ROOM"] + " at " + ctx["ROOM_URL"],
                        "govern your access to and use of **" + ctx["ROOM"] + "** at **" + ctx["ROOM_URL"] + "**")
    # affiliation one-liner is italic on the live pages
    body = body.replace("\n" + ctx["ROOM_AFFILIATION"] + "\n", "\n*" + ctx["ROOM_AFFILIATION"] + "*\n")
    # drop the markdown footer line; replaced by the live-style link footer
    body = re.sub(r"^Back to .*$", "", body, flags=re.M)
    html_body = md_to_html(body, ctx)
    footer = ('    <p><a href="./">Back to %s</a> · <a href="privacy.html">Privacy Policy</a> · '
              '<a href="report.html">Report / takedown request</a></p>' % ctx["ROOM"])
    return page(head, "Terms of Service — " + ctx["ROOM"], kicker(eff), "Terms of Service", html_body, footer)


def render_privacy(md, ctx, head, eff):
    body = fill(apply_edits(strip_notes(md), "privacy", ctx), ctx)
    body = re.sub(r"  +", " ", body)
    body = re.sub(r"^\*\*Version 1\.1 .*?\*\*\s*$", "", body, flags=re.M)
    body = body.replace("when you use " + ctx["ROOM"] + " at " + ctx["ROOM_URL"],
                        "when you use **" + ctx["ROOM"] + "** at **" + ctx["ROOM_URL"] + "**")
    body = body.replace("\n" + ctx["ROOM_AFFILIATION"] + "\n", "\n*" + ctx["ROOM_AFFILIATION"] + "*\n")
    body = body.replace("site identifier (siteId)", "site identifier (`siteId`)")
    body = body.replace("on project subx-skins", "on project **subx-skins**")
    body = re.sub(r"^Back to .*$", "", body, flags=re.M)
    html_body = md_to_html(body, ctx)
    footer = ('    <p><a href="./">Back to %s</a> · <a href="terms.html">Terms of Service</a> · '
              '<a href="report.html">Report / takedown request</a></p>' % ctx["ROOM"])
    return page(head, "Privacy Policy — " + ctx["ROOM"], kicker(eff), "Privacy Policy", html_body, footer)


def mailto(subject):
    return "mailto:" + EMAIL + "?subject=" + urllib.parse.quote(subject)


def render_report(ncii, ctx, head, eff):
    part2 = ncii.split("# Part 2:", 1)[1]
    part2 = part2.split("\n", 1)[1]                       # drop the Part 2 heading line
    part2 = re.sub(r"^\*Stamp note:.*$", "", part2, flags=re.M)   # internal note, not public
    part2 = part2.replace("{{REPORT_FORM}} or ", "")       # no form ships yet (stamp note in procedure)
    part2 = fill(part2, ctx)
    room = ctx["ROOM"]
    # title line (## Report content ...) becomes the h1
    m = re.search(r"^## (Report content or request a takedown on .*)$", part2, re.M)
    h1 = inline(m.group(1), ctx)
    part2 = part2.replace(m.group(0), "")
    part2 = part2.replace("### ", "## ")
    # mailto buttons with prefilled subjects
    subj = {
        "NCII removal request — " + room: None, "Illegal content report — " + room: None,
        "Privacy request — " + room: None, "Delete my account — " + room: None,
    }
    html_body = md_to_html(part2, ctx, skip_h1=True)
    for s in subj:
        # rendered text is “<subject>.” or “<subject>” ; link the subject, keep the period outside
        html_body = re.sub("\u201c" + re.escape(s) + r"(\.?)\u201d",
                           lambda m, s=s: '<a href="' + html.escape(mailto(s)) + '">\u201c' + s + '\u201d</a>' + m.group(1),
                           html_body)
    # NCMEC: public CyberTipline link + verified phone
    html_body = html_body.replace(
        "report directly to NCMEC at",
        "report directly to NCMEC\u2019s CyberTipline (<a href=\"https://www.missingkids.org/gethelpnow/cybertipline\">missingkids.org/gethelpnow/cybertipline</a>) at")
    cto = ("    <!-- CTO (before lift): this page is a static shell with mailto links only. There is NO backend.\n"
           "         Wire up (1) a report endpoint or form (Firestore `reports` doc or Cloud Function) for the NCII\n"
           "         and illegal-content paths, keeping the 4 required NCII elements as fields; (2) alerting to Jebb\n"
           "         on every new report and every email to the subjects below (preview-lift/report-alert/);\n"
           "         (3) the 48-hour NCII clock log (NCII_CSAM_PROCEDURE.md section 5). If a form ships, add\n"
           "         \"the form on this page or\" before the email address in the NCII section. Never accept\n"
           "         image uploads on this page. NCMEC links verified Oct 10, 2026 on missingkids.org. -->\n")
    footer = ('    <p><a href="./">Back to %s</a> · <a href="terms.html">Terms of Service</a> · '
              '<a href="privacy.html">Privacy Policy</a></p>' % room)
    k = "Report / takedown request · Effective " + eff
    return page(head, "Report / takedown request — " + room, k, h1, cto + html_body, footer)


def render_dmca_sheet(street, sole_prop):
    """Same config value fills field #2 of the DMCA filing sheet (written next to the source sheet)."""
    src = os.path.join(V11, "DMCA_FILING_FIELDS_FINAL_2026-10-16.md")
    if not os.path.exists(src):
        return
    s = open(src, encoding="utf-8").read()
    s = s.replace("**[CHOSEN COMMERCIAL ADDRESS]**", "**" + street + "**")
    hdr = ("<!-- RENDERED by render.py from lift_config.json provider_street; edit the config, not this file. "
           "Filing name: " + (SOLE_PROP_DMCA if sole_prop else "OpCo") + " -->\n")
    open(os.path.join(V11, "DMCA_FILING_FIELDS_RENDERED.md"), "w", encoding="utf-8").write(hdr + s)


def kicker(eff):
    return ("Version 1.1 · Effective " + eff + " · Replaces version 1 (effective September 25, 2026) · "
            "Governing law: State of California, United States of America")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--effective-date", default="October 11, 2026")
    ap.add_argument("--opco-name", default=None, help="exact OpCo legal name, e.g. \"Example Holdings LLC\"")
    ap.add_argument("--ra-street", default=None, help="default: lift_config.json provider_street")
    ap.add_argument("--operator", default=None, help="override full operator line")
    ap.add_argument("--sole-prop", action="store_true", help="fallback operator SubX (operated by Jebb Dykstra)")
    ap.add_argument("--rooms", default=None, help="comma list of domains (default: lift_config rooms, else all)")
    ap.add_argument("--all-rooms", action="store_true")
    a = ap.parse_args()
    if not a.opco_name and not a.operator and CONFIG.get("operator_mode") == "sole_prop":
        a.sole_prop = True
    if a.sole_prop:
        a.operator = SOLE_PROP_OPERATOR
    a.operator = a.operator or operator_line(a.opco_name)
    a.ra_street = a.ra_street or CONFIG.get("provider_street") or RA_STREET
    sel = None if a.all_rooms else (a.rooms.split(",") if a.rooms else CONFIG.get("rooms"))
    render_dmca_sheet(a.ra_street, a.sole_prop)
    terms = open(os.path.join(V11, "TERMS_v1.1_DRAFT.md"), encoding="utf-8").read()
    priv = open(os.path.join(V11, "PRIVACY_v1.1_DRAFT.md"), encoding="utf-8").read()
    ncii = open(os.path.join(V11, "NCII_CSAM_PROCEDURE.md"), encoding="utf-8").read()
    for room, domain, age, note in ROOMS:
        if sel and domain not in sel:
            continue
        head, aff = live_head(domain)
        aff_txt = html.unescape(aff)
        ctx = {"ROOM": room, "ROOM_URL": "https://" + domain + "/", "ROOM_AFFILIATION": aff_txt,
               "MIN_AGE": str(age), "ROOM_AGE_NOTE": note, "OPERATOR": a.operator, "RA_STREET": a.ra_street,
               "EFFECTIVE_DATE": a.effective_date}
        if a.sole_prop:
            ctx.update({"SOLE_PROP": "1", "DMCA_PROVIDER": SOLE_PROP_DMCA})
        if domain in CONFIG.get("no_uploads_rooms", []):
            ctx["NO_UPLOADS"] = "1"
        d = os.path.join(ROOMS_DIR, domain); os.makedirs(d, exist_ok=True)
        for name, fn in (("terms.html", render_terms(terms, ctx, head, a.effective_date)),
                         ("privacy.html", render_privacy(priv, ctx, head, a.effective_date)),
                         ("report.html", render_report(ncii, ctx, head, a.effective_date))):
            open(os.path.join(d, name), "w", encoding="utf-8").write(fn)
        print("rendered", domain)


if __name__ == "__main__":
    main()
