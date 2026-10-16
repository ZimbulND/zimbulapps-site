# Running on Replit

This is the imported Zimbul Apps static website, including the browser-based
Job Profit Workbook and its sandbox. Keep the existing HTML/CSS/JavaScript
structure; there is no build step and no package installation is required.

- Use **Run** to start the **Start application** workflow.
- Run command: `node scripts/serve.cjs`
- The development server listens on `0.0.0.0:5000`.
- Main website: `/`
- Product page: `/job-profit-workbook/`
- Browser workbook: `/job-profit-workbook/app/`
- Sandbox workbook: `/job-profit-workbook/app-sandbox/`

The server serves only public website files, disables caching for development,
and preserves the download and sandbox headers defined in `_headers`.

## External services and limits

- The contact form in `index.html` uses Netlify Forms. This static Replit preview
  does not process or deliver submissions; POST requests explicitly return 405.
  The existing email link remains available. Connecting a replacement contact
  service is separate work.
- Workbook licensing and checkout use the existing externally hosted licensing
  services. Their URLs and licensing behavior are unchanged. A running preview
  does not verify trial activation, checkout, or the external service's CORS
  policy for a new Replit origin.
- Workbook browser data is tied to the browser and origin. Existing data on
  another website origin is not automatically available in this preview.
- No new secrets are required to serve the static files.

## Development-only commercial readiness changes

See `docs/commercial-readiness.md` for the development review checklist,
browser inspection findings and owner-account checks still needed before release.
The standing commercial and release scope is recorded in
`.agents/memory/commercial-scope.md`.

The enhanced contact form still uses a native Netlify POST, now with a local
confirmation-page action. Replit preview hosts disable sending; the development
server rejects contact POSTs with a helpful 405 page, including without JavaScript.

### Local checks (no packages or build step required)

```sh
node --test tests/readiness.test.mjs
python3 scripts/check-site.py
node --check scripts/serve.cjs
node --check contact.js
git diff --check
# With the application running and Chromium available:
node --experimental-websocket scripts/check-browser.cjs
```

Browser checks use a disposable profile under `/tmp`, block external and
mutating page requests, and do not submit contact messages or start checkout.
