import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { initializeFirestore } from 'firebase/firestore'
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const REQUIRED_FIREBASE_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'] as const
const REQUIRED_MESSAGING_KEYS = ['apiKey', 'projectId', 'messagingSenderId', 'appId'] as const

const isConfiguredValue = (value: unknown) => {
  if (typeof value !== 'string') return false
  const normalized = value.trim()
  return Boolean(normalized) && !/^(changeme|your[_-]?|replace[_-]?)/i.test(normalized)
}

export const hasFirebaseConfig = REQUIRED_FIREBASE_KEYS.every((key) => isConfiguredValue(firebaseConfig[key]))
export const firebaseMessagingVapidKey = String(import.meta.env.VITE_FIREBASE_VAPID_KEY ?? '').trim()
export const hasFirebaseMessagingConfig =
  hasFirebaseConfig &&
  REQUIRED_MESSAGING_KEYS.every((key) => isConfiguredValue(firebaseConfig[key])) &&
  isConfiguredValue(firebaseMessagingVapidKey)

const firebaseApp = (() => {
  if (!hasFirebaseConfig) return null

  try {
    return initializeApp(firebaseConfig)
  } catch (err) {
    console.warn('Firebase disabled due to invalid runtime configuration.', err)
    return null
  }
})()

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null
export const db = firebaseApp ? initializeFirestore(firebaseApp, { ignoreUndefinedProperties: true }) : null
export const getFirebaseMessaging = async (): Promise<Messaging | null> => {
  if (!firebaseApp || !hasFirebaseMessagingConfig) return null

  const supported = await isSupported()
  return supported ? getMessaging(firebaseApp) : null
}

export const getFirebaseServiceWorkerConfig = () => {
  if (!hasFirebaseMessagingConfig) return null

  return {
    apiKey: firebaseConfig.apiKey,
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
    storageBucket: firebaseConfig.storageBucket,
    messagingSenderId: firebaseConfig.messagingSenderId,
    appId: firebaseConfig.appId,
  }
}

export const googleProvider = new GoogleAuthProvider()
googleProvider.addScope('openid')
googleProvider.addScope('email')
googleProvider.addScope('profile')
googleProvider.addScope('https://www.googleapis.com/auth/drive.appdata')
googleProvider.setCustomParameters({ prompt: 'select_account' })
