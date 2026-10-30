import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, type User } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import appletFirebaseConfig from '../firebase-applet-config.json';

const envObj: Record<string, string | undefined> =
  typeof process !== 'undefined' && process.env ? process.env : {};

const resolvedFirebaseConfig = appletFirebaseConfig?.projectId
  ? appletFirebaseConfig
  : {
      apiKey: envObj.VITE_FIREBASE_API_KEY || appletFirebaseConfig.apiKey,
      authDomain: envObj.VITE_FIREBASE_AUTH_DOMAIN || appletFirebaseConfig.authDomain,
      projectId: envObj.VITE_FIREBASE_PROJECT_ID || appletFirebaseConfig.projectId,
      storageBucket:
        envObj.VITE_FIREBASE_STORAGE_BUCKET || appletFirebaseConfig.storageBucket,
      messagingSenderId:
        envObj.VITE_FIREBASE_MESSAGING_SENDER_ID ||
        appletFirebaseConfig.messagingSenderId,
      appId: envObj.VITE_FIREBASE_APP_ID || appletFirebaseConfig.appId,
      firestoreDatabaseId: appletFirebaseConfig.firestoreDatabaseId,
    };

const app = initializeApp(resolvedFirebaseConfig);

export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  },
  resolvedFirebaseConfig.firestoreDatabaseId &&
    resolvedFirebaseConfig.firestoreDatabaseId !== '(default)'
    ? resolvedFirebaseConfig.firestoreDatabaseId
    : undefined
);

export const auth = getAuth(app);

let authPromise: Promise<User | null> | null = null;

export async function ensureAuthenticated(): Promise<User | null> {
  if (!auth) return null;
  if (auth.currentUser) return auth.currentUser;
  if (authPromise) return authPromise;

  authPromise = (async () => {
    try {
      if (typeof auth.authStateReady === 'function') {
        await auth.authStateReady();
      }
      if (auth.currentUser) return auth.currentUser;
      const cred = await signInAnonymously(auth);
      return cred.user;
    } catch {
      return auth.currentUser || null;
    } finally {
      authPromise = null;
    }
  })();

  return authPromise;
}

