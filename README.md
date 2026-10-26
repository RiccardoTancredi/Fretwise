# Fretwise

A little every day: learn the guitar and ukulele fretboards, solve chess puzzles and drill openings, learn the words from your own Notion dictionaries, and get to know paintings, famous ones and deep cuts.

Live app: **https://riccardotancredi.github.io/Fretwise/**: it installs on a phone like an app (browser menu → *Add to Home screen*) and works offline.

## What's inside

| Section | What you practise | Data |
|---|---|---|
| Guitar, Ukulele | Name the note, find the note, all positions (timed), chords, intervals, scales (major and minor, pentatonic and blues, the modes, and jazz colours such as altered, whole-tone and diminished; one position or the whole neck), and a Theory area with an interactive circle of fifths, a free chord reference and a tuner | — |
| Chess | Lichess puzzles with a rating (optionally linked to your own Lichess account, so results count there), and an opening trainer (77 lines in 20 openings, with the idea of each and why every move is played), and a coordinates trainer (find the named square against the clock, with bests) | [Lichess puzzle and openings databases](https://database.lichess.org/) (CC0), in `data/puzzles.json` |
| Words | New words each day (your daily goal, per dictionary), matched with their definitions, then spaced reviews: the next day, after 3 days, a week, a month and three months while you get them right; a mistake brings the word back tomorrow. Review brings back every word due. Tap ☆ on a word to keep it in ★ Favorites. **Spanish verbs** (Conjugate): a covered card asks a form of one of the 10 most common verbs: say it out loud, tap to see it, tap again for the next, up to your daily goal (forms already done today count when you raise it). Each form has its own spaced review; your answer history, and full tables (indicative, subjunctive, imperatives, gerund and participle) with irregular parts in red, stem changes in fuchsia and spelling changes in blue | Your Notion dictionaries, **private** (see below) |
| Paintings | Who painted it? What is it called? Which movement? The question rotates each time a work comes back. Spaced reviews: the next day, after 3 days, a week, 16 days, 35 days, then every three months while you get it right; a mistake brings it back in your next round. A work counts as known after three right review days in a row. Once answered, the caption shows the painter, the year, the museum where it hangs now with its country, and the movement; tap ☆ to keep a work in ★ Favorites | [Wikidata](https://www.wikidata.org/) (CC0) and public-domain images on [Wikimedia Commons](https://commons.wikimedia.org/), in `data/paintings.json` |

Today’s words and paintings stay on screen until midnight (Italian time), and you can look back at what you saw on each of the last 60 days. Each start card turns green once you’ve done something there today: one exercise, or your daily goal of words and paintings (1, 5, 10 or 20, in their settings). A daily notification reminds you of the ones you haven't done.

Chord exercises spell notes from the chord itself, show which tones are required or optional, and offer an optional **Altered dominants (7alt)** group on guitar and ukulele. The **Circle of 5ths → How chords work** section compares chord formulas on the selected root and plays a sample voicing. A saved shape is a preview: **Continue building**, **Clear**, or editing the neck returns to your own selection.

**Theory → All Chords** lets you choose a root and any chord type, browse suggested guitar or ukulele voicings, hear them and switch between note names and degrees. Its fret range and bass preference are independent of practice settings. Suggestions use a four-fret box, neighbouring sounding strings and up to four fingers; they do not cover every possible fingering.

**Theory → Tuner** tunes one string at a time with the microphone: pick a string from the palette (on a phone: 3 + 3 for guitar, 4 in a row for ukulele, 5 + 5 for 12-string), play it alone, and it moves on once it holds within 3 cents. Guitar: standard, Drop D, half a step down, a whole step down, Open G, DADGAD and 12-string (ten notes: each string of the four octave pairs, then 1–2 and 3–4, which are unisons); ukulele: high G, low G and baritone. The reference A is adjustable (430–450 Hz, 440 by default); every string's pitch is worked out from it. By default it also detects which string you are playing, in any order (switch to “I choose the string” to pick it yourself). “Play this string” pauses listening while it sounds, so the reference can't tick a string off. While it listens the screen stays on, where the browser supports it. Pitch detection listens only around the string, so a louder overtone isn't taken for the note. A quiet room helps; for a 12-string or a noisy room a clip-on tuner is easier.

**Previous exercises** opens a read-only history in every practice section (not under Theory, which has no exercises): music solutions and chord shapes, word answers, paintings, chess puzzle solutions and opening drills, and coordinate runs. Previous/Next scroll through exercises; chess replays have separate move controls. Closing the review returns to the current question without changing scores or spaced reviews. It keeps up to 100 completed exercises per section and account **on this device**, starting with this update; this detailed history is not cloud-synced. Private word contents are not duplicated in history: word IDs resolve against the signed-in account’s loaded dictionaries. Timed runs and animated chess sequences must finish before opening history.

After a chord exercise, **Explore this shape** (or a tap on the finished fretboard) opens an editable copy. Move or mute notes to see common chord interpretations, the actual bass and alternative names. **Undo**, **Redo** and **Restore original** affect only the copy. The explorer is also available from All Chords and past chord exercises. It recognises the app’s common chord formulas, explicitly marks contextual rootless readings, and lists the notes when no common name fits.

Changing practice settings keeps completed results and the current draft; new fret ranges, chord groups, inversions and shape counts apply to the next question. Round length accepts any whole number from 1 to 100 on guitar and ukulele, with quick choices of 1, 5, 10 and 20, and updates the active round: shortening below the completed count shows every completed result, and a summary is counted only once. Each music mode keeps its active question and results locally for this account, including after a reload. An interrupted timed run resumes only after pressing Resume. Word answers are saved individually before Finish; changing word/painting daily goals keeps the active session, with the new size used by the next session. Chess puzzle difficulty and coordinate settings also leave the current exercise running.

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
