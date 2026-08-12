import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type WheelEvent,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Bell,
  BellRing,
  Download,
  Info,
  Play,
  Star,
} from "lucide-react";
import { MediaImage } from "../components/MediaImage";
import type { DashboardMetric } from "../types/ui";
import type { PushNotificationStatus } from "../hooks/usePushNotifications";
import type {
  TrackedSeries,
  TrendingSeries,
  UpcomingEpisodeItem,
} from "../types/series";
import { formatDate, getDateKey, toDateKey } from "../utils/date";

type HomePageProps = {
  continueScrollRef: RefObject<HTMLDivElement>;
  continueWatching: TrackedSeries[];
  dashboardMetrics: DashboardMetric[];
  firstName: string;
  installPromptAvailable: boolean;
  isAppInstalled: boolean;
  isContinueWatchingLoading: boolean;
  isDashboardLoading: boolean;
  isTrendingSeriesLoading: boolean;
  isUpcomingEpisodeLoading: boolean;
  loading: boolean;
  notificationStatus: PushNotificationStatus;
  suggestedTrendingSeries: TrendingSeries[];
  syncLabel: string;
  syncStatus: "idle" | "syncing" | "synced" | "error";
  trendingScrollRef: RefObject<HTMLDivElement>;
  upcomingEpisodes: UpcomingEpisodeItem[];
  userPicture?: string;
  authIsConfigured: boolean;
  authIsLoading: boolean;
  authIsSignedIn: boolean;
  onContinueWatchingWheel: (event: WheelEvent<HTMLDivElement>) => void;
  onGoToCalendar: () => void;
  onGoToLibrary: () => void;
  onInstallApp: () => void;
  onEnableNotifications: () => void;
  onOpenContinueWatchingSeries: (series: TrackedSeries) => void;
  onOpenEpisodeModal: (episode: UpcomingEpisodeItem) => void;
  onOpenTrendingSeriesDetails: (series: TrendingSeries) => void;
  onScrollContinueWatching: (direction: "left" | "right") => void;
  onScrollTrendingSeries: (direction: "left" | "right") => void;
  onSignIn: () => void;
  onSignOut: () => void;
  getGreeting: () => string;
  getLatestEpisodeLabel: (series: TrackedSeries) => string;
};

export const HomePage = ({
  continueScrollRef,
  continueWatching,
  dashboardMetrics,
  firstName,
  installPromptAvailable,
  isAppInstalled,
  isContinueWatchingLoading,
  isDashboardLoading,
  isTrendingSeriesLoading,
  isUpcomingEpisodeLoading,
  loading,
  notificationStatus,
  suggestedTrendingSeries,
  syncLabel,
  syncStatus,
  trendingScrollRef,
  upcomingEpisodes,
  userPicture,
  authIsConfigured,
  authIsLoading,
  authIsSignedIn,
  onContinueWatchingWheel,
  onGoToCalendar,
  onGoToLibrary,
  onInstallApp,
  onEnableNotifications,
  onOpenContinueWatchingSeries,
  onOpenEpisodeModal,
  onOpenTrendingSeriesDetails,
  onScrollContinueWatching,
  onScrollTrendingSeries,
  onSignIn,
  onSignOut,
  getGreeting,
  getLatestEpisodeLabel,
}: HomePageProps) => {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationButtonRef = useRef<HTMLButtonElement | null>(null);
  const notificationPopoverRef = useRef<HTMLDivElement | null>(null);
  const todayDateKey = toDateKey(new Date());
  const todaysEpisodes = useMemo(
    () =>
      upcomingEpisodes.filter(
        (episode) => getDateKey(episode.air_date) === todayDateKey,
      ),
    [todayDateKey, upcomingEpisodes],
  );
  const notificationCount = todaysEpisodes.length;
  const canShowNotificationsButton =
    notificationStatus !== "unsupported" && notificationStatus !== "unconfigured";
  const isNotificationButtonDisabled =
    notificationStatus === "loading" || notificationStatus === "denied";

  useEffect(() => {
    if (!isNotificationsOpen) return;

    const closeNotificationsOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (
        notificationPopoverRef.current?.contains(target) ||
        notificationButtonRef.current?.contains(target)
      ) {
        return;
      }

      setIsNotificationsOpen(false);
    };

    document.addEventListener("pointerdown", closeNotificationsOnOutsidePointerDown);

    return () => {
      document.removeEventListener(
        "pointerdown",
        closeNotificationsOnOutsidePointerDown,
      );
    };
  }, [isNotificationsOpen]);

  const toggleNotifications = () => {
    setIsNotificationsOpen((isOpen) => !isOpen);

    if (
      notificationStatus !== "subscribed" &&
      notificationStatus !== "loading" &&
      notificationStatus !== "denied"
    ) {
      void onEnableNotifications();
    }
  };

  return (
    <>
    <header className="home-header">
      <div className="brand-mark" aria-label="Series Vault">
        <span className="series">Series</span>
        <strong className="vault">Vault</strong>
      </div>
      {authIsConfigured && (
        <div className="cloud-auth">
          {userPicture && (
            <img
              className="cloud-avatar"
              src={userPicture}
              alt={firstName || "Usuário Google"}
            />
          )}
          <span className={`cloud-status cloud-status-${syncStatus}`}>
            {syncLabel}
          </span>
          {authIsSignedIn ? (
            <button type="button" className="cloud-button" onClick={onSignOut}>
              Sair
            </button>
          ) : (
            <button
              type="button"
              className="cloud-button"
              onClick={onSignIn}
              disabled={authIsLoading}
            >
              Entrar
            </button>
          )}
        </div>
      )}
    </header>

    <section className="home-view">
      <div className="greeting-block">
        <span className="greeting-copy">
          <h1>
            {getGreeting()}, {firstName}!
          </h1>
          <p>Pronto para mais uma maratona?</p>
        </span>
        {installPromptAvailable && !isAppInstalled && (
          <span className="greeting-actions">
            <button
              type="button"
              className="icon-button install-button"
              aria-label="Instalar app"
              onClick={onInstallApp}
            >
              <Download aria-hidden="true" />
            </button>
          </span>
        )}
        {canShowNotificationsButton && (
            <span className="greeting-actions notification-actions">
              <button
                type="button"
                ref={notificationButtonRef}
                className="notification-button"
                aria-label={
                  notificationStatus === "subscribed"
                    ? "Abrir notificações"
                    : "Ativar notificações de episódios"
                }
                aria-expanded={isNotificationsOpen}
                disabled={isNotificationButtonDisabled}
                title={
                  notificationStatus === "denied"
                    ? "Permissão de notificação bloqueada no navegador"
                    : notificationStatus === "subscribed"
                      ? "Ver notificações de hoje"
                      : "Ativar avisos de episódios disponíveis hoje"
                }
                onClick={toggleNotifications}
              >
                {notificationStatus === "subscribed" ? (
                  <BellRing aria-hidden="true" />
                ) : (
                  <Bell aria-hidden="true" />
                )}
                <span>Notificações</span>
                {notificationCount > 0 && (
                  <strong className="notification-count">{notificationCount}</strong>
                )}
              </button>
              {isNotificationsOpen && (
                <div
                  className="home-notification-popover"
                  ref={notificationPopoverRef}
                >
                  <strong>Hoje</strong>
                  {todaysEpisodes.length > 0 ? (
                    <ul>
                      {todaysEpisodes.map((episode) => (
                        <li
                          key={[
                            episode.episode_id,
                            episode.series_id,
                            episode.season_number,
                            episode.episode_number,
                          ].join("-")}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setIsNotificationsOpen(false);
                              onOpenEpisodeModal(episode);
                            }}
                          >
                            <span>{episode.series_title ?? "Série acompanhada"}</span>
                            <small>
                              S{episode.season_number ?? "-"}E
                              {episode.episode_number ?? "-"}
                              {episode.title ? ` · ${episode.title}` : ""}
                            </small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Nenhuma notificação para hoje.</p>
                  )}
                </div>
              )}
            </span>
          )}
      </div>

      <div
        className="metric-grid"
        aria-busy={isDashboardLoading ? "true" : "false"}
      >
        {isDashboardLoading
          ? (["compact", "compact", "wide", "wide"] as const).map(
              (layout, index) => (
                <div
                  key={`metric-skeleton-${index}`}
                  className={`metric-card metric-card-${layout} metric-card-skeleton`}
                  aria-hidden="true"
                >
                  <span className="metric-icon skeleton" />
                  <span className="skeleton skeleton-text skeleton-value" />
                  <span className="skeleton skeleton-text skeleton-label" />
                </div>
              ),
            )
          : dashboardMetrics.map((metric) => {
              const MetricIcon = metric.icon;

              return (
                <div
                  key={metric.label}
                  className={`metric-card metric-card-${metric.layout}`}
                >
                  <span className={`metric-icon metric-icon-${metric.tone}`}>
                    <MetricIcon aria-hidden="true" />
                  </span>
                  <strong>{metric.value}</strong>
                  <span>{metric.label}</span>
                </div>
              );
            })}
      </div>

      <section className="home-section">
        <div className="section-heading">
          <h2>Séries bombando</h2>
          <span className="section-actions">
            {suggestedTrendingSeries.length > 2 && (
              <span className="carousel-controls">
                <button
                  type="button"
                  className="icon-button carousel-button"
                  aria-label="Rolar séries bombando para a esquerda"
                  onClick={() => onScrollTrendingSeries("left")}
                >
                  <ChevronLeft aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-button carousel-button"
                  aria-label="Rolar séries bombando para a direita"
                  onClick={() => onScrollTrendingSeries("right")}
                >
                  <ChevronRight aria-hidden="true" />
                </button>
              </span>
            )}
          </span>
        </div>

        {isTrendingSeriesLoading ? (
          <div
            className="continue-watching-scroll"
            aria-label="Carregando séries bombando"
          >
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`trending-skeleton-${index}`}
                className="continue-card continue-card-skeleton"
                aria-hidden="true"
              >
                <span className="continue-poster-frame skeleton" />
                <span className="continue-copy">
                  <span className="skeleton skeleton-text skeleton-title" />
                  <span className="skeleton skeleton-text skeleton-subtitle" />
                </span>
              </div>
            ))}
          </div>
        ) : suggestedTrendingSeries.length === 0 ? (
          <p className="empty-state">
            Nenhuma sugestão fora da sua biblioteca no momento.
          </p>
        ) : (
          <div
            ref={trendingScrollRef}
            className="continue-watching-scroll trending-series-scroll"
            onWheel={onContinueWatchingWheel}
          >
            {suggestedTrendingSeries.map((series) => (
              <article key={series.tmdb_id} className="trending-card">
                <button
                  type="button"
                  className="continue-card trending-detail-button"
                  onClick={() => onOpenTrendingSeriesDetails(series)}
                >
                  <span className="continue-poster-frame">
                    <MediaImage
                      path={series.poster_path}
                      alt={`Capa de ${series.name}`}
                      className="continue-poster"
                      fallback="Sem capa"
                      size="w342"
                    />
                    <span className="continue-card-shade" />
                    <span className="trending-rating">
                      <Star aria-hidden="true" />
                      {series.vote_average ? series.vote_average.toFixed(1) : "-"}
                    </span>
                  </span>
                  <span className="continue-copy">
                    <strong>{series.name}</strong>
                    <small>
                      {series.first_air_date
                        ? new Date(series.first_air_date).getFullYear()
                        : "Sem data"}
                    </small>
                  </span>
                </button>
                <button
                  type="button"
                  className="trending-add-button"
                  disabled={loading}
                  onClick={() => onOpenTrendingSeriesDetails(series)}
                >
                  <Info aria-hidden="true" />
                  Detalhes
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="home-section">
        <div className="section-heading">
          <h2>Continue assistindo</h2>
          <span className="section-actions">
            {continueWatching.length > 2 && (
              <span className="carousel-controls">
                <button
                  type="button"
                  className="icon-button carousel-button"
                  aria-label="Rolar para a esquerda"
                  onClick={() => onScrollContinueWatching("left")}
                >
                  <ChevronLeft aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-button carousel-button"
                  aria-label="Rolar para a direita"
                  onClick={() => onScrollContinueWatching("right")}
                >
                  <ChevronRight aria-hidden="true" />
                </button>
              </span>
            )}
            <button type="button" onClick={onGoToLibrary}>
              Ver tudo
            </button>
          </span>
        </div>

        {isContinueWatchingLoading ? (
          <div
            className="continue-watching-scroll"
            aria-label="Carregando séries para continuar assistindo"
          >
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`continue-skeleton-${index}`}
                className="continue-card continue-card-skeleton"
                aria-hidden="true"
              >
                <span className="continue-poster-frame skeleton" />
                <span className="continue-copy">
                  <span className="skeleton skeleton-text skeleton-title" />
                  <span className="skeleton skeleton-text skeleton-subtitle" />
                  <span className="skeleton skeleton-text skeleton-progress" />
                </span>
              </div>
            ))}
          </div>
        ) : continueWatching.length === 0 ? (
          <p className="empty-state">Adicione uma série para montar sua fila.</p>
        ) : (
          <div
            ref={continueScrollRef}
            className="continue-watching-scroll"
            onWheel={onContinueWatchingWheel}
          >
            {continueWatching.map((series) => (
              <button
                key={series.id}
                type="button"
                className="continue-card"
                onClick={() => onOpenContinueWatchingSeries(series)}
              >
                <span className="continue-poster-frame">
                  <MediaImage
                    path={series.poster_path}
                    alt={`Capa de ${series.title}`}
                    className="continue-poster"
                    fallback="Sem capa"
                    size="w342"
                  />
                  <span className="continue-card-shade" />
                  <span className="continue-percent">
                    {series.completed_percent}%
                  </span>
                  <span className="continue-play-button" aria-hidden="true">
                    <Play />
                  </span>
                </span>
                <span className="continue-copy">
                  <strong>{series.title}</strong>
                  <small>Assistido até {getLatestEpisodeLabel(series)}</small>
                  <span className="progress-track">
                    <span
                      className="progress-fill"
                      style={{ width: `${series.completed_percent}%` }}
                    />
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="home-section">
        <div className="section-heading">
          <h2>Próximos episódios</h2>
          <button type="button" onClick={onGoToCalendar}>
            Ver calendário
          </button>
        </div>

        {isUpcomingEpisodeLoading ? (
          <div className="upcoming-card upcoming-card-skeleton" aria-hidden="true">
            <span className="upcoming-poster skeleton" />
            <span>
              <span className="skeleton skeleton-text skeleton-title" />
              <span className="skeleton skeleton-text skeleton-subtitle" />
              <span className="skeleton skeleton-text skeleton-date" />
            </span>
          </div>
        ) : upcomingEpisodes.length > 0 ? (
          <div className="upcoming-list">
            {upcomingEpisodes.map((episode) => (
              <button
                key={[
                  episode.episode_id,
                  episode.series_id,
                  episode.season_number,
                  episode.episode_number,
                ].join("-")}
                type="button"
                className="upcoming-card"
                onClick={() => onOpenEpisodeModal(episode)}
              >
                <MediaImage
                  path={episode.still_path ?? episode.series_poster_path}
                  alt={`Imagem de ${episode.title ?? episode.series_title ?? "episódio"}`}
                  className="upcoming-poster"
                  fallback="Sem imagem"
                  size="w300"
                />
                <span>
                  <strong>{episode.series_title ?? "Série acompanhada"}</strong>
                  <small>
                    S{episode.season_number ?? "-"} - E
                    {episode.episode_number ?? "-"}
                    {episode.title ? ` · ${episode.title}` : ""}
                  </small>
                  <small>{formatDate(episode.air_date)}</small>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty-state">
            Nenhum episódio encontrado para sua fila no momento.
          </p>
        )}
      </section>
    </section>
    </>
  );
};
