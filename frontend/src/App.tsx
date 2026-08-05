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
  const [activeTab, setActiveTab] = useState<'search' | 'tracked' | 'calendar' | 'stats'>('search')
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
    if (activeTab === 'calendar') {
      fetchCalendar()
    }
    if (activeTab === 'stats') {
      fetchStats()
    }
  }, [activeTab])

  useEffect(() => {
    if (selectedSeries) {
      setEpisodes([])
      setExpandedSeasons(new Set())
      fetchSeriesEpisodes(selectedSeries.id)
    }
  }, [selectedSeries])

  useEffect(() => {
    setEpisodes((current) => applyWatchedRecords(current, cloudWatchedRecords))
  }, [cloudWatchedRecords])

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
    try {
      if (episode.watched) {
        if (hasApi) {
          await api.delete(`/watch/episodes/${episode.id}`).catch(() => null)
        }
        if (auth.user) {
          await deleteCloudWatchedEpisode(auth.user.uid, episode)
          setCloudWatchedRecords((current) => {
            const next = new Map(current)
            next.delete(getEpisodeKey(episode))
            return next
          })
        }
      } else {
        if (hasApi) {
          await api.patch(`/watch/episodes/${episode.id}`, { watched: true, progress_percent: 100 }).catch(() => null)
        }
        if (auth.user && selectedSeries) {
          await saveCloudWatchedEpisode(auth.user.uid, selectedSeries, episode)
          setCloudWatchedRecords((current) => {
            const next = new Map(current)
            next.set(getEpisodeKey(episode), {
              episode_key: getEpisodeKey(episode),
              episode_id: episode.id,
              tmdb_episode_id: episode.tmdb_episode_id,
              series_tmdb_id: selectedSeries.tmdb_id,
              watched_at: new Date().toISOString(),
              progress_percent: 100,
              runtime_minutes: episode.runtime,
              title: episode.title,
              season_number: episode.season_number,
              episode_number: episode.episode_number,
            })
            return next
          })
        }
      }
      if (selectedSeries) {
        await fetchSeriesEpisodes(selectedSeries.id)
        if (hasApi) {
          await fetchTracked()
        }
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Series Vault</h1>
          <p>Registre séries, acompanhe episódios e veja suas estatísticas pessoais.</p>
        </div>
        <div className="header-actions">
          <span className="status-chip">{loading ? 'Carregando...' : 'Pronto'}</span>
          {auth.isConfigured && (
            <div className="cloud-auth">
              {auth.user?.picture && <img className="cloud-avatar" src={auth.user.picture} alt={auth.user.name || 'Usuário Google'} />}
              <span className={`cloud-status cloud-status-${syncStatus}`}>{syncLabel}</span>
              {auth.isSignedIn ? (
                <button type="button" className="cloud-button" onClick={auth.signOut}>
                  Sair
                </button>
              ) : (
                <button type="button" className="cloud-button" onClick={auth.signIn} disabled={auth.isLoading}>
                  Entrar com Google
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <nav className="app-tabs">
        {['search', 'tracked', 'calendar', 'stats'].map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? 'tab active' : 'tab'}
            onClick={() => {
              setActiveTab(tab as typeof activeTab)
              setError('')
            }}
          >
            {tab === 'search' && 'Buscar'}
            {tab === 'tracked' && 'Acompanhadas'}
            {tab === 'calendar' && 'Calendário'}
            {tab === 'stats' && 'Estatísticas'}
          </button>
        ))}
      </nav>

      <main className="app-main">
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
          <section className="panel grid-layout">
            <div className="panel-inner">
              <h2>Séries acompanhadas</h2>
              {tracked.length === 0 ? (
                <p className="empty-state">Nenhuma série acompanhada ainda.</p>
              ) : (
                tracked.map((series) => (
                  <div
                    key={series.id}
                    className={`card card-selectable media-card ${selectedSeries?.id === series.id ? 'selected' : ''}`}
                    onClick={() => setSelectedSeries(series)}
                  >
                    <MediaImage path={series.poster_path} alt={`Capa de ${series.title}`} className="poster-thumb" fallback="Sem capa" size="w185" />
                    <div className="card-copy">
                      <strong>{series.title}</strong>
                      <p>{series.status ?? 'Status desconhecido'}</p>
                      <p>{series.completed_percent}% completado</p>
                      <p>{series.number_of_seasons ?? 0} temporadas · {series.number_of_episodes ?? 0} episódios</p>
                    </div>
                    <span className="chip">{series.completed_percent}%</span>
                  </div>
                ))
              )}
            </div>

            <div className="panel-inner">
              <h2>Detalhes da série</h2>
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
                  <p>{selectedInfo}</p>
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
            </div>
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

      <footer className="tmdb-attribution">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </footer>

      {error && <div className="toast">{error}</div>}
    </div>
  )
}

export default App
