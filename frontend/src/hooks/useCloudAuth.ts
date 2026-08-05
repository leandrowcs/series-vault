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
      setUser(nextUser ? toCloudUser(nextUser) : null)
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
