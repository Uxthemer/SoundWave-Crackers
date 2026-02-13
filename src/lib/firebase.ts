import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth
const auth = getAuth(app);

// Set persistence to LOCAL
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error('Error setting auth persistence:', error);
});


// Export a function to get messaging, rather than a top-level await value
// to avoid build issues with esbuild/vite top-level await requirements.

const getFirebaseMessaging = async () => {
  if (typeof window !== 'undefined') {
    try {
      const { getMessaging } = await import('firebase/messaging');
      return getMessaging(app);
    } catch (e) {
      console.error("Firebase messaging failed to load", e);
      return null;
    }
  }
  return null;
};

// We can export a promise or just the function
export { auth, getFirebaseMessaging };
export const messaging = typeof window !== 'undefined' ? (async () => await getFirebaseMessaging())() : null;