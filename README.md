# gpchat

Nothing but Grand Prix. Fanatical fan chat for Formula 1 — race weekend chatter, quali drama, safety cars, team radio, DNFs, pit-lane mixups. **Not official F1.**

This is a **static** dress rehearsal of the SubX chrome (three-column X-like shell: left nav, center feed, right rail, hash routes, sign-in modal that closes, mobile hamburger). It is **not** the FastAPI / Next `subx` stack. No React, no Next, no FastAPI, no Firebase, no model calls.

Wordmark: **gpchat**. Tagline: *Nothing but Grand Prix.*

## GitHub Pages + custom domain

These files are meant to drop into an empty public repo and be served from GitHub Pages at **gpchat.com**.

1. Push this folder’s contents to branch `main` (site root, not `/docs`).
2. Repo **Settings → Pages**: Deploy from branch `main` / `/` (root).
3. Custom domain: `gpchat.com`. The `CNAME` file in this repo already contains exactly that.

**DNS at GoDaddy still needs to point at GitHub Pages.** Do not change DNS from this repo. Typical GitHub Pages records:

- Apex `A` records to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- or a `CNAME` for `www` to `<your-user>.github.io`

Until DNS is pointed, Pages will serve on the github.io URL only if the repo is project-pages configured; for the custom domain, use a user/org Pages root as above.

## What this is / is not

- Feed-first **dummy** posts about Grand Prix racing (quali, SC/VSC, team radio, DNFs, championship points fights, pit-lane mixups, formation lap, undercut/overcut, dummy 2026 grid talk). Fake handles only. Not official F1. **No live results.**
- Ranking chrome (For You / Following / Hot / New) shows different slices of the seed feed.
- Sign-in modal closes (X, Escape, overlay click); auth is stubbed locally. No Firebase project keys.
- No AskAI. No live timing API. No cross-post to X or Reddit. We are not X.com.
- **Real F1 APIs are phase 2, not tonight.** Dummy feed is enough for this dress rehearsal.
