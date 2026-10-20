# Fretwise

Ten minutes a day: learn the guitar and ukulele fretboards, solve chess puzzles and drill openings, learn the words from your own Notion dictionaries, and get to know paintings, famous ones and deep cuts.

Live app: **https://riccardotancredi.github.io/Fretwise/**: it installs on a phone like an app (browser menu → *Add to Home screen*) and works offline.

## What's inside

| Section | What you practise | Data |
|---|---|---|
| Guitar, Ukulele | Name the note, find the note, all positions (timed), chords, intervals and scales | — |
| Chess | Lichess puzzles with a rating, and an opening trainer (77 lines in 20 openings) | [Lichess puzzle and openings databases](https://database.lichess.org/) (CC0), in `data/puzzles.json` |
| Words | 5 new words at a time, matched with their definitions, then spaced reviews. A daily limit of new words per dictionary (10 by default) | Your Notion dictionaries, **private** (see below) |
| Paintings | Who painted it? What is it called? | [Wikidata](https://www.wikidata.org/) (CC0) and public-domain images on [Wikimedia Commons](https://commons.wikimedia.org/), in `data/paintings.json` |

Each section counts the minutes you spend on it today against a 10-minute goal, and a daily notification reminds you of the ones you haven't done.

## How your words stay private

The repository is public, but your dictionaries are never in it:

1. A scheduled job ([`sync-words.yml`](.github/workflows/sync-words.yml)) reads the four Notion databases with your Notion token and writes them to Firestore under `users/<your account id>/dict`. The token, the Firebase key and your account ID are repository **secrets**, and the job logs only counts, never words.
2. [`firestore.rules`](firestore.rules) lets an account read only its own data, and nobody can write the dictionaries from a browser.
3. The app reads them only after you sign in with Google. Signing out removes the copy from that browser.

Progress (scores, review schedule, practice time) is saved in your browser and, once you sign in, synced through your account.

## Setting it up

### 1. GitHub Pages
Repository → **Settings → Pages → Build and deployment → Source: GitHub Actions**. Every push to `main` deploys the app.

### 2. Firebase (free plan)
1. [console.firebase.google.com](https://console.firebase.google.com/) → **Add project** (Analytics not needed).
2. **Build → Authentication → Get started → Google → Enable**. Then **Settings → Authorized domains → Add domain**: `riccardotancredi.github.io`.
3. **Build → Firestore Database → Create database** → *Production mode*, location `eur3` (Europe). Open the **Rules** tab, paste the contents of [`firestore.rules`](firestore.rules), **Publish**.
4. **Project settings (gear) → General → Your apps → Web (</>)** → register an app called Fretwise (no Hosting). Copy the values of `firebaseConfig` into [`web/firebase-config.js`](web/firebase-config.js).
5. **Project settings → Cloud Messaging → Web Push certificates → Generate key pair**. Put that key in `vapidKey` in the same file.
6. **Project settings → Service accounts → Generate new private key**. This downloads a JSON file. **Never commit it.** Add it as a secret (step 4).

### 3. Notion
1. [notion.so/profile/integrations](https://www.notion.so/profile/integrations) → **New integration** (internal, read content only). Copy its token.
2. Open each dictionary database in Notion → **••• → Connections → add** the integration.

### 4. Repository secrets
Repository → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | the whole content of the JSON file from Firebase step 6 |
| `NOTION_TOKEN` | the Notion integration token |
| `OWNER_UID` | your account ID: open the app, sign in, tap your name → *Account ID* → Copy |

Then **Actions → Sync words from Notion → Run workflow**. After that it runs every 6 hours.

### 5. Reminders
In the app: tap your name → *Remind me on this device*, pick the hour and the sections. The [`reminders.yml`](.github/workflows/reminders.yml) job runs every hour and sends one notification a day. To test it: **Actions → Daily reminders → Run workflow → force**.

## Scheduled jobs

| Workflow | When | What |
|---|---|---|
| Deploy the app | every push | builds `dist/` and publishes it |
| Build paintings | 1st of every month | rebuilds `data/paintings.json` from Wikidata, commits it, redeploys |
| Sync words from Notion | every 6 hours | Notion → your private Firestore space |
| Daily reminders | every hour | one notification a day per device, at the hour you picked |

GitHub pauses scheduled jobs in a repository with no commits for 60 days. The monthly paintings commit keeps it active.

## Working on it

```sh
node tools/build.mjs                 # builds dist/
python3 -m http.server -d dist 8000  # then open http://localhost:8000
node tools/build-paintings.mjs       # refresh the paintings list
```

`src/app.html` is the whole app: one page, no build step, no framework. It is also the version that runs inside Claude. `web/` holds the web-only parts: sign-in and sync (`platform.js`), the service worker, the manifest and the icons.

Paintings are limited to painters who died more than 70 years ago, because the rest are still under copyright in the EU. The cut-off moves forward every January.
