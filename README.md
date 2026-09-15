# Se(e)quoia

A citizen-science map of **giant sequoias** (*Sequoiadendron giganteum*) in
Cambridge and across the UK. Anyone can explore the verified trees; anyone with a
Google account can submit a new one; an admin checks each submission before it
appears on the public map.

Live: <https://johannaschoenecker.github.io/sequoia-map/> (once GitHub Pages is
switched on, see below).

No build step. No npm. Plain ES modules, Leaflet, Firebase (loaded from Google's
CDN on demand), and a service worker so the shell opens with no signal.

---

## Quick start

```bash
python -m http.server 8124 --directory .
```

Open <http://localhost:8124>. That is the whole development setup.

It works immediately **without Firebase**: the map reads the original Google
Sheet (`LEGACY.sheetCsvUrl` in `js/config.js`) and the "Add a tree" button
explains that submissions are not open yet. Follow `FIREBASE-SETUP.md` to turn on
submissions, sign-in and the review dashboard.

---

## What is here

| Path | What it does |
| --- | --- |
| `index.html` | App shell: Map, Trees, Review (admins) and Info tabs, plus the add-a-tree sheet |
| `js/config.js` | **Everything you are likely to change**: Firebase config, vocabularies, map defaults |
| `js/app.js` | Controller: tabs, sign-in, the add-a-tree flow, offline outbox |
| `js/map.js` | Leaflet map, clustered markers, locate / nearest, tap-to-place picker |
| `js/cloud.js` | Firebase: auth, live verified feed, submissions, admin actions, sheet import |
| `js/review.js` | Admin dashboard: pending queue, edit / approve / reject, restore, CSV export, sheet import |
| `js/stats.js` | Trees tab: searchable nearest-first list, monthly chart, your own submissions |
| `js/legacy.js` | Reads the Google Sheet CSV (fallback data source and import source) |
| `js/outbox.js` | IndexedDB queue so a submission survives a lost connection or a sign-in redirect |
| `js/photo.js` | Shrinks photos on the phone before upload |
| `js/info.js` | Info tab text — **has one `[[contact email]]` placeholder** |
| `sw.js` | Service worker; caches the app shell only. **Bump `VERSION` when JS/CSS change** |
| `firestore.rules`, `storage.rules` | Security rules — paste into the Firebase console |
| `vendor/` | Leaflet 1.9.4 and Leaflet.markercluster, vendored so the shell works offline |

---

## How the data flows

1. A visitor taps **+ Add a tree**, places a pin, fills the form and submits.
2. The record and its (shrunken) photos are saved to an **outbox** in the
   browser first, so nothing is lost if the connection drops or the Google
   sign-in has to redirect.
3. On sign-in the outbox uploads: photos go to Cloud Storage as write-once
   objects, the record goes to Firestore as `trees/<uuid>` with
   `status: 'pending_review'`.
4. You open the **Review** tab (visible only to uids in the `admins` collection),
   check the photo and position, fix the label if needed, and **Approve** or
   **Reject**. Approving flips `status` to `verified`.
5. The public map listens to `where status == 'verified'` live, so the tree
   appears for everyone within a second of approval.

Contributors see their own pending / rejected trees in grey on the map and
with a status badge on the Trees tab. Rejection notes are shown to them there.

### Record fields (`trees/<uuid>`)

`uuid, lat, lon, name, access, notes, treeCount, girthCm, heightM, condition,
contributor, photoUrls[], photoUrl, status, userId, createdAt, syncedAt,
reviewedAt, reviewedBy, reviewNote, source`

`access` and `condition` are controlled vocabularies (see `js/config.js` and
`firestore.rules`; add to both). `userId` is the Firebase uid, never the email:
verified documents are public.

---

## Deploying

GitHub Pages serves straight from `main`:

1. Push to `main`.
2. Once only: repository **Settings → Pages → Source: Deploy from a branch →
   `main` / `/ (root)`**. The site appears at
   `https://johannaschoenecker.github.io/sequoia-map/` after a minute or two.
3. Add that hostname (`johannaschoenecker.github.io`) to Firebase →
   Authentication → Settings → Authorised domains, or sign-in fails silently.

Every push is a deploy. When you change JavaScript or CSS, bump `VERSION` in
`sw.js`; phones that have installed the app pick the update up on their
**second** launch after that.

---

## Before you share the link

1. **Complete `FIREBASE-SETUP.md`** and paste the config into `js/config.js`.
2. Open the app, sign in, add yourself to the `admins` collection, then use
   **Review → Import from Google Sheet** to bring the existing trees over
   (safe to run more than once; already-imported rows are skipped).
3. Fill in `[[contact email]]` in `js/info.js`.
4. Set a **budget alert** in Firebase (about £5) and switch on **App Check**
   before the link goes anywhere public.
5. Once the import is done, stop accepting responses on the old Google Form and
   set `LEGACY.sheetCsvUrl` to `''`.

---

## Costs

Firestore and Storage free tiers comfortably cover a few thousand trees and a
few thousand map views a day. The one thing that scales is photo egress: each
verified tree with a photo costs roughly 150 kB per popup opened. If the map
becomes popular, consider generating thumbnails (a Cloud Function or an
offline script) and pointing `photoUrl` at them.

Map tiles come from OpenStreetMap / CARTO / Esri public services under their
fair-use terms. For very heavy traffic, switch `BASEMAPS` in `js/config.js` to
a keyed provider (PeatProbe uses MapTiler).
