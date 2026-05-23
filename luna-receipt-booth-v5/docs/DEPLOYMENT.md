# Step-by-Step Deployment

## Part 1 — Add the booth and gallery pages to luna.wedding

In your `luna.wedding` GitHub repo, create two folders:

```text
booth/
receipts/
```

Copy these files into `booth/`:

```text
booth/index.html
booth/styles.css
booth/app.js
booth/manifest.webmanifest
```

Copy these files into `receipts/`:

```text
receipts/index.html
receipts/styles.css
receipts/gallery.js
receipts/config.js
```

Commit and push.

You should end up with:

```text
https://luna.wedding/booth/
https://luna.wedding/receipts/
```

## Part 2 — Create the Cloudflare R2 bucket

From the downloaded package, open Terminal and go into the Worker folder:

```bash
cd cloudflare-worker
npm install
npx wrangler login
npx wrangler r2 bucket create luna-receipts
```

## Part 3 — Deploy the Cloudflare Worker

From the same `cloudflare-worker` folder:

```bash
npx wrangler deploy
```

Wrangler will output a deployed Worker URL like:

```text
https://luna-receipt-upload.YOURNAME.workers.dev
```

Copy that URL.

## Part 4 — Connect the gallery page to the Worker

Open:

```text
receipts/config.js
```

Change:

```js
window.LUNA_RECEIPT_API = "";
```

to your Worker URL:

```js
window.LUNA_RECEIPT_API = "https://luna-receipt-upload.YOURNAME.workers.dev";
```

Commit and push to `luna.wedding`.

## Part 5 — Connect the booth page to the Worker

Open:

```text
https://luna.wedding/booth/?admin=1
```

Set:

```text
Gallery page URL:
https://luna.wedding/receipts/

Upload endpoint / Worker URL:
https://luna-receipt-upload.YOURNAME.workers.dev
```

The default settings are already:

```text
Photo count: 3
Countdown seconds per pose: 3
Auto-reset after receipt: 8 seconds
Auto-upload after capture: ON
Auto-print after upload: ON
QR heading: SEE YOUR PHOTOS
Receipt phrase: SMILE * SNAP * KEEP
```

Click **Save Settings**.

## Part 6 — Test the full flow

Go to:

```text
https://luna.wedding/booth/
```

Run a test:

1. Tap to take 3 photos.
2. Wait for the preview.
3. If needed, tap Upload & Print.
4. Wait for the page to auto-reset after 8 seconds.
5. Open:

```text
https://luna.wedding/receipts/
```

The newest receipt strip should appear first.

Click a receipt strip to open its session view. The session view includes:

```text
Download
Open Full Size
```

## Part 7 — Add to iPad Home Screen

On the iPad:

1. Open Safari.
2. Go to:

```text
https://luna.wedding/booth/
```

3. Allow camera permissions.
4. Tap the Share icon.
5. Tap **Add to Home Screen**.
6. Name it **Receipt Booth**.
7. Launch from the Home Screen icon.

## Part 8 — Raw photo retrieval

Raw photos are stored in R2 under:

```text
receipts/private/sessions/<session-id>/photo-1.jpg
receipts/private/sessions/<session-id>/photo-2.jpg
receipts/private/sessions/<session-id>/photo-3.jpg
receipts/private/sessions/<session-id>/session.json
```

Public receipt strips are stored under:

```text
receipts/public/sessions/<session-id>/receipt.png
```

The public gallery does not expose the raw photo keys.
