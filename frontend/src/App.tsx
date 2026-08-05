import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useCloudAuth } from './hooks/useCloudAuth'
import { useGoogleDriveBackup } from './hooks/useGoogleDriveBackup'
import {
  deleteCloudWatchedEpisode,
  getEpisodeKey,
  loadCloudTrackedSeries,
  loadCloudWatchedEpisodes,
  publishCloudProfile,
  saveCloudTrackedSeries,
  saveCloudWatchedEpisode,
} from './services/cloudStore'
import {
  ActorStat,
  CalendarEvent,
  CalendarNewEpisode,
  EpisodeDetail,
  GenreStat,
  OverviewStats,
  SearchResult,
  SeriesVaultBackup,
  TopSeriesStat,
  TrackedSeries,
  WatchedEpisodeRecord,
  YearStat,
} from './types/series'
import './App.css'

type SeasonEpisodeGroup = {
  seasonNumber: number
  episodes: EpisodeDetail[]
  watchedCount: number
}

type ActiveTab = 'home' | 'tracked' | 'calendar' | 'stats' | 'search'

type LibraryFilter = 'watching' | 'inProgress' | 'waiting' | 'finished'

type DashboardMetric = {
  label: string
  value: string
  icon: string
  tone: 'cyan' | 'purple' | 'amber' | 'green'
}

const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL ?? '').trim()
const apiBaseUrl = configuredApiBaseUrl || '/api'
const hasApi = Boolean(apiBaseUrl)

const api = axios.create({
  baseURL: apiBaseUrl,
  headers: { 'Content-Type': 'application/json' },
})

type TmdbImageSize = 'w92' | 'w185' | 'w300' | 'w342' | 'w500' | 'original'

const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p'

const tmdbImageUrl = (path?: string, size: TmdbImageSize = 'w342') => {
  if (!path) return undefined
  return `${TMDB_IMAGE_BASE_URL}/${size}${path.startsWith('/') ? path : `/${path}`}`
}

type MediaImageProps = {
  path?: string
  alt: string
  className: string
  fallback: string
  size?: TmdbImageSize
}

const MediaImage = ({ path, alt, className, fallback, size = 'w342' }: MediaImageProps) => {
  const src = tmdbImageUrl(path, size)

  if (!src) {
    return <div className={`${className} image-placeholder`}>{fallback}</div>
  }

  return <img className={className} src={src} alt={alt} loading="lazy" />
}

const formatDate = (dateString?: string) => {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const getApiErrorMessage = (err: unknown, fallback: string) => {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail
    if (typeof detail === 'string') return detail
  }

  return fallback
}

const mergeTrackedSeries = (current: TrackedSeries[], incoming: TrackedSeries[]) => {
  const byTmdbId = new Map<number, TrackedSeries>()

  current.forEach((series) => byTmdbId.set(series.tmdb_id, series))
  incoming.forEach((series) => {
    const existing = byTmdbId.get(series.tmdb_id)
    byTmdbId.set(series.tmdb_id, existing ? { ...series, ...existing } : series)
  })

  return Array.from(byTmdbId.values()).sort((a, b) => a.title.localeCompare(b.title))
}

const watchedMapFromRecords = (records: WatchedEpisodeRecord[]) => {
  const map = new Map<string, WatchedEpisodeRecord>()
  records.forEach((record) => map.set(record.episode_key, record))
  return map
}

const applyWatchedRecords = (items: EpisodeDetail[], watchedRecords: Map<string, WatchedEpisodeRecord>) =>
  items.map((episode) => {
    const record = watchedRecords.get(getEpisodeKey(episode))
    if (!record) return episode

    return {
      ...episode,
      watched: true,
      progress_percent: record.progress_percent,
    }
  })

const makeWatchedEpisodeRecord = (series: TrackedSeries, episode: EpisodeDetail): WatchedEpisodeRecord => ({
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
})

const updateSeriesCompletion = (
  series: TrackedSeries,
  watchedRecords: Map<string, WatchedEpisodeRecord>,
  episodeCache: Record<string, EpisodeDetail[]>,
): TrackedSeries => {
  const cachedEpisodes = episodeCache[String(series.tmdb_id)]
  const totalEpisodes = cachedEpisodes?.length || series.number_of_episodes || 0

  if (!totalEpisodes) return series

  const watchedCount = Array.from(watchedRecords.values()).filter((record) => record.series_tmdb_id === series.tmdb_id).length
  const completedPercent = Math.min(100, Math.round((watchedCount / totalEpisodes) * 100))

  if (series.completed_percent === completedPercent) return series

  return {
    ...series,
    completed_percent: completedPercent,
    last_synced_at: new Date().toISOString(),
  }
}

const normalizeTrackedSeries = (series: Partial<TrackedSeries> & { name?: string; original_name?: string }): TrackedSeries => ({
  id: Number(series.id ?? series.tmdb_id),
  tmdb_id: Number(series.tmdb_id ?? series.id),
  title: series.title ?? series.name ?? series.original_name ?? '',
  overview: series.overview,
  poster_path: series.poster_path,
  completed_percent: Number(series.completed_percent ?? 0),
  number_of_seasons: series.number_of_seasons,
  number_of_episodes: series.number_of_episodes,
  status: series.status,
  last_synced_at: series.last_synced_at ?? new Date().toISOString(),
})

function App() {
  const auth = useCloudAuth()
  const drive = useGoogleDriveBackup(auth.driveAccessToken)
  const [activeTab, setActiveTab] = useState<ActiveTab>('home')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [tracked, setTracked] = useState<TrackedSeries[]>([])
  const [selectedSeries, setSelectedSeries] = useState<TrackedSeries | null>(null)
  const [episodes, setEpisodes] = useState<EpisodeDetail[]>([])
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [newEpisodes, setNewEpisodes] = useState<CalendarNewEpisode[]>([])
  const [stats, setStats] = useState({
    overview: null as OverviewStats | null,
    genres: [] as GenreStat[],
    actors: [] as ActorStat[],
    years: [] as YearStat[],
    topSeries: [] as TopSeriesStat[],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle')
  const [cloudWatchedRecords, setCloudWatchedRecords] = useState<Map<string, WatchedEpisodeRecord>>(new Map())
  const [episodeCache, setEpisodeCache] = useState<Record<string, EpisodeDetail[]>>({})
  const [hasLoadedCloudData, setHasLoadedCloudData] = useState(false)
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set())
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('watching')

  useEffect(() => {
    fetchTracked()
  }, [])

  useEffect(() => {
    if (!auth.user) {
      setCloudWatchedRecords(new Map())
      setSyncStatus('idle')
      setHasLoadedCloudData(false)
      return
    }

    let cancelled = false

    const loadCloudData = async () => {
      try {
        setSyncStatus('syncing')
        await publishCloudProfile(auth.user.uid, auth.user)

        const [cloudTracked, cloudWatched, driveBackup] = await Promise.all([
          loadCloudTrackedSeries(auth.user.uid),
          loadCloudWatchedEpisodes(auth.user.uid),
          drive.loadBackup(),
        ])

        if (cancelled) return

        const backupTracked = driveBackup?.trackedSeries ?? []
        const backupWatched = driveBackup?.watchedEpisodes ?? []
        const nextWatchedRecords = watchedMapFromRecords([...cloudWatched, ...backupWatched])

        setTracked((current) => mergeTrackedSeries(current, [...backupTracked, ...cloudTracked]))
        setCloudWatchedRecords(nextWatchedRecords)
        setEpisodeCache((current) => ({ ...driveBackup?.episodeCache, ...current }))
        setHasLoadedCloudData(true)
        setSyncStatus('synced')
      } catch {
        if (!cancelled) {
          setSyncStatus('error')
          setHasLoadedCloudData(true)
        }
      }
    }

    loadCloudData()

    return () => {
      cancelled = true
    }
  }, [auth.user?.uid, auth.driveAccessToken])

  useEffect(() => {
    if (!auth.user || !drive.isConfigured || !hasLoadedCloudData) return

    const timer = window.setTimeout(async () => {
      const backup: SeriesVaultBackup = {
        version: 1,
        trackedSeries: tracked,
        watchedEpisodes: Array.from(cloudWatchedRecords.values()),
        episodeCache,
        exportedAt: new Date().toISOString(),
      }

      setSyncStatus('syncing')
      const saved = await drive.saveBackup(backup)
      setSyncStatus(saved ? 'synced' : 'error')
    }, 900)

    return () => window.clearTimeout(timer)
  }, [auth.user?.uid, drive.isConfigured, tracked, cloudWatchedRecords, episodeCache, hasLoadedCloudData])

  useEffect(() => {
    if (activeTab === 'home' || activeTab === 'calendar') {
      fetchCalendar()
    }
    if (activeTab === 'home' || activeTab === 'stats') {
      fetchStats()
    }
  }, [activeTab])

  useEffect(() => {
    if (selectedSeries) {
      setEpisodes([])
      setExpandedSeasons(new Set())
      fetchSeriesEpisodes(selectedSeries.id)
    }
  }, [selectedSeries?.id])

  useEffect(() => {
    setEpisodes((current) => applyWatchedRecords(current, cloudWatchedRecords))
  }, [cloudWatchedRecords])

  useEffect(() => {
    setTracked((current) => {
      let changed = false
      const next = current.map((series) => {
        const updatedSeries = updateSeriesCompletion(series, cloudWatchedRecords, episodeCache)
        changed ||= updatedSeries !== series
        return updatedSeries
      })

      return changed ? next : current
    })

    setSelectedSeries((current) => {
      if (!current) return current
      return updateSeriesCompletion(current, cloudWatchedRecords, episodeCache)
    })
  }, [cloudWatchedRecords, episodeCache])

  const seasonGroups = useMemo<SeasonEpisodeGroup[]>(() => {
    const groups = new Map<number, EpisodeDetail[]>()

    episodes.forEach((episode) => {
      const seasonEpisodes = groups.get(episode.season_number) ?? []
      seasonEpisodes.push(episode)
      groups.set(episode.season_number, seasonEpisodes)
    })

    return Array.from(groups.entries())
      .sort(([seasonA], [seasonB]) => seasonA - seasonB)
      .map(([seasonNumber, seasonEpisodes]) => {
        const sortedEpisodes = [...seasonEpisodes].sort((episodeA, episodeB) => episodeA.episode_number - episodeB.episode_number)

        return {
          seasonNumber,
          episodes: sortedEpisodes,
          watchedCount: sortedEpisodes.filter((episode) => episode.watched).length,
        }
      })
  }, [episodes])

  useEffect(() => {
    if (seasonGroups.length === 0) {
      setExpandedSeasons(new Set())
      return
    }

    setExpandedSeasons((currentExpandedSeasons) => {
      const availableSeasons = new Set(seasonGroups.map((group) => group.seasonNumber))
      const stillAvailable = [...currentExpandedSeasons].filter((seasonNumber) => availableSeasons.has(seasonNumber))

      if (stillAvailable.length > 0) {
        return new Set(stillAvailable)
      }

      const firstIncompleteSeason = seasonGroups.find((group) => group.watchedCount < group.episodes.length)
      return new Set([firstIncompleteSeason?.seasonNumber ?? seasonGroups[0].seasonNumber])
    })
  }, [seasonGroups])

  const fetchTracked = async () => {
    if (!hasApi) return

    try {
      setLoading(true)
      const response = await api.get<TrackedSeries[]>('/series/tracked')
      setTracked((current) => mergeTrackedSeries(response.data, current))
      setLoading(false)
    } catch (err) {
      setLoading(false)
      setError(getApiErrorMessage(err, 'Falha ao carregar séries'))
    }
  }

  const searchSeries = async () => {
    if (!query.trim()) return
    if (!hasApi) {
      setError('API TMDb não configurada neste ambiente. Configure VITE_API_BASE_URL na Vercel.')
      return
    }

    try {
      setLoading(true)
      const response = await api.get<SearchResult[]>('/series', { params: { query } })
      setResults(response.data)
      setLoading(false)
    } catch (err) {
      setLoading(false)
      setError(getApiErrorMessage(err, 'Erro na busca TMDb'))
    }
  }

  const addSeries = async (tmdb_id: number) => {
    if (!hasApi) {
      setError('API TMDb não configurada neste ambiente. Configure VITE_API_BASE_URL na Vercel.')
      return
    }

    try {
      setLoading(true)
      const response = await api.post<TrackedSeries>('/series', { tmdb_id })
      const addedSeries = normalizeTrackedSeries(response.data)
      setTracked((current) => mergeTrackedSeries(current, [addedSeries]))
      if (auth.user && addedSeries) {
        await saveCloudTrackedSeries(auth.user.uid, addedSeries)
      }

      setLoading(false)
      setError('')
    } catch (err) {
      setLoading(false)
      setError(getApiErrorMessage(err, 'Falha ao adicionar série'))
    }
  }

  const fetchSeriesEpisodes = async (seriesId: number) => {
    const series = tracked.find((item) => item.id === seriesId)
    const cachedEpisodes = series ? episodeCache[String(series.tmdb_id)] : undefined

    if (!hasApi) {
      if (cachedEpisodes) {
        setEpisodes(applyWatchedRecords(cachedEpisodes, cloudWatchedRecords))
      }
      return
    }

    try {
      const response = await api.get<EpisodeDetail[]>(`/series/${seriesId}/episodes`)
      const nextEpisodes = applyWatchedRecords(response.data, cloudWatchedRecords)
      setEpisodes(nextEpisodes)

      if (series) {
        setEpisodeCache((current) => ({
          ...current,
          [String(series.tmdb_id)]: nextEpisodes,
      }))
      }
    } catch (err) {
      if (cachedEpisodes) {
        setEpisodes(applyWatchedRecords(cachedEpisodes, cloudWatchedRecords))
        return
      }

      setError(getApiErrorMessage(err, 'Não foi possível carregar episódios'))
    }
  }

  const toggleEpisodeWatch = async (episode: EpisodeDetail) => {
    if (!selectedSeries) return

    const shouldMarkWatched = !episode.watched
    const nextWatchedRecords = new Map(cloudWatchedRecords)

    if (shouldMarkWatched) {
      nextWatchedRecords.set(getEpisodeKey(episode), makeWatchedEpisodeRecord(selectedSeries, episode))
    } else {
      nextWatchedRecords.delete(getEpisodeKey(episode))
    }

    const nextEpisodes = episodes.map((item) =>
      getEpisodeKey(item) === getEpisodeKey(episode)
        ? { ...item, watched: shouldMarkWatched, progress_percent: shouldMarkWatched ? 100 : 0 }
        : item,
    )
    const nextEpisodeCache = {
      ...episodeCache,
      [String(selectedSeries.tmdb_id)]: nextEpisodes,
    }
    const nextSelectedSeries = updateSeriesCompletion(selectedSeries, nextWatchedRecords, nextEpisodeCache)

    setEpisodes(nextEpisodes)
    setEpisodeCache(nextEpisodeCache)
    setCloudWatchedRecords(nextWatchedRecords)
    setSelectedSeries(nextSelectedSeries)
    setTracked((current) => current.map((series) => (series.tmdb_id === nextSelectedSeries.tmdb_id ? nextSelectedSeries : series)))

    try {
      if (!shouldMarkWatched) {
        if (hasApi) {
          await api.delete(`/watch/episodes/${episode.id}`).catch(() => null)
        }
        if (auth.user) {
          await deleteCloudWatchedEpisode(auth.user.uid, episode)
        }
      } else {
        if (hasApi) {
          await api.patch(`/watch/episodes/${episode.id}`, { watched: true, progress_percent: 100 }).catch(() => null)
        }
        if (auth.user && selectedSeries) {
          await saveCloudWatchedEpisode(auth.user.uid, selectedSeries, episode)
        }
      }
      if (auth.user) {
        await saveCloudTrackedSeries(auth.user.uid, nextSelectedSeries)
      }
    } catch (err) {
      setError('Erro ao atualizar episódio')
    }
  }

  const toggleSeason = (seasonNumber: number) => {
    setExpandedSeasons((currentExpandedSeasons) => {
      const nextExpandedSeasons = new Set(currentExpandedSeasons)

      if (nextExpandedSeasons.has(seasonNumber)) {
        nextExpandedSeasons.delete(seasonNumber)
      } else {
        nextExpandedSeasons.add(seasonNumber)
      }

      return nextExpandedSeasons
    })
  }

  const expandAllSeasons = () => {
    setExpandedSeasons(new Set(seasonGroups.map((group) => group.seasonNumber)))
  }

  const collapseAllSeasons = () => {
    setExpandedSeasons(new Set())
  }

  const fetchCalendar = async () => {
    if (!hasApi) {
      setCalendarEvents([])
      setNewEpisodes([])
      return
    }

    const today = new Date()
    const end = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
    const startDate = today.toISOString().slice(0, 10)
    const endDate = end.toISOString().slice(0, 10)

    try {
      const [calendarRes, newRes] = await Promise.all([
        api.get<CalendarEvent[]>('/calendar', { params: { start: startDate, end: endDate } }),
        api.get<CalendarNewEpisode[]>('/calendar/new-episodes', { params: { since: startDate } }),
      ])
      setCalendarEvents(calendarRes.data)
      setNewEpisodes(newRes.data)
    } catch (err) {
      setError('Falha ao carregar calendário')
    }
  }

  const fetchStats = async () => {
    if (!hasApi) {
      setStats({
        overview: null,
        genres: [],
        actors: [],
        years: [],
        topSeries: [],
      })
      return
    }

    try {
      const [overviewRes, genresRes, actorsRes, yearsRes, topSeriesRes] = await Promise.all([
        api.get<OverviewStats>('/stats/overview'),
        api.get<GenreStat[]>('/stats/genres'),
        api.get<ActorStat[]>('/stats/actors'),
        api.get<YearStat[]>('/stats/years'),
        api.get<TopSeriesStat[]>('/stats/top-series'),
      ])
      setStats({
        overview: overviewRes.data,
        genres: genresRes.data,
        actors: actorsRes.data,
        years: yearsRes.data,
        topSeries: topSeriesRes.data,
      })
    } catch (err) {
      setError('Falha ao carregar estatísticas')
    }
  }

  const selectedInfo = useMemo(() => {
    if (!selectedSeries) return 'Selecione uma série para ver os episódios.'
    return `${selectedSeries.title} • ${selectedSeries.number_of_seasons ?? 0} temporadas • ${selectedSeries.completed_percent}% assistido`
  }, [selectedSeries])

  const syncLabel = {
    idle: auth.isConfigured ? 'Cloud pronto' : 'Cloud não configurado',
    syncing: 'Sincronizando',
    synced: 'Sincronizado',
    error: 'Falha no sync',
  }[syncStatus]

  const watchedRecords = useMemo(() => Array.from(cloudWatchedRecords.values()), [cloudWatchedRecords])

  const totalRuntimeMinutes =
    stats.overview?.total_runtime_minutes ??
    watchedRecords.reduce((total, record) => total + (record.runtime_minutes ?? 0), 0)

  const activeWatchDays = new Set(watchedRecords.map((record) => record.watched_at.slice(0, 10))).size

  const continueWatching = useMemo(
    () =>
      tracked
        .filter((series) => series.completed_percent < 100)
        .sort((seriesA, seriesB) => seriesB.completed_percent - seriesA.completed_percent)
        .slice(0, 3),
    [tracked],
  )

  const getLatestEpisodeLabel = (series: TrackedSeries) => {
    const latest = watchedRecords
      .filter((record) => record.series_tmdb_id === series.tmdb_id)
      .sort((recordA, recordB) => new Date(recordB.watched_at).getTime() - new Date(recordA.watched_at).getTime())[0]

    if (!latest?.season_number || !latest?.episode_number) return 'Ainda não iniciado'
    return `S${latest.season_number} - E${latest.episode_number}`
  }

  const upcomingEpisode = calendarEvents[0] ?? newEpisodes[0]

  const dashboardMetrics: DashboardMetric[] = [
    {
      label: 'Séries',
      value: String(tracked.length),
      icon: 'play',
      tone: 'cyan',
    },
    {
      label: 'Episódios assistidos',
      value: String(stats.overview?.total_watched_episodes ?? watchedRecords.length),
      icon: 'tv',
      tone: 'purple',
    },
    {
      label: 'Horas assistidas',
      value: `${Math.round(totalRuntimeMinutes / 60)}h`,
      icon: 'clock',
      tone: 'amber',
    },
    {
      label: 'Dias ativos',
      value: String(activeWatchDays),
      icon: 'calendar',
      tone: 'green',
    },
  ]

  const libraryTabs: { id: LibraryFilter; label: string }[] = [
    { id: 'watching', label: 'Assistindo' },
    { id: 'inProgress', label: 'Em Andamento' },
    { id: 'waiting', label: 'Aguardando' },
    { id: 'finished', label: 'Finalizadas' },
  ]

  const librarySeries = useMemo(() => {
    if (libraryFilter === 'inProgress') {
      return tracked.filter((series) => series.completed_percent > 0 && series.completed_percent < 100)
    }

    if (libraryFilter === 'waiting') {
      return tracked.filter((series) => series.completed_percent === 0)
    }

    if (libraryFilter === 'finished') {
      return tracked.filter((series) => series.completed_percent >= 100)
    }

    return tracked
  }, [tracked, libraryFilter])

  const cycleLibraryFilter = () => {
    const currentIndex = libraryTabs.findIndex((tab) => tab.id === libraryFilter)
    const nextTab = libraryTabs[(currentIndex + 1) % libraryTabs.length]
    setLibraryFilter(nextTab.id)
  }

  const navItems: { id: ActiveTab; label: string; icon: string }[] = [
    { id: 'home', label: 'Início', icon: 'home' },
    { id: 'tracked', label: 'Biblioteca', icon: 'library' },
    { id: 'calendar', label: 'Calendário', icon: 'calendar' },
    { id: 'stats', label: 'Estatísticas', icon: 'stats' },
    { id: 'search', label: 'Mais', icon: 'more' },
  ]

  return (
    <div className="app-shell">
      <main className="app-main">
        {activeTab !== 'tracked' && (
          <header className="home-header">
            <div className="brand-mark" aria-label="Series Vault">
              <span>Series</span>
              <strong>Vault</strong>
            </div>
            <button type="button" className="icon-button" aria-label="Notificações">
              <span className="vault-icon vault-icon-bell" aria-hidden="true" />
            </button>
          </header>
        )}

        {activeTab === 'home' && auth.isConfigured && (
          <div className="cloud-auth">
            {auth.user?.picture && <img className="cloud-avatar" src={auth.user.picture} alt={auth.user.name || 'Usuário Google'} />}
            <span className={`cloud-status cloud-status-${syncStatus}`}>{syncLabel}</span>
            {auth.isSignedIn ? (
              <button type="button" className="cloud-button" onClick={auth.signOut}>
                Sair
              </button>
            ) : (
              <button type="button" className="cloud-button" onClick={auth.signIn} disabled={auth.isLoading}>
                Entrar
              </button>
            )}
          </div>
        )}

        {activeTab === 'home' && (
          <section className="home-view">
            <div className="greeting-block">
              <h1>Boa noite, {auth.user?.name?.split(' ')[0] ?? 'Leandro'}!</h1>
              <p>Pronto para mais uma maratona?</p>
            </div>

            <div className="metric-grid">
              {dashboardMetrics.map((metric) => (
                <div key={metric.label} className="metric-card">
                  <span className={`metric-icon metric-icon-${metric.tone}`}>
                    <span className={`vault-icon vault-icon-${metric.icon}`} aria-hidden="true" />
                  </span>
                  <strong>{metric.value}</strong>
                  <span>{metric.label}</span>
                </div>
              ))}
            </div>

            <section className="home-section">
              <div className="section-heading">
                <h2>Continue assistindo</h2>
                <button type="button" onClick={() => setActiveTab('tracked')}>
                  Ver tudo
                </button>
              </div>

              <div className="watch-list">
                {continueWatching.length === 0 ? (
                  <p className="empty-state">Adicione uma série para montar sua fila.</p>
                ) : (
                  continueWatching.map((series) => (
                    <button
                      key={series.id}
                      type="button"
                      className="watch-row"
                      onClick={() => {
                        setSelectedSeries(series)
                        setActiveTab('tracked')
                      }}
                    >
                      <MediaImage path={series.poster_path} alt={`Capa de ${series.title}`} className="watch-poster" fallback="Sem capa" size="w185" />
                      <span className="watch-copy">
                        <strong>{series.title}</strong>
                        <small>{getLatestEpisodeLabel(series)}</small>
                        <span className="progress-track">
                          <span className="progress-fill" style={{ width: `${series.completed_percent}%` }} />
                        </span>
                      </span>
                      <span className="watch-percent">{series.completed_percent}%</span>
                      <span className="play-button" aria-hidden="true">
                        <span className="vault-icon vault-icon-play" />
                      </span>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="home-section">
              <div className="section-heading">
                <h2>Próximos episódios</h2>
                <button type="button" onClick={() => setActiveTab('calendar')}>
                  Ver calendário
                </button>
              </div>

              {upcomingEpisode ? (
                <button type="button" className="upcoming-card" onClick={() => setActiveTab('calendar')}>
                  <MediaImage
                    path={upcomingEpisode.still_path ?? upcomingEpisode.series_poster_path}
                    alt={`Imagem de ${upcomingEpisode.title ?? upcomingEpisode.series_title ?? 'episódio'}`}
                    className="upcoming-poster"
                    fallback="Sem imagem"
                    size="w300"
                  />
                  <span>
                    <strong>{upcomingEpisode.series_title ?? 'Série acompanhada'}</strong>
                    <small>
                      S{upcomingEpisode.season_number ?? '-'} - E{upcomingEpisode.episode_number ?? '-'}
                    </small>
                    <small>{formatDate(upcomingEpisode.air_date)}</small>
                  </span>
                </button>
              ) : (
                <p className="empty-state">Nenhum episódio no calendário desta semana.</p>
              )}
            </section>
          </section>
        )}

        {activeTab === 'search' && (
          <section className="panel">
            <h2>Buscar série</h2>
            <div className="search-row">
              <input
                type="text"
                placeholder="Digitar nome da série"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchSeries()}
              />
              <button onClick={searchSeries}>Buscar</button>
            </div>
            <div className="search-results">
              {results.length === 0 ? (
                <p className="empty-state">Busque por uma série para começar.</p>
              ) : (
                results.map((item) => (
                  <div key={item.tmdb_id} className="card card-row media-card">
                    <MediaImage path={item.poster_path} alt={`Capa de ${item.name}`} className="poster-thumb" fallback="Sem capa" size="w185" />
                    <div className="card-copy">
                      <strong>{item.name}</strong>
                      <p>{formatDate(item.first_air_date)}</p>
                      <p className="item-description">{item.overview}</p>
                    </div>
                    <button onClick={() => addSeries(item.tmdb_id)}>Adicionar</button>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {activeTab === 'tracked' && (
          <section className="library-view">
            <div className="library-header">
              <h1>Biblioteca</h1>
              <div className="library-actions">
                <button type="button" className="icon-button" aria-label="Buscar séries" onClick={() => setActiveTab('search')}>
                  <span className="vault-icon vault-icon-search" aria-hidden="true" />
                </button>
                <button type="button" className="icon-button" aria-label="Alternar filtro" onClick={cycleLibraryFilter}>
                  <span className="vault-icon vault-icon-filter" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="library-tabs" role="tablist" aria-label="Filtros da biblioteca">
              {libraryTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={libraryFilter === tab.id}
                  className={libraryFilter === tab.id ? 'library-tab active' : 'library-tab'}
                  onClick={() => setLibraryFilter(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {librarySeries.length === 0 ? (
              <p className="empty-state">Nenhuma série encontrada neste filtro.</p>
            ) : (
              <div className="library-grid">
                {librarySeries.map((series) => (
                  <button
                    key={series.id}
                    type="button"
                    className={`library-card ${selectedSeries?.id === series.id ? 'selected' : ''}`}
                    onClick={() => setSelectedSeries(series)}
                  >
                    <MediaImage path={series.poster_path} alt={`Capa de ${series.title}`} className="library-poster" fallback="Sem capa" size="w342" />
                    <span className="library-card-copy">
                      <strong>{series.title}</strong>
                      <small>{getLatestEpisodeLabel(series)}</small>
                      <span className="progress-track">
                        <span className="progress-fill" style={{ width: `${series.completed_percent}%` }} />
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <section className="library-detail">
              <div className="section-heading">
                <h2>Detalhes da série</h2>
                {selectedSeries && <span className="chip">{selectedSeries.completed_percent}%</span>}
              </div>
              <div className="detail-card">
                {selectedSeries ? (
                  <div className="series-summary">
                    <MediaImage path={selectedSeries.poster_path} alt={`Capa de ${selectedSeries.title}`} className="series-poster" fallback="Sem capa" size="w342" />
                    <div>
                      <p>{selectedInfo}</p>
                      <p className="item-description">{selectedSeries.overview}</p>
                    </div>
                  </div>
                ) : (
                  <p className="empty-state">{selectedInfo}</p>
                )}
                {episodes.length === 0 ? (
                  <p className="empty-state">Selecione uma série para ver seus episódios.</p>
                ) : (
                  <div className="season-list">
                    <div className="season-actions">
                      <button type="button" onClick={expandAllSeasons}>Expandir tudo</button>
                      <button type="button" onClick={collapseAllSeasons}>Recolher tudo</button>
                    </div>

                    {seasonGroups.map((group) => {
                      const isExpanded = expandedSeasons.has(group.seasonNumber)
                      const seasonTitle = group.seasonNumber === 0 ? 'Especiais' : `Temporada ${group.seasonNumber}`

                      return (
                        <section key={group.seasonNumber} className="season-group">
                          <button
                            type="button"
                            className="season-toggle"
                            aria-expanded={isExpanded}
                            onClick={() => toggleSeason(group.seasonNumber)}
                          >
                            <span className="season-toggle-icon" aria-hidden="true">{isExpanded ? '-' : '+'}</span>
                            <span className="season-title">{seasonTitle}</span>
                            <span className="season-count">{group.watchedCount}/{group.episodes.length} assistidos</span>
                          </button>

                          {isExpanded && (
                            <div className="season-episodes">
                              {group.episodes.map((episode) => (
                                <div key={episode.id} className={`card episode-card ${episode.watched ? 'episode-card-watched' : ''}`}>
                                  <MediaImage path={episode.still_path} alt={`Imagem de ${episode.title ?? 'episódio'}`} className="episode-still" fallback="Sem imagem" size="w300" />
                                  <div className="episode-copy">
                                    <strong>E{episode.episode_number}: {episode.title ?? 'Sem título'}</strong>
                                    <p>{formatDate(episode.air_date)} · {episode.runtime ?? 0} min</p>
                                    <p className="item-description">{episode.overview}</p>
                                  </div>
                                  <button onClick={() => toggleEpisodeWatch(episode)}>
                                    {episode.watched ? 'Desmarcar' : 'Marcar como visto'}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </section>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>
          </section>
        )}

        {activeTab === 'calendar' && (
          <section className="panel grid-layout">
            <div className="panel-inner">
              <h2>Lançamentos próximos</h2>
              {calendarEvents.length === 0 ? (
                <p className="empty-state">Nenhum lançamento encontrado para os próximos 7 dias.</p>
              ) : (
                calendarEvents.map((item, index) => (
                  <div key={index} className="card card-row media-card compact-media-card">
                    <MediaImage path={item.still_path ?? item.series_poster_path} alt={`Imagem de ${item.title ?? item.series_title ?? 'episódio'}`} className="calendar-thumb" fallback="Sem imagem" size="w300" />
                    <div className="card-copy">
                      <strong>{item.series_title}</strong>
                      <p>S{item.season_number}E{item.episode_number} · {formatDate(item.air_date)}</p>
                      <p className="item-description">{item.title}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="panel-inner">
              <h2>Novos episódios</h2>
              {newEpisodes.length === 0 ? (
                <p className="empty-state">Nenhum episódio novo registrado desde o início do período.</p>
              ) : (
                newEpisodes.map((episode) => (
                  <div key={episode.episode_id} className="card card-row media-card compact-media-card">
                    <MediaImage path={episode.still_path ?? episode.series_poster_path} alt={`Imagem de ${episode.title ?? 'episódio'}`} className="calendar-thumb" fallback="Sem imagem" size="w300" />
                    <div className="card-copy">
                      <strong>S{episode.season_number}E{episode.episode_number}: {episode.title ?? 'Sem título'}</strong>
                      <p>{formatDate(episode.air_date)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {activeTab === 'stats' && (
          <section className="panel stats-grid">
            <div className="stat-card">
              <h3>Visão geral</h3>
              <p>{stats.overview ? `${stats.overview.total_watched_episodes} episódios assistidos` : '...'}</p>
              <p>{stats.overview ? `${stats.overview.total_runtime_minutes} minutos no total` : ''}</p>
            </div>

            <div className="stat-card">
              <h3>Gêneros</h3>
              <ol>
                {stats.genres.slice(0, 6).map((item) => (
                  <li key={item.genre}>{item.genre}: {item.count}</li>
                ))}
              </ol>
            </div>

            <div className="stat-card">
              <h3>Atores</h3>
              <ol className="image-list">
                {stats.actors.slice(0, 6).map((item) => (
                  <li key={item.actor}>
                    <MediaImage path={item.profile_path} alt={`Foto de ${item.actor}`} className="profile-thumb" fallback={item.actor.slice(0, 1)} size="w185" />
                    <span>{item.actor}: {item.count}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="stat-card">
              <h3>Anos</h3>
              <ol>
                {stats.years.slice(0, 6).map((item) => (
                  <li key={item.year}>{item.year}: {item.count}</li>
                ))}
              </ol>
            </div>

            <div className="stat-card wide-card">
              <h3>Séries mais assistidas</h3>
              <ol className="poster-list">
                {stats.topSeries.slice(0, 8).map((item) => (
                  <li key={item.series}>
                    <MediaImage path={item.poster_path} alt={`Capa de ${item.series}`} className="mini-poster" fallback="Sem capa" size="w185" />
                    <span>{item.series}: {item.count}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Navegacao principal">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={activeTab === item.id ? 'bottom-nav-item active' : 'bottom-nav-item'}
            onClick={() => {
              setActiveTab(item.id)
              setError('')
            }}
          >
            <span className={`vault-icon vault-icon-${item.icon}`} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <footer className="tmdb-attribution">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </footer>

      {error && <div className="toast">{error}</div>}
    </div>
  )
}

export default App
