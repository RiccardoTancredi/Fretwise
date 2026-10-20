/* Firebase settings for this copy of Fretwise.
   These values identify the Firebase project; they are not secrets (every Firebase web app ships them).
   What keeps your data private is firestore.rules: each account can only read and write its own data.
   Fill them in from Firebase console → Project settings → General → Your apps → Web app → Config,
   and vapidKey from Project settings → Cloud Messaging → Web Push certificates → Key pair. */
self.FIREBASE_CONFIG = {
  apiKey: "REPLACE_ME",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  vapidKey: ""
};
