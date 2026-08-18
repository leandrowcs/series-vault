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

const UNAUTHORIZED_MESSAGE =
  'Sua conta não está autorizada. Para solicitar acesso ao app de teste, entre em contato com leandrowcs@gmail.com.'
const AUTH_SERVER_ERROR_MESSAGE =
  'Não foi possível concluir o login porque o serviço retornou erro 500. Tente novamente e, se continuar, entre em contato com leandrowcs@gmail.com.'

const getAuthErrorMessage = (error: unknown) => {
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    Number(error.status) === 500
  ) {
    return AUTH_SERVER_ERROR_MESSAGE
  }

  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code)
    if (
      code === 'auth/operation-not-allowed' ||
      code === 'auth/account-exists-with-different-credential'
    ) {
      return 'Login Google não está habilitado para este projeto. Verifique a configuração do provedor no Firebase.'
    }

    if (code === 'auth/unauthorized-domain') {
      return 'Este domínio não está autorizado no Firebase Authentication.'
    }

    if (
      code === 'auth/internal-error' ||
      code === 'auth/network-request-failed'
    ) {
      return AUTH_SERVER_ERROR_MESSAGE
    }
  }

  return error instanceof Error ? error.message : 'Falha no login Google'
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

    return onAuthStateChanged(
      firebaseAuth,
      (nextUser) => {
        setUser(nextUser ? toCloudUser(nextUser) : null)
        if (nextUser) setError(null)
        setIsLoading(false)
      },
      (authError) => {
        setUser(null)
        setDriveAccessToken(null)
        setError(getAuthErrorMessage(authError))
        setIsLoading(false)
      },
    )
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
      setUser(null)
      setDriveAccessToken(null)
      setError(getAuthErrorMessage(err))
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
