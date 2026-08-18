import { useCallback, useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { firebaseAuth, googleProvider, hasFirebaseConfig } from '../firebase'

export type CloudUser = {
  uid: string
  name: string
  email: string
  picture: string
}

const AUTHORIZED_EMAILS = new Set(
  String(import.meta.env.VITE_AUTHORIZED_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
)

const UNAUTHORIZED_MESSAGE =
  'Sua conta não está autorizada. Para solicitar acesso ao app de teste, entre em contato com leandrowcs@gmail.com.'

const isAuthorizedUser = (user: User) =>
  Boolean(user.email && AUTHORIZED_EMAILS.has(user.email.toLowerCase()))

const toCloudUser = (user: User): CloudUser => ({
  uid: user.uid,
  name: user.displayName ?? '',
  email: user.email ?? '',
  picture: user.photoURL ?? '',
})

export const useCloudAuth = () => {
  const [user, setUser] = useState<CloudUser | null>(null)
  const [driveAccessToken, setDriveAccessToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!firebaseAuth) {
      setIsLoading(false)
      return
    }

    return onAuthStateChanged(firebaseAuth, (nextUser) => {
      if (nextUser && !isAuthorizedUser(nextUser)) {
        setUser(null)
        setDriveAccessToken(null)
        setError(UNAUTHORIZED_MESSAGE)
        void firebaseSignOut(firebaseAuth)
        setIsLoading(false)
        return
      }

      setUser(nextUser ? toCloudUser(nextUser) : null)
      setError(null)
      setIsLoading(false)
    })
  }, [])

  const signIn = useCallback(async () => {
    if (!firebaseAuth) {
      setError('Firebase não configurado')
      return
    }

    try {
      setError(null)
      const result = await signInWithPopup(firebaseAuth, googleProvider)
      if (!isAuthorizedUser(result.user)) {
        await firebaseSignOut(firebaseAuth)
        setDriveAccessToken(null)
        setUser(null)
        setError(UNAUTHORIZED_MESSAGE)
        return
      }

      const credential = GoogleAuthProvider.credentialFromResult(result)
      setDriveAccessToken(credential?.accessToken ?? null)
      setUser(toCloudUser(result.user))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login Google')
    }
  }, [])

  const signOut = useCallback(async () => {
    if (!firebaseAuth) return
    await firebaseSignOut(firebaseAuth)
    setDriveAccessToken(null)
    setUser(null)
  }, [])

  return {
    user,
    driveAccessToken,
    isConfigured: hasFirebaseConfig,
    isLoading,
    isSignedIn: Boolean(user),
    error,
    signIn,
    signOut,
  }
}
