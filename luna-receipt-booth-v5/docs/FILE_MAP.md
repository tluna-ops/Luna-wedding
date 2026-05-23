# File Map

## booth/index.html
Guest-facing iPad booth page and hidden admin panel.

## booth/styles.css
White booth styling, centered text, rounded buttons, directions cards, receipt preview styling.

## booth/app.js
Camera capture, 3-pose countdown, receipt generation, admin preview, QR generation, upload, print, 8-second reset.

## receipts/index.html
Public receipt-strip gallery page with Home, Venue, and Registry buttons.

## receipts/styles.css
Responsive receipt gallery styling.

## receipts/gallery.js
Loads newest-first receipt strips from the Worker. Includes session view with Download and Open Full Size buttons.

## receipts/config.js
Stores the deployed Worker URL.

## cloudflare-worker/src/worker.js
Upload and gallery backend.

Routes:

```text
POST /upload
GET /gallery
GET /session?id=<id>
GET /receipt/<id>.png
```

## cloudflare-worker/wrangler.toml
Cloudflare Worker and R2 bucket binding config.
