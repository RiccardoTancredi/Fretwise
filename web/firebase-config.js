/* Firebase settings for this copy of Fretwise.
   These values identify the Firebase project; they are not secrets (every Firebase web app ships them).
   What keeps your data private is firestore.rules: each account can only read and write its own data.
   Fill them in from Firebase console → Project settings → General → Your apps → Web app → Config,
   and vapidKey from Project settings → Cloud Messaging → Web Push certificates → Key pair. */
self.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCn5dDeTfSFYqB2UmJyyKWdw_l5auToo1g",
  authDomain: "fretwise-6f6db.firebaseapp.com",
  projectId: "fretwise-6f6db",
  storageBucket: "fretwise-6f6db.firebasestorage.app",
  messagingSenderId: "473037965466",
  appId: "1:473037965466:web:98a648497a57226b1c3723",
  vapidKey: ""   // Project settings → Cloud Messaging → Web Push certificates → Key pair
};
