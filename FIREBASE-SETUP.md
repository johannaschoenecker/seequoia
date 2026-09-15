# Firebase setup — once, about 20 minutes

Everything happens in the browser at <https://console.firebase.google.com>.
No CLI needed. Use a **separate project** from PeatProbe so the two apps' data,
rules and billing stay apart.

## 1. Create the project

- **Add project** → name `sequoia-map` → Google Analytics **off**.

## 2. Authentication (sign-in)

- Build → **Authentication** → Get started.
- **Sign-in method** tab → **Google** → Enable → choose a support email → Save.
- **Settings → Authorised domains → Add domain**:
  - `johannaschoenecker.github.io` — without this, sign-in on the published
    app fails **silently** (nothing happens when you tap Sign in).
  - `localhost` is already there.

## 3. Firestore (the database)

- Build → **Firestore Database** → Create database.
- Location: **europe-west2 (London)**. Cannot be changed later.
- Start in **production mode**.
- **Rules** tab → delete everything → paste the whole of `firestore.rules`
  from this repo → **Publish**.

## 4. Storage (photos)

- Build → **Storage** → Get started → same location.
- Firebase will ask you to upgrade to the **Blaze** (pay-as-you-go) plan.
  The free allowances almost certainly cover this app, but a card has to be on
  file.
- **Rules** tab → paste the whole of `storage.rules` → **Publish**.

## 5. Budget alert — do not skip

- ⚙ → **Usage and billing** → Details & settings → set a budget alert at
  about £5.

## 6. Get the web config

- ⚙ → **Project settings** → Your apps → **</>** (Web) → nickname `sequoia` →
  do **not** tick Firebase Hosting → Register app.
- Copy the `firebaseConfig` object it shows.

## 7. Put it in the app

In `js/config.js` set `enabled: true` and paste the values:

```js
export const FIREBASE = {
  enabled: true,
  config: {
    apiKey: '...',            // public identifier, not a secret -
    authDomain: '...',        // security lives in the rules
    projectId: '...',
    storageBucket: '...',
    messagingSenderId: '...',
    appId: '...',
  },
};
```

## 8. Make yourself an admin

1. Open the app (localhost or the published one) → **Sign in** (top right)
   with your Google account.
2. Firebase console → Authentication → **Users** tab → copy your **User UID**.
3. Firestore → **Start collection** → id `admins` → Document id = *paste your
   UID* → add any field (e.g. `note: "me"`) → Save.
4. Reload the app. The **Review** tab appears.

Nobody else can do this: the rules forbid all client writes to `admins`.

## 9. Import the existing trees

Review tab → **Import from Google Sheet**. It reads the published CSV, shows
you how many rows it found, and writes them into Firestore with their existing
approved / rejected status. Already-imported rows are skipped, so it is safe to
run again if the sheet gains rows before you close the form.

When you are done with the form, set `LEGACY.sheetCsvUrl` to `''` in
`js/config.js`.

## What you get

- Visitors see verified trees **without signing in**.
- Contributors sign in with Google; submissions land in `trees` with
  `status: pending_review`; photos in Storage under `photos/<uuid>-<n>.jpg`.
- Review tab: approve, reject (with a private note), edit label / access /
  notes, restore or delete rejected trees, export everything as CSV.
- Email addresses are never stored on tree documents. To contact a
  contributor, look up their `userId` under Authentication → Users.

## Before volunteers arrive — still open

- **App Check** (Build → App Check, reCAPTCHA v3) blocks automated abuse of
  the open endpoint. Then enable enforcement for Firestore and Storage.
- A privacy notice / conversation with the data protection office if this is
  run under the university's name.
