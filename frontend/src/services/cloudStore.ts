import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import { EpisodeDetail, TrackedSeries, WatchedEpisodeRecord } from '../types/series'

const USERS_COLLECTION = 'seriesVaultUsers'

const assertDb = () => {
  if (!db) throw new Error('Firestore não configurado')
  return db
}

const userDoc = (uid: string) => doc(assertDb(), USERS_COLLECTION, uid)
const trackedCollection = (uid: string) => collection(userDoc(uid), 'trackedSeries')
const watchedCollection = (uid: string) => collection(userDoc(uid), 'watchedEpisodes')

export const getEpisodeKey = (episode: Pick<EpisodeDetail, 'id' | 'tmdb_episode_id'>) =>
  episode.tmdb_episode_id ? `tmdb-${episode.tmdb_episode_id}` : `local-${episode.id}`

export const loadCloudTrackedSeries = async (uid: string): Promise<TrackedSeries[]> => {
  const snapshot = await getDocs(trackedCollection(uid))
  return snapshot.docs
    .map((item) => item.data() as TrackedSeries)
    .sort((a, b) => a.title.localeCompare(b.title))
}

export const saveCloudTrackedSeries = async (uid: string, series: TrackedSeries) => {
  await setDoc(
    doc(trackedCollection(uid), String(series.tmdb_id)),
    {
      ...series,
      updated_at: serverTimestamp(),
    },
    { merge: true },
  )
}

export const loadCloudWatchedEpisodes = async (uid: string): Promise<WatchedEpisodeRecord[]> => {
  const snapshot = await getDocs(watchedCollection(uid))
  return snapshot.docs.map((item) => item.data() as WatchedEpisodeRecord)
}

export const saveCloudWatchedEpisode = async (
  uid: string,
  series: TrackedSeries,
  episode: EpisodeDetail,
) => {
  const record: WatchedEpisodeRecord = {
    episode_key: getEpisodeKey(episode),
    episode_id: episode.id,
    tmdb_episode_id: episode.tmdb_episode_id,
    series_tmdb_id: series.tmdb_id,
    watched_at: new Date().toISOString(),
    progress_percent: 100,
    runtime_minutes: episode.runtime,
    title: episode.title,
    season_number: episode.season_number,
    episode_number: episode.episode_number,
  }

  await setDoc(doc(watchedCollection(uid), record.episode_key), record, { merge: true })
}

export const deleteCloudWatchedEpisode = async (uid: string, episode: EpisodeDetail) => {
  await deleteDoc(doc(watchedCollection(uid), getEpisodeKey(episode)))
}

export const publishCloudProfile = async (uid: string, user: { name: string; email: string; picture: string }) => {
  await setDoc(
    userDoc(uid),
    {
      displayName: user.name,
      email: user.email,
      photoUrl: user.picture,
      updated_at: serverTimestamp(),
    },
    { merge: true },
  )
}
