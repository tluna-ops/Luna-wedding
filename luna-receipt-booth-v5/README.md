# Luna Receipt Booth v5

This package executes this flow:

```text
Booth captures 3 raw photos
↓
Booth generates finished receipt strip
↓
Worker uploads all files
↓
Public gallery displays only receipt strips
↓
Raw photos are stored quietly for you
```

## Default copy

- QR heading: `SEE YOUR PHOTOS`
- Three-word receipt phrase: `SMILE * SNAP * KEEP`
- Public gallery: newest first
- Auto-upload: on
- Auto-print: on
- Auto-reset: 8 seconds

## What guests see

Guests do not see save/share/iMessage features. They see only the booth, directions, a receipt preview, Upload & Print, and Take Another.

## What the public gallery exposes

The public gallery receives only:

```text
id
createdAt
receiptUrl
```

The raw photo storage keys are not exposed by the public gallery API.
