export type SearchResult = {
  tmdb_id: number
  name: string
  first_air_date?: string
  overview?: string
  poster_path?: string
}

export type TrackedSeries = {
  id: number
  tmdb_id: number
  title: string
  overview?: string
  poster_path?: string
  backdrop_path?: string
  completed_percent: number
  number_of_seasons?: number
  number_of_episodes?: number
  status?: string
  first_air_date?: string
  last_air_date?: string
  episode_run_time?: number
  vote_average?: number
  vote_count?: number
  genres?: string[]
  actors?: {
    name: string
    character?: string
    profile_path?: string
  }[]
  user_status?: 'abandoned'
  library_status?: 'abandoned'
  personal_status?: 'abandoned'
  last_synced_at?: string
}

export type EpisodeDetail = {
  id: number
  tmdb_episode_id?: number
  season_number: number
  episode_number: number
  title?: string
  overview?: string
  air_date?: string
  runtime?: number
  still_path?: string
  watched: boolean
  progress_percent: number
}

export type CalendarEvent = {
  episode_id: number
  series_id: number
  series_title?: string
  season_number?: number
  episode_number?: number
  title?: string
  air_date?: string
  still_path?: string
  series_poster_path?: string
  watched?: boolean
}

export type CalendarNewEpisode = {
  episode_id: number
  series_id: number
  series_title?: string
  season_number?: number
  episode_number?: number
  title?: string
  air_date?: string
  still_path?: string
  series_poster_path?: string
}

export type OverviewStats = {
  total_watched_episodes: number
  total_runtime_minutes: number
}

export type GenreStat = {
  genre: string
  count: number
}

export type ActorStat = {
  actor: string
  profile_path?: string
  count: number
}

export type YearStat = {
  year: string
  count: number
}

export type TopSeriesStat = {
  series: string
  poster_path?: string
  count: number
}

export type WatchedEpisodeRecord = {
  episode_key: string
  episode_id: number
  tmdb_episode_id?: number
  series_tmdb_id: number
  watched_at: string
  progress_percent: number
  runtime_minutes?: number
  title?: string
  season_number?: number
  episode_number?: number
}

export type SeriesVaultBackup = {
  version: 1
  trackedSeries: TrackedSeries[]
  watchedEpisodes: WatchedEpisodeRecord[]
  episodeCache: Record<string, EpisodeDetail[]>
  exportedAt: string
}
