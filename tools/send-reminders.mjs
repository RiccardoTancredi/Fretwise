// Sends each signed-up device one reminder a day, at the hour chosen in the app, listing what
// hasn't had its 10 minutes yet today, plus the number of words due. Runs hourly in GitHub Actions.
//   FIREBASE_SERVICE_ACCOUNT  service-account key JSON (repository secret)
//   APP_URL                   where the app lives, opened when the notification is tapped
//   FORCE=1                   send now, whatever the hour (for a test run)
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, FieldPath } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const { FIREBASE_SERVICE_ACCOUNT, APP_URL = './', FORCE } = process.env;
if (!FIREBASE_SERVICE_ACCOUNT) { console.log('Skipping: set the FIREBASE_SERVICE_ACCOUNT secret to send reminders.'); process.exit(0); }
initializeApp({ credential: cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore(), fcm = getMessaging();
const NAMES = { guitar: 'Guitar', ukulele: 'Ukulele', chess: 'Chess', words: 'Words', paintings: 'Paintings' };

// date and hour where the person is, e.g. ['2026-10-20', 19]
function localNow(tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return [`${p.year}-${p.month}-${p.day}`, Number(p.hour)];
}
const minutes = (act, day, k) => Object.values(((act.d || {})[day] || {})[k] || {}).reduce((a, b) => a + b, 0) / 60000;

let sent = 0, checked = 0;
for (const user of await db.collection('users').listDocuments()) {
  const state = user.collection('state');
  const push = (await state.doc('push').get()).data();
  const tokens = Object.keys((push && push.tokens) || {});
  if (!tokens.length) continue;
  checked++;
  const tz = push.tz || 'Europe/Madrid', goal = push.goal || 10, hour = push.hour ?? 19;
  const [day, h] = localNow(tz);
  if (!FORCE && (h < hour || push.lastSent === day)) continue;

  const act = (await state.doc('activity').get()).data() || {};
  const items = Object.entries(push.items || {}).filter(([, on]) => on).map(([k]) => k);
  const todo = items.filter(k => minutes(act, day, k) < goal);
  let due = 0;
  if (items.includes('words')) {
    const w = (await state.doc('words').get()).data() || {}, now = Date.now();
    for (const lang of Object.values(w.p || {})) for (const v of Object.values(lang)) if (v.due <= now) due++;
  }
  if (!todo.length && !due && !FORCE) { await state.doc('push').set({ lastSent: day }, { merge: true }); continue; }

  const parts = todo.map(k => { const m = Math.floor(minutes(act, day, k)); return m ? `${NAMES[k]} (${m}/${goal} min)` : NAMES[k]; });
  const title = todo.length ? `${goal} minutes of practice?` : 'Words to review';
  const body = [parts.length ? parts.join(' · ') : '', due ? `${due} ${due === 1 ? 'word' : 'words'} due` : ''].filter(Boolean).join('\n') || 'All done for today. Nice work.';

  for (const token of tokens) {
    try {
      await fcm.send({ token, data: { title, body, url: APP_URL }, webpush: { headers: { Urgency: 'high', TTL: '21600' } } });
      sent++;
    } catch (e) {
      const c = e.errorInfo && e.errorInfo.code;
      if (c === 'messaging/registration-token-not-registered' || c === 'messaging/invalid-registration-token' || c === 'messaging/invalid-argument')
        await state.doc('push').update(new FieldPath('tokens', token), FieldValue.delete()).catch(() => {});
      else console.log('send failed:', c || e.message);
    }
  }
  await state.doc('push').set({ lastSent: day }, { merge: true });
}
console.log(`Checked ${checked} ${checked === 1 ? 'account' : 'accounts'} with reminders, sent ${sent} ${sent === 1 ? 'notification' : 'notifications'}.`);
