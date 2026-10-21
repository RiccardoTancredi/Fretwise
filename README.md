# Fretwise

Ten minutes a day: learn the guitar and ukulele fretboards, solve chess puzzles and drill openings, learn the words from your own Notion dictionaries, and get to know paintings, famous ones and deep cuts.

Live app: **https://riccardotancredi.github.io/Fretwise/**: it installs on a phone like an app (browser menu → *Add to Home screen*) and works offline.

## What's inside

| Section | What you practise | Data |
|---|---|---|
| Guitar, Ukulele | Name the note, find the note, all positions (timed), chords, intervals, and scales (major and minor, pentatonic and blues, the modes; one position or the whole neck) | — |
| Chess | Lichess puzzles with a rating, and an opening trainer (77 lines in 20 openings, with the idea of each and why every move is played) | [Lichess puzzle and openings databases](https://database.lichess.org/) (CC0), in `data/puzzles.json` |
| Words | 5 new words at a time, matched with their definitions, then spaced reviews. A daily limit of new words per dictionary (10 by default) | Your Notion dictionaries, **private** (see below) |
| Paintings | Who painted it? What is it called? When? Each question has its own review schedule, and a work counts as known only after two right answers in a row for each | [Wikidata](https://www.wikidata.org/) (CC0) and public-domain images on [Wikimedia Commons](https://commons.wikimedia.org/), in `data/paintings.json` |

Today’s words and paintings stay on screen until midnight (Italian time), and you can look back at what you saw on each of the last 60 days. Each section counts the minutes you spend on it today against a 10-minute goal, and a daily notification reminds you of the ones you haven't done.

## How your words stay private

The repository is public, but your dictionaries are never in it:

1. A scheduled job ([`sync-words.yml`](.github/workflows/sync-words.yml)) reads the four Notion databases with your Notion token and writes them to Firestore under `users/<your account id>/dict`. The token, the Firebase key and your account ID are repository **secrets**, and the job logs only counts, never words.
2. [`firestore.rules`](firestore.rules) lets an account read only its own data, and nobody can write the dictionaries from a browser.
3. The app reads them only after you sign in with Google. Signing out removes the dictionary cache for that account. Local progress and settings are stored separately for each account, including a separate guest session.

Progress (scores, review schedule, practice time) is saved in your browser and, once you sign in, synced through your account. Switching accounts reloads the app before opening the other account’s data. Guest progress is not automatically imported on sign-in.

Older unscoped browser saves are left untouched but are not imported automatically: their owner cannot be established safely. Previously synced progress is restored from the signed-in account; local-only preferences and fretboard accuracy maps start fresh once.

## Setting it up

Do these once, in order. Each step says where to click.

### 1. GitHub Pages
1. GitHub → the **Fretwise** repository → **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.

Every push to `main` now publishes the app at https://riccardotancredi.github.io/Fretwise/.

### 2. Push your changes
From Terminal:
```sh
sh ~/Documents/FretWise/push.sh "what changed"
```
It first pulls what GitHub's own jobs committed (for example the monthly paintings update), then commits and pushes your changes.

### 3. Firebase project (free plan)
1. [console.firebase.google.com](https://console.firebase.google.com/) → **Add project** (Google Analytics not needed). ✔ done: `fretwise-6f6db`.
2. **Project settings (gear) → General → Your apps → Web (</>)** → register an app called Fretwise (no Hosting). Copy `firebaseConfig` into [`web/firebase-config.js`](web/firebase-config.js). ✔ done.

### 4. Google sign-in
1. **Build → Authentication → Get started → Sign-in method → Google → Enable**, choose your support e-mail, **Save**.
2. **Authentication → Settings → Authorized domains → Add domain** → `riccardotancredi.github.io`. Without this, *Sign in* fails on the live site.

### 5. Database and its rules
1. **Build → Firestore Database → Create database** → *Start in production mode*, location `eur3 (europe-west)`.
2. Open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules), click **Publish**.

These rules are what keep your data private: each account can only read and write its own data, and nobody can write the dictionaries from a browser.

### 6. Limit the web key to your sites (recommended)
The `apiKey` in `firebase-config.js` is not a password, since every Firebase website shows it, but you can make sure it only works from your own pages:
1. [console.cloud.google.com](https://console.cloud.google.com/) → select the project **fretwise-6f6db** → **APIs & Services → Credentials**.
2. Open **Browser key (auto created by Firebase)**.
3. **Application restrictions → Websites** → add these three, then **Save**:
   - `https://riccardotancredi.github.io/*`
   - `https://fretwise-6f6db.firebaseapp.com/*`
   - `http://localhost/*`
4. Leave **API restrictions** as they are (restricting APIs can break sign-in or notifications).

### 7. Notification key
1. Firebase → **Project settings → Cloud Messaging**. If *Firebase Cloud Messaging API (V1)* says disabled, enable it.
2. **Web Push certificates → Generate key pair**. Copy the key into `vapidKey` in [`web/firebase-config.js`](web/firebase-config.js), then push (step 2).

### 8. Notion integration
1. [notion.so/profile/integrations](https://www.notion.so/profile/integrations) → **New integration** → type *Internal*, workspace: yours → **Save**. Under **Capabilities** keep only *Read content*. Copy the **Internal Integration Secret**.
2. Open each of the four dictionary databases (Italiano, English, Español, Català) → **••• (top right) → Connections → Connect to** → your integration.

### 9. Firebase service account
1. Firebase → **Project settings → Service accounts → Generate new private key**. A JSON file downloads.
2. **Never commit it** or paste it in a chat. You'll paste it into a GitHub secret in the next step, then you can delete the file.

### 10. GitHub secrets
1. Open https://riccardotancredi.github.io/Fretwise/, **Sign in** with Google, tap your name → **Account ID → Copy**.
2. GitHub → repository → **Settings → Secrets and variables → Actions → New repository secret**, three times:

| Name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | the whole content of the JSON file from step 9 |
| `NOTION_TOKEN` | the integration secret from step 8 |
| `OWNER_UID` | the Account ID you just copied |

To share the four dictionaries with a trusted person, have them sign in to Fretwise with their own Google account and copy their **Account ID**. Add an optional repository secret `SHARED_WITH_UIDS` containing the invited Account IDs, separated by commas or newlines (a JSON array also works). Keep `OWNER_UID` unchanged. Run the word sync again.

The job verifies that every recipient is an existing, active Firebase account, then writes the same dictionaries into each account’s own `dict` collection. It never copies scores, review schedules or practice time. Other accounts receive no dictionaries automatically, and recipients need no Notion account or access to the Notion integration. Each future sync updates all configured recipients. Removing an ID stops future updates; it does not delete a copy already shared.

### 11. First word sync
1. GitHub → **Actions → Sync words from Notion → Run workflow**.
2. When it finishes, the log shows how many words each dictionary has (and how many accounts were synced). A dictionary that says *not shared with the Notion integration* still needs step 8.2.
3. In the app, open **Words**: your dictionaries are there. From now on the sync runs once a day, scheduled for 06:23 UTC.

### 12. Reminders
1. On your phone, open the site and install it: browser menu → **Add to Home screen**.
2. In the app, tap your name → **Remind me on this device**, choose the hour and the sections. Allow notifications when asked. **Send a test notification** checks that the phone can show them.
3. To test the real thing: GitHub → **Actions → Daily reminders → Run workflow**, tick **force**, **Run**. A notification should arrive within a minute.

Enable reminders separately on each phone, while signed in to that person's own account. The job checks every account with registered devices; sharing dictionaries does not turn notifications on automatically. Notifications are handled both while the app is open and while it is in the background. Opening the app refreshes a previously enabled device's registration without enabling another account or overriding an explicit opt-out.

If an older installation stops receiving reminders, reload it, then check **Remind me on this device** (turn it off and on if necessary). **Send a test notification** checks local display only. The Actions log reports device counts, expired registrations and messages accepted by FCM for each account; acceptance by FCM does not confirm that the phone displayed the notification.

## Scheduled jobs

| Workflow | When | What |
|---|---|---|
| Deploy the app | every push | builds `dist/` and publishes it |
| Build paintings | 1st of every month | rebuilds `data/paintings.json` from Wikidata, commits it, redeploys |
| Sync words from Notion | once a day, 06:23 UTC | Notion → your private Firestore space |
| Daily reminders | every hour | one notification a day per device, at the hour you picked |

GitHub pauses scheduled jobs in a repository with no commits for 60 days. The monthly paintings commit keeps it active.

## Working on it

```sh
node --test tools/tests/*.test.mjs   # privacy and dictionary sync checks
node tools/build.mjs                 # builds dist/
python3 -m http.server -d dist 8000  # then open http://localhost:8000
node tools/build-paintings.mjs       # refresh the paintings list
```

`src/app.html` is the whole app: one page, no build step, no framework. It is also the version that runs inside Claude. `web/` holds the web-only parts: sign-in and sync (`platform.js`), the service worker, the manifest and the icons.

Paintings are limited to painters who died more than 70 years ago, because the rest are still under copyright in the EU. The cut-off moves forward every January.
