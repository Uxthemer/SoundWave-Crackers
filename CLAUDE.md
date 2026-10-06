# SoundWave Crackers — project reference

A map of this codebase, so a task does not start with reading the whole tree.
Nothing personal or secret is recorded here: no keys, no customer data, no
account details. Secrets live in `.env` (git-ignored) and in Supabase.

Keep this file honest — if something below stops being true, fix the line
rather than working around it.

---

## What it is

A storefront and back office for a fireworks retailer, in one React app.
Customers browse a seasonal catalogue and order (signed in or as a guest);
staff run orders, stock, purchasing, expenses and reporting from the same
build, behind roles.

## Stack

| Piece | Choice |
| --- | --- |
| Build | Vite + React 18 + TypeScript |
| Routing | react-router-dom v6 (all routes in `src/App.tsx`) |
| Styling | Tailwind, with CSS variables for the theme (`bg-background`, `text-primary`, `bg-card`, `border-card-border`, `primary-orange`, `primary-red`, `primary-yellow`) |
| State | zustand (`src/store/`), React context (`src/context/`) |
| Backend | Supabase — Postgres, auth, storage, RPC, edge functions |
| PDFs | jsPDF + jspdf-autotable (`src/lib/documentPdf.ts`, `priceListPdf.ts`) |
| Misc | framer-motion, swiper, chart.js, xlsx, react-hot-toast, firebase (push) |

Scripts: `npm run dev`, `npm run build`, `npm run lint`.

`npx tsc -p tsconfig.app.json --noEmit` reports a long tail of **pre-existing**
errors (unused imports, `Interactive3DHero.tsx` referencing three.js packages
that are not installed). It is not a clean gate — filter it to the files you
touched. `npx vite build` is the real check and does pass.

## Layout

```
src/
  App.tsx            nav, mobile menu, every route
  pages/             one file per route (storefront + admin)
  components/        shared UI; components/purchasing/ for the buying screens
  context/           AuthContext, AppSettingsContext, SeasonContext, ThemeContext
  store/             cartStore, wishlistStore (zustand)
  hooks/             useProducts, useOrders, useDashboard, useSeason, …
  lib/               supabase client + all non-React logic (see below)
  data/products.ts   static content: hero slides, category copy
supabase/
  migrations/        ~50 timestamped .sql files, applied in name order
  functions/         edge functions: notify-admins-new-order, notify-order-status
public/assets/       images; banners in img/banners/
```

### `src/lib` worth knowing

| File | Does |
| --- | --- |
| `supabase.ts` | the client, plus loose query helpers such as `fetchOrders` |
| `guestOrders.ts` | guest checkout and order tracking, all through RPC |
| `documentPdf.ts` | `buildDocumentPdf` / `documentFileName` — invoice, quotation and order-summary PDFs, one layout |
| `latestPriceList.ts` | builds the customer price list from the live catalogue on demand |
| `priceListPdf.ts` | the price-list drawing, plus `loadImage`. Columns are a model (`PriceListColumn`): S.No/Product/category bands always print, the other six can be renamed or dropped, and `layOutColumns` shares the page width out so the table always ends where the banner does. A caller that passes no columns gets `DEFAULT_ON_COLUMNS` — everything but Tamil |
| `familyPackPamphlet.ts` | `fetchFamilyPackPamphlet(seasonId)` — the season's active packs and their contents, read fresh from `combo_packs`/`combo_pack_items`/`season_catalog`. No prices beyond the pack rate, no cost |
| `familyPackPamphletPdf.ts` | the family-pack pamphlet: business header, then one small table per pack (S.No/Item/Content/Qty) footed with total products and total quantity. Its own file, not a mode of `priceListPdf` — a price list is one long table, a pamphlet is a stack of short ones |
| `sheetImagePrep.ts` | a photo of a handwritten order sheet → levelled, locally thresholded, with the notebook's rules, the printed dividers and the page edge erased. Pure canvas. **A phone photo is not a scan**: it has perspective, so rows and columns tilt by different amounts and neither is square to the pixels. Both directions are measured by projection sharpness and everything works along them. Assuming axis alignment finds nothing at all |
| `sheetSegment.ts` | that mask → one picture per cell. **Columns first, then rows** — a border or shadow puts ink on every scanline, so banding the whole width gives one row for the page; banding inside the product column cannot see the border. Columns are assigned by role (most-inked slab is the product column), and the serial is split off by finding the gap when there is no printed divider |
| `handwritingOcr.ts` / `.worker.ts` | PaddleOCR PP-OCRv5 recognition (Apache 2.0) through onnxruntime-web, in a worker because ORT's WASM backend blocks its thread for the whole scan. CTC, so one forward pass per cell and a numeric column is a mask over the logits |
| `handwritingOcrModels.ts` | the model URLs and the per-column charsets, with the measurements behind choosing PP-OCR over TrOCR |
| `priceListSerials.ts` | the catalogue numbered exactly as `priceListPdf.ts` numbers it. **Must stay in step with that file's `serial++` walk** or scanned S.Nos resolve to the wrong products |
| `orderSheetMatch.ts` | a read row → catalogue candidates, scored on name (trigram + word containment, with a hard penalty for disagreeing figures so 15/30/50 Cm and 1000/10000 Wala cannot swap), price agreement weighted by how many products share that price, and the S.No. Ranking and confidence are separate: one signal can win the ranking, but two must agree before a line is ticked |
| `scanOrderSheet.ts` | sequences the four above and reports progress |
| `tamilText.ts` | draws a Tamil string on a canvas and hands back a transparent PNG sized in PDF points. jsPDF cannot shape Tamil (see the file's own comment); the browser can, so the Tamil column is a picture of the name |
| `customerLookup.ts` | staff-only customer lookup (by phone, or by name/place/pincode, every word must match some field) for placing an order on a customer's behalf: `customer_summary` (past orders, one row per phone) plus `user_profiles` (accounts with no orders yet), under the caller's RLS. Used by `CustomerPhoneLookup` in the cart and in New Order |
| `businessDetails.ts` | `businessFromSettings(appSettings)` → the business block printed on documents |
| `orderItems.ts` | makes a combo-pack order line look like a product line (`attachPackDetails`, `PACK_EMBED`) |
| `pricing.ts`, `ordering.ts`, `productImage.ts`, `personName.ts` | small shared rules |

## Domain notes that are not obvious from the code

- **Seasons.** The catalogue is per season. A product's price is not on
  `products` — it is on `product_seasons` (`offer_price`, `is_active`), and
  cost sits on `product_season_costs`. Anything customer-facing must read the
  active season. Cost columns are revoked from `anon`/`authenticated`
  (`20260809020000_revoke_public_cost_price.sql`) — never select them from the
  browser.
- **Packs.** A combo pack is not a product. An order line carries either
  `product_id` or `combo_pack_id`, never both. Screens that read
  `item.product.name` rely on `attachPackDetails` having been called first.
- **Guest checkout.** A guest never inserts rows. `create_guest_order` is a
  SECURITY DEFINER function: the browser sends ids and quantities, the
  database decides prices, totals, season and order number. Do not add a price
  to anything the browser sends.
- **Order numbers.** `SWCO<year><4 random>-<sequence>`, e.g.
  `SWCO2026K7P2-0001`, issued by `next_order_short_id()`. Legacy `SWC-###` and
  `SWC-O-…` numbers still exist and must keep resolving.
- **Order tracking.** `track_guest_order(reference, phone)` needs both halves —
  sequential order numbers alone would let anyone page through every order.
  The reference may be the full number, the row uuid, or just the last 4
  digits; the phone is matched on its last 10 digits so `+91 97897 94518` and
  `9789794518` both work. `track_guest_order_items(order_id, phone)` returns
  the lines for the summary PDF and re-checks the phone itself.
- **Scanned order sheets.** Customers hand over a handwritten list, usually
  with our price list's S.No copied into the left column. That serial is the
  strongest signal there is — exact, where handwriting is a guess — so it is
  resolved first and the name and price only confirm it. The written price is
  never used as a price, only as evidence for which product was meant.
  Measured on the real sample (`supabase/.temp/palani_chennai_order.jpeg`,
  29 lines): all 29 rows found, 76% of rows pick the right product first,
  97% have it in the top three, and **no wrong row is ever confident** —
  every miss is flagged. That last property is the one to preserve: a wrong
  line on a priced quotation is worse than no quotation. Nothing is ticked
  automatically below `REVIEW_THRESHOLD`, and every line shows the strip of
  the original page it came from so checking it is a glance.
- **Roles.** `user_profiles.role_id` → `roles.name`. `admin` and `superadmin`
  see everything; other roles are filtered to their own rows in app code as
  well as by RLS.
- **Settings.** `app_settings` holds the site title, logo, business and GST
  details. Reach it with `useAppSettings()`, not a fresh query.
- **Tamil names.** `products.tamil_name` is optional and is identity, not
  commerce — the same in every season — and it reaches the app through
  `season_catalog`. Only the custom price list reads it, as a column that is
  off unless a superadmin switches it on; the storefront and the season's own
  price list are untouched. It cannot be typeset: jsPDF has no Tamil shaping,
  so `tamilText.ts` lays the name out on a canvas and the PDF gets an image.
  `public/assets/fonts/NotoSerifTamil-Regular.ttf` is served from the site
  rather than from Google's CDN so a counter PC with no internet prints the
  same page; it is fetched only when that column is on.

## Conventions

- Migrations are `supabase/migrations/<YYYYMMDDHHMMSS>_<snake_case>.sql`,
  applied in filename order. New ones only — never edit an applied file.
  Open with a `/* … */` block saying what changed and why.
- Anything a guest or customer can call is a SECURITY DEFINER function with
  `SET search_path = public`, `REVOKE ALL … FROM public`, then an explicit
  `GRANT EXECUTE … TO anon, authenticated`. Return only the columns that
  caller already has; never `user_id`, never cost.
- Comments in this codebase explain *why*, in prose, and are expected on
  anything non-obvious. Match that — do not strip them, do not add narration
  of what the line plainly does.
- Errors that reach a customer are toasts (`react-hot-toast`) in plain
  language.

## Responsive rules learned the hard way

- The nav collapses at `xl`. The hamburger must be `flex xl:hidden` — it was
  once `hidden sm:flex xl:hidden`, which hid the whole menu on every phone
  under 640px. Track Order and Price List live in that menu.
- Hero banners (`public/assets/img/banners/`) range from 16:9 to nearly 3:1.
  Below `sm` the slide is an `aspect-[2/1]` band and the banner fills it with
  `object-cover`. The box matches the standard banner's own shape, so that one
  is not cropped; the fixed 300px box it replaced (~1.3:1) cut half the width
  off the wide ones. `banner_3.png` is ~6.6 MB — worth compressing.

## Installing it as an app (PWA)

- The manifest is `public/manifest.webmanifest`, served at `/manifest.webmanifest`.
  It must stay at the site root: `start_url` and `scope` resolve against the
  manifest's own URL, and the old one under `/assets/img/favicon/` scoped the
  installed app to that folder.
- iOS reads the `apple-mobile-web-app-*` meta tags in `index.html`, not the
  manifest, on anything before 17.4.
- There is no offline service worker. `public/firebase-messaging-sw.js` is for
  push only, and it is registered solely when someone enables notifications —
  so most visitors have no service worker at all.

## Where common work goes

| Task | Start at |
| --- | --- |
| Nav, routes, mobile menu | `src/App.tsx` |
| Cart and checkout | `src/components/Cart.tsx`, `src/lib/guestOrders.ts` |
| Order tracking | `src/pages/TrackOrder.tsx` |
| Admin orders | `src/pages/Orders.tsx`, `src/components/EditOrderModal.tsx` |
| Any PDF | `src/lib/documentPdf.ts` |
| Custom price list (superadmin) | `src/components/CustomPriceListModal.tsx` |
| Scanning a handwritten order (admin) | `src/components/ScanOrderSheetModal.tsx`, reached from the Quotations tab in `src/pages/Dashboard.tsx` |
| Family pack pamphlet (superadmin) | `src/lib/familyPackPamphletPdf.ts`, reached from the Export menu in `src/pages/StockManagement.tsx` |
| Catalogue and pricing | `src/hooks/useProducts.ts`, `src/pages/StockManagement.tsx` |
| Database change | a new file in `supabase/migrations/` |
