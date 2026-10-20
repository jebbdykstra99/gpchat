# IndexNow on gpchat.com

- Key: `7f8d29189008d288ab04b85925adbc78`, served at https://gpchat.com/7f8d29189008d288ab04b85925adbc78.txt (root file, body is exactly the key). Public by design.
- Deploy: GitHub Pages, deploy from branch `main` / root (legacy Jekyll build). No deploy workflow in this repo.
- `.github/workflows/indexnow.yml` runs on push to `main`: diffs the pushed range, maps changed `.html` to extensionless URLs (`index.html` → `/`, `foo.html` → `/foo`), skips `sitemap.xml`, `404.html`, `_`/dot paths, `preview-lift/`, and pages with a robots `noindex` meta. Waits for the Pages build for that commit to report `built` and one changed URL to return 200, then POSTs to `https://api.indexnow.org/indexnow`. Best-effort: `continue-on-error`.
- Manual re-run: Actions → IndexNow ping → Run workflow (diffs `HEAD^..HEAD`).
- Rotating the key: add a new `<newkey>.txt`, change `INDEXNOW_KEY` in the workflow, delete the old file.
- Bing Webmaster Tools site verification is separate (Jebb's step); IndexNow works without it.
