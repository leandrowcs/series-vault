import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import './App.css'

type SearchResult = {
  tmdb_id: number
  name: string
  first_air_date?: string
  overview?: string
  poster_path?: string
}

type TrackedSeries = {
  id: number
  tmdb_id: number
  title: string
  overview?: string
  poster_path?: string
  completed_percent: number
  number_of_seasons?: number
  number_of_episodes?: number
  status?: string
  last_synced_at?: string
}

type EpisodeDetail = {
  id: number
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

type SeasonEpisodeGroup = {
  seasonNumber: number
  episodes: EpisodeDetail[]
  watchedCount: number
}

type CalendarEvent = {
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

type CalendarNewEpisode = {
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

type OverviewStats = {
  total_watched_episodes: number
  total_runtime_minutes: number
}

type GenreStat = {
  genre: string
  count: number
}

type ActorStat = {
  actor: string
  profile_path?: string
  count: number
}

type YearStat = {
  year: string
  count: number
}

type TopSeriesStat = {
  series: string
  poster_path?: string
  count: number
}

const api = axios.create({
  baseURL: '/api',
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

function App() {
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
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set())

  useEffect(() => {
    fetchTracked()
  }, [])

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
    try {
      setLoading(true)
      const response = await api.get<TrackedSeries[]>('/series/tracked')
      setTracked(response.data)
      setLoading(false)
    } catch (err) {
      setLoading(false)
      setError('Falha ao carregar séries')
    }
  }

  const searchSeries = async () => {
    if (!query.trim()) return
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
    try {
      setLoading(true)
      await api.post('/series', { tmdb_id })
      await fetchTracked()
      setLoading(false)
      setError('')
    } catch (err) {
      setLoading(false)
      setError(getApiErrorMessage(err, 'Falha ao adicionar série'))
    }
  }

  const fetchSeriesEpisodes = async (seriesId: number) => {
    try {
      const response = await api.get<EpisodeDetail[]>(`/series/${seriesId}/episodes`)
      setEpisodes(response.data)
    } catch (err) {
      setError('Não foi possível carregar episódios')
    }
  }

  const toggleEpisodeWatch = async (episode: EpisodeDetail) => {
    try {
      if (episode.watched) {
        await api.delete(`/watch/episodes/${episode.id}`)
      } else {
        await api.patch(`/watch/episodes/${episode.id}`, { watched: true, progress_percent: 100 })
      }
      if (selectedSeries) {
        await fetchSeriesEpisodes(selectedSeries.id)
        await fetchTracked()
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Series Vault</h1>
          <p>Registre séries, acompanhe episódios e veja suas estatísticas pessoais.</p>
        </div>
        <div className="header-actions">
          <span className="status-chip">{loading ? 'Carregando...' : 'Pronto'}</span>
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
