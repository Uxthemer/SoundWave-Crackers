# Soundwave Crackers

Soundwave Crackers is a React + TypeScript + Vite e-commerce application for selling crackers and festive products online. The project includes a customer storefront, cart and checkout flow, order tracking, admin dashboards, product management, and integration with Supabase and Firebase for authentication and notifications.

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Supabase
- Firebase
- React Router
- Chart.js and Framer Motion

## Project Features

- Product browsing and category filtering
- Shopping cart and quick purchase flow
- Order tracking and user profiles
- Admin dashboard and settings pages
- Firebase push notification support
- Supabase-backed authentication and data access
- SEO-friendly sitemap generation

## Prerequisites

Make sure you have the following installed:

- Node.js 18+
- npm

## Local Setup

1. Open a terminal in the project root:

```powershell
cd d:\Workspace-2025\soundwavecrackers\project
```

2. Install dependencies:

```powershell
npm install
```

3. Create a `.env` file in the project root with the required environment variables:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_firebase_measurement_id
VITE_FIREBASE_VAPID_KEY=your_firebase_vapid_key

VITE_GOOGLE_ANALYTICS_ID=your_ga_id
VITE_PUBLIC_SITE_URL=http://localhost:5173
```

4. Start the development server:

```powershell
npm run dev
```

5. Open the site in your browser:

```text
http://localhost:5173
```

## Production Build

To create a production build:

```powershell
npm run build
```

To preview the production build locally:

```powershell
npm run preview
```

## Useful Scripts

```powershell
npm run dev     # start local development server
npm run build   # create production bundle
npm run preview # preview production build locally
npm run lint    # run ESLint checks
```

## Notes

- The project expects a valid Supabase and Firebase configuration to fully function.
- Push notifications and analytics are optional in local development, but the environment variables should still be provided.
- This repository also includes Supabase Edge Functions under the `supabase/functions` folder for backend workflows such as notifications.

## Folder Overview

- `src/` - application source code
- `public/` - static assets and public files
- `supabase/` - Supabase database migrations and Edge Functions
- `docs/` - project documentation

## License

This project is currently maintained as an internal product application. Please check with the repository owner for licensing details.
