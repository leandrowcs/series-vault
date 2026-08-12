import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  ChevronDown,
  Clock3,
  Crown,
  Gauge,
  Library,
  Medal,
  Podium,
  Star,
  Tags,
  Tv,
  Users,
  type LucideIcon,
} from "lucide-react";
import { MediaImage } from "../components/MediaImage";
import {
  ActorStat,
  EpisodeDetail,
  GenreStat,
  TopSeriesStat,
  TrackedSeries,
  WatchedEpisodeRecord,
} from "../types/series";
import { getDateKey, toDateKey } from "../utils/date";

type StatsPageProps = {
  actorStats: ActorStat[];
  episodeCache: Record<string, EpisodeDetail[]>;
  genreStats: GenreStat[];
  isStatsLoading: boolean;
  topSeriesStats: TopSeriesStat[];
  totalRuntimeMinutes: number;
  totalWatchedEpisodes: number;
  tracked: TrackedSeries[];
  watchedRecords: WatchedEpisodeRecord[];
};

type StatsSeriesStatus =
  | "watching"
  | "waiting"
  | "finished"
  | "abandoned"
  | "notStarted";

type StatusMetric = {
  id: StatsSeriesStatus;
  label: string;
  count: number;
  tone: "cyan" | "amber" | "green" | "danger" | "muted";
};

type StatsPanelProps = {
  children: ReactNode;
  collapsed: boolean;
  icon: LucideIcon;
  meta?: ReactNode;
  onToggle: () => void;
  title: string;
};

type ActorDisplayStat = ActorStat & {
  seriesCredits: {
    character?: string;
    seriesTitle: string;
  }[];
};

type TopSeriesDisplayStat = TopSeriesStat & {
  pending: number;
  runtime: number;
};

const endedSeriesStatuses = new Set([
  "canceled",
  "cancelled",
  "ended",
  "finalizada",
  "finalizado",
]);

const abandonedSeriesStatuses = new Set([
  "abandoned",
  "abandonada",
  "abandonado",
]);

const isSeriesEnded = (series: TrackedSeries) =>
  endedSeriesStatuses.has(String(series.status ?? "").trim().toLowerCase());

const isSeriesAbandoned = (series: TrackedSeries) => {
  const userStatus = String(
    series.user_status ?? series.library_status ?? series.personal_status ?? "",
  )
    .trim()
    .toLowerCase();

  return abandonedSeriesStatuses.has(userStatus);
};

const getStatsSeriesStatus = (series: TrackedSeries): StatsSeriesStatus => {
  if (isSeriesAbandoned(series)) return "abandoned";
  if (series.completed_percent > 0 && series.completed_percent < 100)
    return "watching";
  if (series.completed_percent >= 100 && isSeriesEnded(series))
    return "finished";
  if (series.completed_percent >= 100) return "waiting";
  return "notStarted";
};

const formatWatchDuration = (minutes: number) => {
  const totalHours = Math.round(minutes / 60);
  if (totalHours <= 0) return "0 h";

  const monthHours = 30 * 24;
  const months = Math.floor(totalHours / monthHours);
  const days = Math.floor((totalHours % monthHours) / 24);
  const hours = totalHours % 24;
  const parts: string[] = [];

  if (months) parts.push(`${months} ${months === 1 ? "mês" : "meses"}`);
  if (days) parts.push(`${days} ${days === 1 ? "dia" : "dias"}`);
  if (hours || parts.length === 0) parts.push(`${hours} h`);

  return parts.join(" ");
};

const getEpisodeKey = (episode: Pick<EpisodeDetail, "id" | "tmdb_episode_id">) =>
  episode.tmdb_episode_id ? `tmdb-${episode.tmdb_episode_id}` : `local-${episode.id}`;

const getMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const getLastMonths = (monthCount: number) => {
  const today = new Date();

  return Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(
      today.getFullYear(),
      today.getMonth() - (monthCount - 1 - index),
      1,
    );

    return {
      key: getMonthKey(date),
      label: date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
    };
  });
};

const getBarWidth = (value: number, maxValue: number) =>
  `${maxValue > 0 && value > 0 ? Math.max(5, Math.round((value / maxValue) * 100)) : 0}%`;

const previewLimit = 5;

const StatsPanel = ({
  children,
  collapsed,
  icon: Icon,
  meta,
  onToggle,
  title,
}: StatsPanelProps) => (
  <section className={`stats-panel ${collapsed ? "stats-panel-collapsed" : ""}`}>
    <button
      type="button"
      className="stats-section-heading"
      aria-expanded={!collapsed}
      onClick={onToggle}
    >
      <span className="stats-section-title">
        <Icon aria-hidden="true" />
        <h2>{title}</h2>
      </span>
      <span className="stats-section-meta">
        {meta}
        <ChevronDown aria-hidden="true" />
      </span>
    </button>
    {!collapsed && children}
  </section>
);

const StatsSeeMoreButton = ({
  expanded,
  onClick,
  previewCount = previewLimit,
  total,
}: {
  expanded: boolean;
  onClick: () => void;
  previewCount?: number;
  total: number;
}) => {
  if (total <= previewCount) return null;

  return (
    <button type="button" className="stats-see-more-button" onClick={onClick}>
      {expanded ? "Ver menos" : `Ver mais ${total - previewCount}`}
    </button>
  );
};

export const StatsPage = ({
  actorStats,
  episodeCache,
  genreStats,
  isStatsLoading,
  topSeriesStats,
  totalRuntimeMinutes,
  totalWatchedEpisodes,
  tracked,
  watchedRecords,
}: StatsPageProps) => {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [expandedLists, setExpandedLists] = useState<Record<string, boolean>>({});
  const [activeActorTooltip, setActiveActorTooltip] = useState<string | null>(null);
  const activeActorPopoverRef = useRef<HTMLDivElement | null>(null);
  const activeActorButtonRef = useRef<HTMLButtonElement | null>(null);
  const watchedKeys = new Set(watchedRecords.map((record) => record.episode_key));
  const watchedCountBySeries = new Map<number, number>();
  const runtimeBySeries = new Map<number, number>();

  useEffect(() => {
    if (!activeActorTooltip) return;

    const closeActorTooltipOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (
        activeActorPopoverRef.current?.contains(target) ||
        activeActorButtonRef.current?.contains(target)
      ) {
        return;
      }

      setActiveActorTooltip(null);
    };

    document.addEventListener(
      "pointerdown",
      closeActorTooltipOnOutsidePointerDown,
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        closeActorTooltipOnOutsidePointerDown,
      );
    };
  }, [activeActorTooltip]);

  const toggleSection = (sectionId: string) => {
    setCollapsedSections((currentSections) => ({
      ...currentSections,
      [sectionId]: !currentSections[sectionId],
    }));
  };

  const toggleList = (sectionId: string) => {
    setExpandedLists((currentLists) => ({
      ...currentLists,
      [sectionId]: !currentLists[sectionId],
    }));
  };

  const getVisibleItems = <T,>(sectionId: string, items: T[]) =>
    expandedLists[sectionId] ? items : items.slice(0, previewLimit);

  watchedRecords.forEach((record) => {
    watchedCountBySeries.set(
      record.series_tmdb_id,
      (watchedCountBySeries.get(record.series_tmdb_id) ?? 0) + 1,
    );
    runtimeBySeries.set(
      record.series_tmdb_id,
      (runtimeBySeries.get(record.series_tmdb_id) ?? 0) +
        (record.runtime_minutes ?? 0),
    );
  });

  const statusMetrics: StatusMetric[] = [
    { id: "watching", label: "Assistindo", count: 0, tone: "cyan" },
    { id: "waiting", label: "Aguardando", count: 0, tone: "amber" },
    { id: "finished", label: "Finalizadas", count: 0, tone: "green" },
    { id: "notStarted", label: "Não iniciadas", count: 0, tone: "muted" },
    { id: "abandoned", label: "Largadas", count: 0, tone: "danger" },
  ];

  tracked.forEach((series) => {
    const metric = statusMetrics.find(
      (item) => item.id === getStatsSeriesStatus(series),
    );
    if (metric) metric.count += 1;
  });

  const trackedTotal = Math.max(tracked.length, 1);
  const activeSeriesCount =
    statusMetrics.find((metric) => metric.id === "watching")?.count ?? 0;
  const averageProgress = tracked.length
    ? Math.round(
        tracked.reduce(
          (total, series) => total + Number(series.completed_percent ?? 0),
          0,
        ) / tracked.length,
      )
    : 0;

  const pendingReleasedEpisodes = tracked
    .filter((series) => {
      const status = getStatsSeriesStatus(series);
      return status === "watching" || status === "waiting" || status === "notStarted";
    })
    .flatMap((series) => episodeCache[String(series.tmdb_id)] ?? [])
    .filter((episode) => episode.season_number > 0)
    .filter((episode) => {
      const dateKey = getDateKey(episode.air_date);
      return Boolean(dateKey) && dateKey! <= toDateKey(new Date());
    })
    .filter((episode) => !watchedKeys.has(getEpisodeKey(episode))).length;

  const monthlyBuckets = getLastMonths(12).map((month) => ({
    ...month,
    count: watchedRecords.filter((record) => {
      const watchedAt = new Date(record.watched_at);
      return !Number.isNaN(watchedAt.getTime()) && getMonthKey(watchedAt) === month.key;
    }).length,
  }));
  const visibleMonthlyBuckets = expandedLists.rhythm
    ? monthlyBuckets
    : monthlyBuckets.slice(-6);
  const maxMonthlyCount = Math.max(...visibleMonthlyBuckets.map((month) => month.count), 1);

  const localGenreStats = Array.from(
    tracked.reduce((genreMap, series) => {
      const watchedCount = watchedCountBySeries.get(series.tmdb_id) ?? 0;
      const knownEpisodes = (episodeCache[String(series.tmdb_id)] ?? []).filter(
        (episode) => episode.season_number > 0,
      ).length;
      const totalCount = Math.max(
        knownEpisodes,
        Number(series.number_of_episodes ?? 0),
        watchedCount,
      );
      if (watchedCount <= 0 && totalCount <= 0) return genreMap;

      series.genres?.forEach((genre) => {
        const currentGenre = genreMap.get(genre) ?? {
          genre,
          watched: 0,
          total: 0,
        };

        genreMap.set(genre, {
          genre,
          watched: currentGenre.watched + watchedCount,
          total: currentGenre.total + totalCount,
        });
      });

      return genreMap;
    }, new Map<string, { genre: string; watched: number; total: number }>()),
  )
    .map(([, genre]) => ({
      ...genre,
      percent: genre.total > 0 ? Math.round((genre.watched / genre.total) * 100) : 0,
    }))
    .sort((firstGenre, secondGenre) => secondGenre.watched - firstGenre.watched);
  const displayedGenres =
    localGenreStats.length
      ? localGenreStats
      : genreStats.map((genre) => ({
          genre: genre.genre,
          watched: genre.count,
          total: genre.count,
          percent: genre.count > 0 ? 100 : 0,
        }));
  const visibleGenres = getVisibleItems("genres", displayedGenres);

  const localTopSeries: TopSeriesDisplayStat[] = tracked
    .map((series) => ({
      series: series.title,
      poster_path: series.poster_path,
      count: watchedCountBySeries.get(series.tmdb_id) ?? 0,
      pending: Math.max(
        0,
        Math.max(
          (episodeCache[String(series.tmdb_id)] ?? []).filter(
            (episode) => episode.season_number > 0,
          ).length,
          Number(series.number_of_episodes ?? 0),
        ) - (watchedCountBySeries.get(series.tmdb_id) ?? 0),
      ),
      runtime: runtimeBySeries.get(series.tmdb_id) ?? 0,
    }))
    .filter((series) => series.count > 0)
    .sort((firstSeries, secondSeries) => secondSeries.count - firstSeries.count);
  const displayedTopSeries = localTopSeries.length
    ? localTopSeries
    : topSeriesStats.map((series) => ({ ...series, pending: 0, runtime: 0 }));
  const visibleTopSeries = getVisibleItems("ranking", displayedTopSeries);

  const localActorStats = Array.from(
    tracked.reduce((actorMap, series) => {
      series.actors?.forEach((actor) => {
        const currentActor = actorMap.get(actor.name) ?? {
          actor: actor.name,
          profile_path: actor.profile_path,
          count: 0,
          seriesCredits: [],
        };
        const seriesCredits = [
          ...currentActor.seriesCredits,
          {
            character: actor.character,
            seriesTitle: series.title,
          },
        ]
          .filter(
            (credit, index, credits) =>
              credits.findIndex(
                (item) =>
                  item.seriesTitle === credit.seriesTitle &&
                  item.character === credit.character,
              ) === index,
          )
          .sort((firstCredit, secondCredit) =>
            firstCredit.seriesTitle.localeCompare(secondCredit.seriesTitle),
          );

        actorMap.set(actor.name, {
          ...currentActor,
          profile_path: currentActor.profile_path ?? actor.profile_path,
          count: new Set(seriesCredits.map((credit) => credit.seriesTitle)).size,
          seriesCredits,
        });
      });

      return actorMap;
    }, new Map<string, ActorDisplayStat>()),
  )
    .map(([, actor]) => actor)
    .sort((firstActor, secondActor) => secondActor.count - firstActor.count);
  const displayedActors = localActorStats.length
    ? localActorStats
    : actorStats.map((actor) => ({ ...actor, seriesCredits: [] }));
  const visibleActors = getVisibleItems("actors", displayedActors);

  return (
    <section className="stats-view page-view">
      <div className="page-topbar page-sticky">
        <div className="page-header">
          <div className="page-title-block">
            <div className="brand-mark brand-mark-small" aria-label="Series Vault">
              <span className="series">Series</span>
              <strong className="vault">Vault</strong>
            </div>
            <h1>Estatísticas</h1>
          </div>
        </div>
      </div>

      <div className="page-scroll-content stats-page-content">
        <section className="stats-summary-grid" aria-busy={isStatsLoading}>
          <div className="stats-summary-card">
            <span className="metric-icon metric-icon-purple">
              <Tv aria-hidden="true" />
            </span>
            <strong>{totalWatchedEpisodes}</strong>
            <span>Episódios vistos</span>
          </div>
          <div className="stats-summary-card">
            <span className="metric-icon metric-icon-amber">
              <Clock3 aria-hidden="true" />
            </span>
            <strong>{formatWatchDuration(totalRuntimeMinutes)}</strong>
            <span>Tempo assistindo</span>
          </div>
          <div className="stats-summary-card">
            <span className="metric-icon metric-icon-cyan">
              <Star aria-hidden="true" />
            </span>
            <strong>{activeSeriesCount}</strong>
            <span>Em andamento</span>
          </div>
          <div className="stats-summary-card">
            <span className="metric-icon metric-icon-green">
              <CalendarDays aria-hidden="true" />
            </span>
            <strong>{pendingReleasedEpisodes}</strong>
            <span>Pendentes lançados</span>
          </div>
        </section>

        <StatsPanel
          collapsed={Boolean(collapsedSections.library)}
          icon={Library}
          meta={`${averageProgress}% completa`}
          onToggle={() => toggleSection("library")}
          title="Biblioteca"
        >
          <div className="stats-status-meter" aria-label="Distribuição da biblioteca">
            {statusMetrics.map((metric) => (
              <span
                key={metric.id}
                className={`stats-status-segment stats-tone-${metric.tone}`}
                style={{ width: `${(metric.count / trackedTotal) * 100}%` }}
              />
            ))}
          </div>
          <div className="stats-status-list">
            {statusMetrics.map((metric) => (
              <div key={metric.id}>
                <span className={`stats-dot stats-tone-${metric.tone}`} />
                <span>{metric.label}</span>
                <strong>{metric.count}</strong>
              </div>
            ))}
          </div>
        </StatsPanel>

        <StatsPanel
          collapsed={Boolean(collapsedSections.rhythm)}
          icon={Gauge}
          meta={expandedLists.rhythm ? "Últimos 12 meses" : "Últimos 6 meses"}
          onToggle={() => toggleSection("rhythm")}
          title="Ritmo"
        >
          <div
            className={`stats-month-chart ${
              expandedLists.rhythm ? "stats-month-chart-expanded" : ""
            }`}
          >
            {visibleMonthlyBuckets.map((month) => (
              <div key={month.key} className="stats-month-bar-wrap">
                <span
                  className="stats-month-bar"
                  style={{ height: `${(month.count / maxMonthlyCount) * 100}%` }}
                  title={`${month.count} episódios`}
                />
                <strong>{month.count}</strong>
                <small>{month.label}</small>
              </div>
            ))}
          </div>
          <StatsSeeMoreButton
            expanded={Boolean(expandedLists.rhythm)}
            onClick={() => toggleList("rhythm")}
            previewCount={6}
            total={monthlyBuckets.length}
          />
        </StatsPanel>

        <StatsPanel
          collapsed={Boolean(collapsedSections.genres)}
          icon={Tags}
          meta="Vistos / total"
          onToggle={() => toggleSection("genres")}
          title="Gêneros"
        >
          {displayedGenres.length === 0 ? (
            <p className="empty-state">Gêneros aparecem depois de assistir episódios.</p>
          ) : (
            <div className="stats-bar-list">
              {visibleGenres.map((genre) => (
                <div key={genre.genre} className="stats-bar-row">
                  <span>{genre.genre}</span>
                  <strong>
                    {genre.watched} de {genre.total}
                  </strong>
                  <span className="stats-bar-track">
                    <span
                      className="stats-bar-fill"
                      style={{ width: getBarWidth(genre.percent, 100) }}
                    />
                  </span>
                  <small>{genre.percent}% vistos</small>
                </div>
              ))}
            </div>
          )}
          <StatsSeeMoreButton
            expanded={Boolean(expandedLists.genres)}
            onClick={() => toggleList("genres")}
            total={displayedGenres.length}
          />
        </StatsPanel>

        <StatsPanel
          collapsed={Boolean(collapsedSections.ranking)}
          icon={Podium}
          meta={`${displayedTopSeries.length} séries`}
          onToggle={() => toggleSection("ranking")}
          title="Ranking"
        >
          {displayedTopSeries.length === 0 ? (
            <p className="empty-state">Marque episódios como vistos para criar o ranking.</p>
          ) : (
            <div className="stats-ranked-list">
              {visibleTopSeries.map((series, index) => {
                const rankTone =
                  index === 0
                    ? "gold"
                    : index === 1
                      ? "silver"
                      : index === 2
                        ? "bronze"
                        : "default";

                return (
                  <div
                    key={series.series}
                    className={`stats-ranked-item stats-ranked-item-${rankTone}`}
                  >
                    {index === 0 && (
                      <span className="stats-rank-badge stats-rank-badge-gold">
                        <Crown aria-hidden="true" />
                      </span>
                    )}
                    {(index === 1 || index === 2) && (
                      <span className={`stats-rank-badge stats-rank-badge-${rankTone}`}>
                        <Medal aria-hidden="true" />
                      </span>
                    )}
                    <span className="stats-rank-position">{index + 1}</span>
                    <MediaImage
                      path={series.poster_path}
                      alt={`Capa de ${series.series}`}
                      className="mini-poster"
                      fallback="Sem capa"
                      size="w185"
                    />
                    <span>
                      <strong>{series.series}</strong>
                      <small>
                        {series.count} episódios
                        {series.runtime ? ` · ${formatWatchDuration(series.runtime)}` : ""}
                      </small>
                      <small>
                        {series.pending}{" "}
                        {series.pending === 1
                          ? "episódio pendente"
                          : "episódios pendentes"}
                      </small>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <StatsSeeMoreButton
            expanded={Boolean(expandedLists.ranking)}
            onClick={() => toggleList("ranking")}
            total={displayedTopSeries.length}
          />
        </StatsPanel>

        <StatsPanel
          collapsed={Boolean(collapsedSections.actors)}
          icon={Users}
          meta={`${displayedActors.length} nomes`}
          onToggle={() => toggleSection("actors")}
          title="Atores"
        >
          {displayedActors.length === 0 ? (
            <p className="empty-state">Elenco aparece quando houver séries com créditos.</p>
          ) : (
            <div className="stats-actor-grid">
              {visibleActors.map((actor) => {
                const tooltipId = `actor-series-${actor.actor.replace(/\W+/g, "-")}`;
                const isTooltipOpen = activeActorTooltip === actor.actor;

                return (
                  <div key={actor.actor} className="stats-actor-item">
                    <MediaImage
                      path={actor.profile_path}
                      alt={`Foto de ${actor.actor}`}
                      className="actor-avatar"
                      fallback={actor.actor.slice(0, 1)}
                      size="w185"
                    />
                    <span>
                      <strong>{actor.actor}</strong>
                      <button
                        type="button"
                        className="stats-actor-series-button"
                        ref={isTooltipOpen ? activeActorButtonRef : undefined}
                        aria-expanded={isTooltipOpen}
                        aria-controls={tooltipId}
                        disabled={actor.seriesCredits.length === 0}
                        onClick={() =>
                          setActiveActorTooltip((currentActor) =>
                            currentActor === actor.actor ? null : actor.actor,
                          )
                        }
                      >
                        {actor.count} {actor.count === 1 ? "série" : "séries"}
                      </button>
                    </span>
                    {isTooltipOpen && actor.seriesCredits.length > 0 && (
                      <div
                        id={tooltipId}
                        className="stats-actor-series-popover"
                        ref={activeActorPopoverRef}
                      >
                        <strong>Séries</strong>
                        <ul>
                          {actor.seriesCredits.map((credit) => (
                            <li
                              key={`${credit.seriesTitle}-${credit.character ?? ""}`}
                            >
                              <span>{credit.seriesTitle}</span>
                              <small>
                                {credit.character?.trim() || "Personagem não informado"}
                              </small>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <StatsSeeMoreButton
            expanded={Boolean(expandedLists.actors)}
            onClick={() => toggleList("actors")}
            total={displayedActors.length}
          />
        </StatsPanel>
      </div>
    </section>
  );
};
