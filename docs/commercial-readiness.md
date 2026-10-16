# Commercial Readiness Package 1 — development review

## Release boundary

These are reviewable workspace changes only. Production Netlify hosting,
Stripe, Cloudflare licensing, external URLs/configuration, the Windows
installer, the $199 one-time offer, and the 7-day trial are unchanged.
There has been no deployment, publishing, production-branch push, provider
configuration change, real payment, trial registration, or real contact submission.
Production release requires separate explicit approval.

## Browser inspection and decision

The imported browser implementation is not a limited demonstration:

- Signed current trial and paid entitlements enable workbook writes.
- Unactivated, invalid, wrong-device and expired entitlements deny writes.
- Jobs, setup, licensing state and a copy of trial registration information
  are stored in IndexedDB. The browser identifier uses local storage.
- Storage is browser-profile/origin-specific; there is no Windows/browser sync.
- Browser backup/restore is not exposed by this interface. Desktop backup
  actions call native API endpoints absent from the static website server.
- Licensing requests contain registration/licensing information, not job records.
- Existing browser checkout uses the hosted licensing service and Stripe.
  It was not invoked.

Therefore no demo link or unrestricted license was added. The browser pages
are labeled unreleased and not a verified limited free demo; the marketing,
privacy and terms distinguish them from the supported Windows offer. A future
limited free demonstration requires separately agreed scope, implemented
restrictions and tests. This package does not invent those restrictions.

The browser UI previously displayed an unrestricted fallback when entitlement
evaluation threw. It now fails closed, showing an unavailable screen instead.
The imported API write gates and external licensing configuration are retained.
The native/Windows code path and installer were not changed.

## Customer-facing changes

- Payment return pages use current navigation targets, noindex metadata, main
  landmarks, accessible focus states and responsive layouts.
- A return URL is not proof of payment, cancellation, no charge, or activation.
  Customers are directed to the installed workbook on the same computer, the
  existing purchase-status control when available, receipts, and support before
  retrying payment.
- The contact form keeps its name, fields, hidden form-name, POST method and
  data-netlify attribute. Native Netlify submission is not replaced by a mock
  sender or a JavaScript fetch.
- A local confirmation action explains that inbox delivery is not verified.
  Preview sending is disabled, offline sending is prevented, and failure/retry
  instructions stay visible. Without JavaScript, the preview server returns a
  helpful 405 rather than pretending to accept a message.
- Product/legal skip-link contrast and header touch-target height are improved.

## Checks performed

- 21 dependency-free unit checks pass: signed trial, expired, paid, invalid and
  wrong-device states; denial of all exposed browser write operations without
  usable entitlement; failure denial; seven-day duration; preview and offline
  contact guards; preservation of native Netlify submission in simulated host
  contexts. Test signatures use ephemeral in-memory keys, not a production bypass.
- Static checks pass across 10 HTML pages: local assets, fragment navigation,
  landmarks, image alternatives, Netlify form contract and unchanged offer.
- Real Chromium checks pass for 21 page layouts at 320px, 402px and 1280px:
  no horizontal overflow, intact images, single main/H1 and minimum navigation
  target heights. Keyboard skip focus, contact prevention, the initial browser
  activation gate and an injected entitlement-failure screen also pass.
- The browser suite blocks all nonlocal and mutating page requests. It reports
  no attempted external or mutating requests.
- JavaScript syntax and whitespace checks pass. There is no build pipeline
  for this imported static website; no migration or framework was introduced.
- The running preview was visually checked, including the payment-status page
  at phone width. Workflow startup is clean.

These checks do not constitute screen-reader certification, complete WCAG
conformance, Windows installer verification or an end-to-end payment test.

## Still requires owner-approved account testing before release

1. Confirm Netlify recognizes the existing contact form and custom confirmation
   action, notification routing, spam handling and actual inbox delivery. This
   needs an approved submission; none was sent during this package.
2. Verify the packaged Windows installer, trial activation and actual installed
   purchase-status behavior. The repository's browser/shared client is not proof
   of the behavior of the already-built executable.
3. Use approved Stripe/Cloudflare sandbox facilities to verify price/currency,
   test-mode separation, checkout redirects, webhook fulfillment, delayed status
   and paid-license activation. No live session or charge was initiated.
4. Retain Netlify production hosting and existing licensing origin policy.
   The prior audit found that the Replit browser origin was not CORS-allowed.
   No allowlist or hosting change was made, and Replit browser activation is
   not represented as production-ready.
5. Review the proposed marketing/legal wording and support instructions before
   approving a separate production release. No production approval is implied
   by completion of development checks.
