# Chiara Store POS

A Progressive Web App (PWA) Point of Sale system for Chiara Store.

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in your Supabase credentials:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

2. Install dependencies:
```bash
npm install
```

3. Run development server:
```bash
npm run dev
```

4. Open http://localhost:3000

## Default Login
- Username: `chiara`
- Password: `chiara123`

> ⚠️ Change the password after first login in Settings!

## Features
- POS / Checkout with barcode scanning
- Product management
- Inventory tracking with restock
- Utang / credit management
- Cash session management
- Sales & reports (daily/weekly/monthly)
- Expense tracking
- Full data backup & export
- Offline support with IndexedDB sync queue
- PWA installable on Android & iOS

## Tech Stack
- Next.js 15
- Supabase (PostgreSQL)
- Serwist (PWA)
- Tailwind CSS
- Zustand
- html5-qrcode
- idb (IndexedDB)
