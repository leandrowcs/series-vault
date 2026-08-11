import { useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import axios from "axios";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Grid2X2,
  Home,
  Library,
  List,
  Play,
  BookmarkCheck,
  BookmarkPlus,
  BookmarkX,
  ChevronDown,
  Search,
  Star,
  Tv,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCloudAuth } from "./hooks/useCloudAuth";
import { useGoogleDriveBackup } from "./hooks/useGoogleDriveBackup";
import {
  deleteCloudWatchedEpisode,
  getEpisodeKey,
  loadCloudTrackedSeries,
  loadCloudWatchedEpisodes,
  publishCloudProfile,
  saveCloudTrackedSeries,
  saveCloudWatchedEpisode,
} from "./services/cloudStore";
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
} from "./types/series";
import "./App.css";

type SeasonEpisodeGroup = {
  seasonNumber: number;
  episodes: EpisodeDetail[];
  watchedCount: number;
};

type ActiveTab = "home" | "tracked" | "calendar" | "stats";

type LibraryFilter = "watching" | "waiting" | "finished" | "abandoned" | "all";

type LibraryViewMode = "covers" | "list";

type LibraryTabTransitionDirection = "slide-left" | "slide-right";

type SeriesModalTab = "details" | "seasons";

type LibrarySeriesStatus =
  | "watching"
  | "waiting"
  | "finished"
  | "abandoned"
  | "notStarted";

type DashboardMetric = {
  label: string;
  value: string;
  icon: LucideIcon;
  layout: "compact" | "wide";
  tone: "cyan" | "purple" | "amber" | "green";
};

type UpcomingEpisodeItem = CalendarEvent & {
  source: "calendar" | "watchlist";
  series?: TrackedSeries;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const libraryFilterOrder: LibraryFilter[] = [
  "watching",
  "waiting",
  "finished",
  "abandoned",
  "all",
];

const configuredApiBaseUrl = String(
  import.meta.env.VITE_API_BASE_URL ?? "",
).trim();
const apiBaseUrl = configuredApiBaseUrl || "/api";
const hasApi = Boolean(apiBaseUrl);

const api = axios.create({
  baseURL: apiBaseUrl,
  headers: { "Content-Type": "application/json" },
});

type TmdbImageSize = "w92" | "w185" | "w300" | "w342" | "w500" | "original";

const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

const tmdbImageUrl = (path?: string, size: TmdbImageSize = "w342") => {
  if (!path) return undefined;
  return `${TMDB_IMAGE_BASE_URL}/${size}${path.startsWith("/") ? path : `/${path}`}`;
};

type MediaImageProps = {
  path?: string;
  alt: string;
  className: string;
  fallback: string;
  size?: TmdbImageSize;
};

const MediaImage = ({
  path,
  alt,
  className,
  fallback,
  size = "w342",
}: MediaImageProps) => {
  const src = tmdbImageUrl(path, size);

  if (!src) {
    return <div className={`${className} image-placeholder`}>{fallback}</div>;
  }

  return <img className={className} src={src} alt={alt} loading="lazy" />;
};

const formatDate = (dateString?: string) => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatWatchDuration = (minutes: number) => {
  const totalHours = Math.round(minutes / 60);
  if (totalHours <= 0) return "0 horas";

  const units = [
    { label: "ano", plural: "anos", hours: 365 * 24 },
    { label: "mês", plural: "meses", hours: 30 * 24 },
    { label: "dia", plural: "dias", hours: 24 },
    { label: "hora", plural: "horas", hours: 1 },
  ];

  let remainingHours = totalHours;
  const parts: string[] = [];

  units.forEach((unit) => {
    const value = Math.floor(remainingHours / unit.hours);
    if (value === 0) return;

    remainingHours %= unit.hours;
    parts.push(`${value} ${value === 1 ? unit.label : unit.plural}`);
  });

  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
};

const getGreeting = () => {
  const hour = new Date().getHours();

  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
};

const getApiErrorMessage = (err: unknown, fallback: string) => {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
  }

  if (err instanceof Error && err.message) return err.message;

  return fallback;
};

const getArrayResponse = <T,>(data: unknown, resourceName: string): T[] => {
  if (Array.isArray(data)) return data as T[];

  if (typeof data === "string" && data.trimStart().startsWith("<")) {
    throw new Error(
      `A rota /api retornou a página do app em vez de ${resourceName}. Verifique se o deploy da Vercel está usando a raiz do repositório e se TMDB_API_KEY está configurada.`,
    );
  }

  throw new Error(`A API retornou um formato inválido para ${resourceName}.`);
};

const mergeTrackedSeries = (
  current: TrackedSeries[],
  incoming: TrackedSeries[],
) => {
  const byTmdbId = new Map<number, TrackedSeries>();

  current.forEach((series) => byTmdbId.set(series.tmdb_id, series));
  incoming.forEach((series) => {
    const existing = byTmdbId.get(series.tmdb_id);
    byTmdbId.set(
      series.tmdb_id,
      existing ? { ...series, ...existing } : series,
    );
  });

  return Array.from(byTmdbId.values()).sort((a, b) =>
    a.title.localeCompare(b.title),
  );
};

const watchedMapFromRecords = (records: WatchedEpisodeRecord[]) => {
  const map = new Map<string, WatchedEpisodeRecord>();
  records.forEach((record) => map.set(record.episode_key, record));
  return map;
};

const applyWatchedRecords = (
  items: EpisodeDetail[],
  watchedRecords: Map<string, WatchedEpisodeRecord>,
) =>
  items.map((episode) => {
    const record = watchedRecords.get(getEpisodeKey(episode));
    if (!record) return episode;

    return {
      ...episode,
      watched: true,
      progress_percent: record.progress_percent,
    };
  });

const endedSeriesStatuses = new Set([
  "canceled",
  "cancelled",
  "ended",
  "finalizada",
  "finalizado",
]);

const isSeriesEnded = (series: TrackedSeries) =>
  endedSeriesStatuses.has(String(series.status ?? "").trim().toLowerCase());

const abandonedSeriesStatuses = new Set([
  "abandoned",
  "abandonada",
  "abandonado",
]);

const isSeriesAbandoned = (series: TrackedSeries) => {
  const userStatus = String(
    series.user_status ?? series.library_status ?? series.personal_status ?? "",
  )
    .trim()
    .toLowerCase();

  return abandonedSeriesStatuses.has(userStatus);
};

const getLibrarySeriesStatus = (series: TrackedSeries): LibrarySeriesStatus => {
  if (isSeriesAbandoned(series)) {
    return "abandoned";
  }

  if (series.completed_percent > 0 && series.completed_percent < 100) {
    return "watching";
  }

  if (series.completed_percent >= 100 && isSeriesEnded(series)) {
    return "finished";
  }

  if (series.completed_percent >= 100) {
    return "waiting";
  }

  return "notStarted";
};

const sortSeriesByTitle = (items: TrackedSeries[]) =>
  [...items].sort((seriesA, seriesB) =>
    seriesA.title.localeCompare(seriesB.title, "pt-BR"),
  );

const getSeriesInitial = (title: string) => {
  const firstChar = title.trim().charAt(0).toLocaleUpperCase("pt-BR");
  return /^[A-ZÀ-Ú]$/i.test(firstChar) ? firstChar : "#";
};

const makeWatchedEpisodeRecord = (
  series: TrackedSeries,
  episode: EpisodeDetail,
): WatchedEpisodeRecord => ({
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
});

const updateSeriesCompletion = (
  series: TrackedSeries,
  watchedRecords: Map<string, WatchedEpisodeRecord>,
  episodeCache: Record<string, EpisodeDetail[]>,
): TrackedSeries => {
  const cachedEpisodes = episodeCache[String(series.tmdb_id)];
  const requiredEpisodes = cachedEpisodes?.filter(
    (episode) => episode.season_number > 0,
  );
  const totalEpisodes =
    requiredEpisodes?.length || series.number_of_episodes || 0;

  if (!totalEpisodes) return series;

  const watchedCount = requiredEpisodes
    ? requiredEpisodes.filter((episode) =>
        watchedRecords.has(getEpisodeKey(episode)),
      ).length
    : Array.from(watchedRecords.values()).filter(
        (record) => record.series_tmdb_id === series.tmdb_id,
      ).length;
  const completedPercent = Math.min(
    100,
    Math.round((watchedCount / totalEpisodes) * 100),
  );

  if (series.completed_percent === completedPercent) return series;

  return {
    ...series,
    completed_percent: completedPercent,
    last_synced_at: new Date().toISOString(),
  };
};

const normalizeTrackedSeries = (
  series: Partial<TrackedSeries> & { name?: string; original_name?: string },
): TrackedSeries => ({
  id: Number(series.id ?? series.tmdb_id),
  tmdb_id: Number(series.tmdb_id ?? series.id),
  title: series.title ?? series.name ?? series.original_name ?? "",
  overview: series.overview,
  poster_path: series.poster_path,
  backdrop_path: series.backdrop_path,
  completed_percent: Number(series.completed_percent ?? 0),
  number_of_seasons: series.number_of_seasons,
  number_of_episodes: series.number_of_episodes,
  status: series.status,
  first_air_date: series.first_air_date,
  last_air_date: series.last_air_date,
  episode_run_time: series.episode_run_time,
  vote_average: series.vote_average,
  vote_count: series.vote_count,
  genres: series.genres,
  actors: series.actors,
  user_status: series.user_status,
  library_status: series.library_status,
  personal_status: series.personal_status,
  last_synced_at: series.last_synced_at ?? new Date().toISOString(),
});

function App() {
  const auth = useCloudAuth();
  const drive = useGoogleDriveBackup(auth.driveAccessToken);
  const continueScrollRef = useRef<HTMLDivElement | null>(null);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [tracked, setTracked] = useState<TrackedSeries[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<TrackedSeries | null>(
    null,
  );
  const [seriesModalTab, setSeriesModalTab] =
    useState<SeriesModalTab>("details");
  const [episodes, setEpisodes] = useState<EpisodeDetail[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [newEpisodes, setNewEpisodes] = useState<CalendarNewEpisode[]>([]);
  const [stats, setStats] = useState({
    overview: null as OverviewStats | null,
    genres: [] as GenreStat[],
    actors: [] as ActorStat[],
    years: [] as YearStat[],
    topSeries: [] as TopSeriesStat[],
  });
  const [loading, setLoading] = useState(false);
  const [isTrackedLoading, setIsTrackedLoading] = useState(false);
  const [isCalendarLoading, setIsCalendarLoading] = useState(false);
  const [isEpisodePrefetchLoading, setIsEpisodePrefetchLoading] =
    useState(false);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [error, setError] = useState("");
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "syncing" | "synced" | "error"
  >("idle");
  const [cloudWatchedRecords, setCloudWatchedRecords] = useState<
    Map<string, WatchedEpisodeRecord>
  >(new Map());
  const [episodeCache, setEpisodeCache] = useState<
    Record<string, EpisodeDetail[]>
  >({});
  const [hasLoadedCloudData, setHasLoadedCloudData] = useState(false);
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(
    new Set(),
  );
  const [collapsedLibraryGroups, setCollapsedLibraryGroups] = useState<
    Set<string>
  >(new Set());
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("watching");
  const [libraryTabTransitionDirection, setLibraryTabTransitionDirection] =
    useState<LibraryTabTransitionDirection>("slide-left");
  const [libraryViewMode, setLibraryViewMode] =
    useState<LibraryViewMode>("covers");

  useEffect(() => {
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const navigatorWithStandalone = window.navigator as Navigator & {
      standalone?: boolean;
    };

    const updateInstalledState = () => {
      setIsAppInstalled(
        standaloneQuery.matches || navigatorWithStandalone.standalone === true,
      );
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setIsAppInstalled(true);
    };

    updateInstalledState();
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    standaloneQuery.addEventListener("change", updateInstalledState);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
      standaloneQuery.removeEventListener("change", updateInstalledState);
    };
  }, []);

  useEffect(() => {
    fetchTracked();
  }, []);

  useEffect(() => {
    if (!auth.user) {
      setCloudWatchedRecords(new Map());
      setSyncStatus("idle");
      setHasLoadedCloudData(false);
      return;
    }

    let cancelled = false;

    const loadCloudData = async () => {
      try {
        setSyncStatus("syncing");
        await publishCloudProfile(auth.user.uid, auth.user);

        const [cloudTracked, cloudWatched, driveBackup] = await Promise.all([
          loadCloudTrackedSeries(auth.user.uid),
          loadCloudWatchedEpisodes(auth.user.uid),
          drive.loadBackup(),
        ]);

        if (cancelled) return;

        const backupTracked = driveBackup?.trackedSeries ?? [];
        const backupWatched = driveBackup?.watchedEpisodes ?? [];
        const nextWatchedRecords = watchedMapFromRecords([
          ...cloudWatched,
          ...backupWatched,
        ]);

        setTracked((current) =>
          mergeTrackedSeries(current, [...backupTracked, ...cloudTracked]),
        );
        setCloudWatchedRecords(nextWatchedRecords);
        setEpisodeCache((current) => ({
          ...driveBackup?.episodeCache,
          ...current,
        }));
        setHasLoadedCloudData(true);
        setSyncStatus("synced");
      } catch {
        if (!cancelled) {
          setSyncStatus("error");
          setHasLoadedCloudData(true);
        }
      }
    };

    loadCloudData();

    return () => {
      cancelled = true;
    };
  }, [auth.user?.uid, auth.driveAccessToken]);

  useEffect(() => {
    if (!auth.user || !drive.isConfigured || !hasLoadedCloudData) return;

    const timer = window.setTimeout(async () => {
      const backup: SeriesVaultBackup = {
        version: 1,
        trackedSeries: tracked,
        watchedEpisodes: Array.from(cloudWatchedRecords.values()),
        episodeCache,
        exportedAt: new Date().toISOString(),
      };

      setSyncStatus("syncing");
      const saved = await drive.saveBackup(backup);
      setSyncStatus(saved ? "synced" : "error");
    }, 900);

    return () => window.clearTimeout(timer);
  }, [
    auth.user?.uid,
    drive.isConfigured,
    tracked,
    cloudWatchedRecords,
    episodeCache,
    hasLoadedCloudData,
  ]);

  useEffect(() => {
    if (activeTab === "home" || activeTab === "calendar") {
      fetchCalendar();
    }
    if (activeTab === "home" || activeTab === "stats") {
      fetchStats();
    }
  }, [activeTab]);

  useEffect(() => {
    if (selectedSeries) {
      setEpisodes([]);
      setExpandedSeasons(new Set());
      setSeriesModalTab("details");
      fetchSeriesEpisodes(selectedSeries.id);
    }
  }, [selectedSeries?.id]);

  useEffect(() => {
    setEpisodes((current) => applyWatchedRecords(current, cloudWatchedRecords));
  }, [cloudWatchedRecords]);

  useEffect(() => {
    setTracked((current) => {
      let changed = false;
      const next = current.map((series) => {
        const updatedSeries = updateSeriesCompletion(
          series,
          cloudWatchedRecords,
          episodeCache,
        );
        changed ||= updatedSeries !== series;
        return updatedSeries;
      });

      return changed ? next : current;
    });

    setSelectedSeries((current) => {
      if (!current) return current;
      return updateSeriesCompletion(current, cloudWatchedRecords, episodeCache);
    });
  }, [cloudWatchedRecords, episodeCache]);

  const seasonGroups = useMemo<SeasonEpisodeGroup[]>(() => {
    const groups = new Map<number, EpisodeDetail[]>();

    episodes
      .filter((episode) => episode.season_number > 0)
      .forEach((episode) => {
      const seasonEpisodes = groups.get(episode.season_number) ?? [];
      seasonEpisodes.push(episode);
      groups.set(episode.season_number, seasonEpisodes);
    });

    return Array.from(groups.entries())
      .sort(([seasonA], [seasonB]) => seasonA - seasonB)
      .map(([seasonNumber, seasonEpisodes]) => {
        const sortedEpisodes = [...seasonEpisodes].sort(
          (episodeA, episodeB) =>
            episodeA.episode_number - episodeB.episode_number,
        );

        return {
          seasonNumber,
          episodes: sortedEpisodes,
          watchedCount: sortedEpisodes.filter((episode) => episode.watched)
            .length,
        };
      });
  }, [episodes]);

  useEffect(() => {
    if (seasonGroups.length === 0) {
      setExpandedSeasons(new Set());
      return;
    }

    setExpandedSeasons((currentExpandedSeasons) => {
      const availableSeasons = new Set(
        seasonGroups.map((group) => group.seasonNumber),
      );
      const stillAvailable = [...currentExpandedSeasons].filter(
        (seasonNumber) => availableSeasons.has(seasonNumber),
      );

      return new Set(stillAvailable);
    });
  }, [seasonGroups]);

  useEffect(() => {
    if (!selectedSeries) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedSeries(null);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedSeries]);

  const fetchTracked = async () => {
    if (!hasApi) return;

    try {
      setLoading(true);
      setIsTrackedLoading(true);
      const response = await api.get<TrackedSeries[]>("/series/tracked");
      const trackedSeries = getArrayResponse<TrackedSeries>(
        response.data,
        "séries acompanhadas",
      );
      setTracked((current) => mergeTrackedSeries(trackedSeries, current));
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao carregar séries"));
    } finally {
      setLoading(false);
      setIsTrackedLoading(false);
    }
  };

  const searchSeries = async () => {
    if (!query.trim()) return;
    if (!hasApi) {
      setError(
        "API TMDb não configurada neste ambiente. Configure VITE_API_BASE_URL na Vercel.",
      );
      return;
    }

    try {
      setLoading(true);
      const response = await api.get<SearchResult[]>("/series", {
        params: { query },
      });
      setResults(getArrayResponse<SearchResult>(response.data, "resultados"));
      setLoading(false);
    } catch (err) {
      setLoading(false);
      setError(getApiErrorMessage(err, "Erro na busca TMDb"));
    }
  };

  const addSeries = async (tmdb_id: number) => {
    if (!hasApi) {
      setError(
        "API TMDb não configurada neste ambiente. Configure VITE_API_BASE_URL na Vercel.",
      );
      return;
    }

    try {
      setLoading(true);
      const response = await api.post<TrackedSeries>("/series", { tmdb_id });
      const addedSeries = normalizeTrackedSeries(response.data);
      setTracked((current) => mergeTrackedSeries(current, [addedSeries]));
      if (auth.user && addedSeries) {
        await saveCloudTrackedSeries(auth.user.uid, addedSeries);
      }

      setLoading(false);
      setError("");
    } catch (err) {
      setLoading(false);
      setError(getApiErrorMessage(err, "Falha ao adicionar série"));
    }
  };

  const fetchSeriesEpisodes = async (seriesId: number) => {
    const series = tracked.find((item) => item.id === seriesId);
    const cachedEpisodes = series
      ? episodeCache[String(series.tmdb_id)]
      : undefined;

    if (!hasApi) {
      if (cachedEpisodes) {
        setEpisodes(applyWatchedRecords(cachedEpisodes, cloudWatchedRecords));
      }
      return;
    }

    try {
      const response = await api.get<EpisodeDetail[]>(
        `/series/${seriesId}/episodes`,
      );
      const fetchedEpisodes = getArrayResponse<EpisodeDetail>(
        response.data,
        "episódios",
      );
      const nextEpisodes = applyWatchedRecords(
        fetchedEpisodes,
        cloudWatchedRecords,
      );
      setEpisodes(nextEpisodes);

      if (series) {
        setEpisodeCache((current) => ({
          ...current,
          [String(series.tmdb_id)]: nextEpisodes,
        }));
      }
    } catch (err) {
      if (cachedEpisodes) {
        setEpisodes(applyWatchedRecords(cachedEpisodes, cloudWatchedRecords));
        return;
      }

      setError(getApiErrorMessage(err, "Não foi possível carregar episódios"));
    }
  };

  const toggleEpisodeWatch = async (episode: EpisodeDetail) => {
    if (!selectedSeries) return;

    const shouldMarkWatched = !episode.watched;
    const nextWatchedRecords = new Map(cloudWatchedRecords);

    if (shouldMarkWatched) {
      nextWatchedRecords.set(
        getEpisodeKey(episode),
        makeWatchedEpisodeRecord(selectedSeries, episode),
      );
    } else {
      nextWatchedRecords.delete(getEpisodeKey(episode));
    }

    const nextEpisodes = episodes.map((item) =>
      getEpisodeKey(item) === getEpisodeKey(episode)
        ? {
            ...item,
            watched: shouldMarkWatched,
            progress_percent: shouldMarkWatched ? 100 : 0,
          }
        : item,
    );
    const nextEpisodeCache = {
      ...episodeCache,
      [String(selectedSeries.tmdb_id)]: nextEpisodes,
    };
    const nextSelectedSeries = updateSeriesCompletion(
      selectedSeries,
      nextWatchedRecords,
      nextEpisodeCache,
    );

    setEpisodes(nextEpisodes);
    setEpisodeCache(nextEpisodeCache);
    setCloudWatchedRecords(nextWatchedRecords);
    setSelectedSeries(nextSelectedSeries);
    setTracked((current) =>
      current.map((series) =>
        series.tmdb_id === nextSelectedSeries.tmdb_id
          ? nextSelectedSeries
          : series,
      ),
    );

    try {
      if (!shouldMarkWatched) {
        if (hasApi) {
          await api.delete(`/watch/episodes/${episode.id}`).catch(() => null);
        }
        if (auth.user) {
          await deleteCloudWatchedEpisode(auth.user.uid, episode);
        }
      } else {
        if (hasApi) {
          await api
            .patch(`/watch/episodes/${episode.id}`, {
              watched: true,
              progress_percent: 100,
            })
            .catch(() => null);
        }
        if (auth.user && selectedSeries) {
          await saveCloudWatchedEpisode(auth.user.uid, selectedSeries, episode);
        }
      }
      if (auth.user) {
        await saveCloudTrackedSeries(auth.user.uid, nextSelectedSeries);
      }
    } catch (err) {
      setError("Erro ao atualizar episódio");
    }
  };

  const setSeasonWatchState = async (
    group: SeasonEpisodeGroup,
    shouldMarkWatched: boolean,
  ) => {
    if (!selectedSeries) return;

    const changedEpisodes = group.episodes.filter(
      (episode) => episode.watched !== shouldMarkWatched,
    );
    if (changedEpisodes.length === 0) return;

    const changedEpisodeKeys = new Set(changedEpisodes.map(getEpisodeKey));
    const nextWatchedRecords = new Map(cloudWatchedRecords);

    changedEpisodes.forEach((episode) => {
      const episodeKey = getEpisodeKey(episode);

      if (shouldMarkWatched) {
        nextWatchedRecords.set(
          episodeKey,
          makeWatchedEpisodeRecord(selectedSeries, episode),
        );
      } else {
        nextWatchedRecords.delete(episodeKey);
      }
    });

    const nextEpisodes = episodes.map((episode) =>
      changedEpisodeKeys.has(getEpisodeKey(episode))
        ? {
            ...episode,
            watched: shouldMarkWatched,
            progress_percent: shouldMarkWatched ? 100 : 0,
          }
        : episode,
    );
    const nextEpisodeCache = {
      ...episodeCache,
      [String(selectedSeries.tmdb_id)]: nextEpisodes,
    };
    const nextSelectedSeries = updateSeriesCompletion(
      selectedSeries,
      nextWatchedRecords,
      nextEpisodeCache,
    );

    setEpisodes(nextEpisodes);
    setEpisodeCache(nextEpisodeCache);
    setCloudWatchedRecords(nextWatchedRecords);
    setSelectedSeries(nextSelectedSeries);
    setTracked((current) =>
      current.map((series) =>
        series.tmdb_id === nextSelectedSeries.tmdb_id
          ? nextSelectedSeries
          : series,
      ),
    );

    try {
      if (shouldMarkWatched) {
        if (hasApi) {
          await Promise.all(
            changedEpisodes.map((episode) =>
              api
                .patch(`/watch/episodes/${episode.id}`, {
                  watched: true,
                  progress_percent: 100,
                })
                .catch(() => null),
            ),
          );
        }
        if (auth.user) {
          await Promise.all(
            changedEpisodes.map((episode) =>
              saveCloudWatchedEpisode(auth.user!.uid, selectedSeries, episode),
            ),
          );
        }
      } else {
        if (hasApi) {
          await Promise.all(
            changedEpisodes.map((episode) =>
              api.delete(`/watch/episodes/${episode.id}`).catch(() => null),
            ),
          );
        }
        if (auth.user) {
          await Promise.all(
            changedEpisodes.map((episode) =>
              deleteCloudWatchedEpisode(auth.user!.uid, episode),
            ),
          );
        }
      }

      if (auth.user) {
        await saveCloudTrackedSeries(auth.user.uid, nextSelectedSeries);
      }
    } catch (err) {
      setError("Erro ao atualizar temporada");
    }
  };

  const toggleSeason = (seasonNumber: number) => {
    setExpandedSeasons((currentExpandedSeasons) => {
      const nextExpandedSeasons = new Set(currentExpandedSeasons);

      if (nextExpandedSeasons.has(seasonNumber)) {
        nextExpandedSeasons.delete(seasonNumber);
      } else {
        nextExpandedSeasons.add(seasonNumber);
      }

      return nextExpandedSeasons;
    });
  };

  const fetchCalendar = async () => {
    if (!hasApi) {
      setCalendarEvents([]);
      setNewEpisodes([]);
      return;
    }

    const today = new Date();
    const end = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const startDate = today.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    try {
      setIsCalendarLoading(true);
      const [calendarRes, newRes] = await Promise.all([
        api.get<CalendarEvent[]>("/calendar", {
          params: { start: startDate, end: endDate },
        }),
        api.get<CalendarNewEpisode[]>("/calendar/new-episodes", {
          params: { since: startDate },
        }),
      ]);
      setCalendarEvents(
        getArrayResponse<CalendarEvent>(calendarRes.data, "calendário"),
      );
      setNewEpisodes(
        getArrayResponse<CalendarNewEpisode>(
          newRes.data,
          "novos episódios",
        ),
      );
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao carregar calendário"));
    } finally {
      setIsCalendarLoading(false);
    }
  };

  const fetchStats = async () => {
    if (!hasApi) {
      setStats({
        overview: null,
        genres: [],
        actors: [],
        years: [],
        topSeries: [],
      });
      return;
    }

    try {
      setIsStatsLoading(true);
      const [overviewRes, genresRes, actorsRes, yearsRes, topSeriesRes] =
        await Promise.all([
          api.get<OverviewStats>("/stats/overview"),
          api.get<GenreStat[]>("/stats/genres"),
          api.get<ActorStat[]>("/stats/actors"),
          api.get<YearStat[]>("/stats/years"),
          api.get<TopSeriesStat[]>("/stats/top-series"),
        ]);
      setStats({
        overview: overviewRes.data,
        genres: getArrayResponse<GenreStat>(genresRes.data, "gêneros"),
        actors: getArrayResponse<ActorStat>(actorsRes.data, "atores"),
        years: getArrayResponse<YearStat>(yearsRes.data, "anos"),
        topSeries: getArrayResponse<TopSeriesStat>(
          topSeriesRes.data,
          "ranking de séries",
        ),
      });
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao carregar estatísticas"));
    } finally {
      setIsStatsLoading(false);
    }
  };

  const syncLabel = {
    idle: auth.isConfigured ? "Cloud pronto" : "Cloud não configurado",
    syncing: "Sincronizando",
    synced: "Sincronizado",
    error: "Falha no sync",
  }[syncStatus];

  const watchedRecords = useMemo(
    () => Array.from(cloudWatchedRecords.values()),
    [cloudWatchedRecords],
  );

  const watchedEpisodeKeys = useMemo(
    () => new Set(watchedRecords.map((record) => record.episode_key)),
    [watchedRecords],
  );

  const episodeRuntimeByKey = useMemo(() => {
    const runtimeByKey = new Map<string, number>();

    Object.values(episodeCache).forEach((seriesEpisodes) => {
      seriesEpisodes.forEach((episode) => {
        if (episode.runtime) {
          runtimeByKey.set(getEpisodeKey(episode), episode.runtime);
        }
      });
    });

    return runtimeByKey;
  }, [episodeCache]);

  const localRuntimeMinutes = watchedRecords.reduce(
    (total, record) =>
      total +
      (record.runtime_minutes ??
        episodeRuntimeByKey.get(record.episode_key) ??
        0),
    0,
  );

  const totalWatchedEpisodes =
    watchedRecords.length > 0
      ? watchedRecords.length
      : (stats.overview?.total_watched_episodes ?? 0);

  const totalRuntimeMinutes =
    localRuntimeMinutes > 0
      ? localRuntimeMinutes
      : (stats.overview?.total_runtime_minutes ?? 0);

  const activeWatchDays = new Set(
    watchedRecords.map((record) => record.watched_at.slice(0, 10)),
  ).size;

  const selectedEpisodeTotals = useMemo(() => {
    const regularEpisodes = episodes.filter(
      (episode) => episode.season_number > 0,
    );
    const specialEpisodes = episodes.filter(
      (episode) => episode.season_number === 0,
    );

    return {
      regular: regularEpisodes.length,
      regularWatched: regularEpisodes.filter((episode) => episode.watched)
        .length,
      specials: specialEpisodes.length,
      specialsWatched: specialEpisodes.filter((episode) => episode.watched)
        .length,
    };
  }, [episodes]);

  const continueWatching = useMemo(
    () =>
      tracked
        .filter((series) => getLibrarySeriesStatus(series) === "watching")
        .sort(
          (seriesA, seriesB) =>
            seriesB.completed_percent - seriesA.completed_percent,
        ),
    [tracked],
  );

  useEffect(() => {
    if (activeTab !== "home" || !hasApi || continueWatching.length === 0) {
      return;
    }

    const seriesMissingEpisodes = continueWatching
      .slice(0, 6)
      .filter((series) => !episodeCache[String(series.tmdb_id)]);

    if (seriesMissingEpisodes.length === 0) return;

    let cancelled = false;

    const prefetchEpisodes = async () => {
      setIsEpisodePrefetchLoading(true);

      try {
        const entries = await Promise.all(
          seriesMissingEpisodes.map(async (series) => {
            try {
              const response = await api.get<EpisodeDetail[]>(
                `/series/${series.tmdb_id}/episodes`,
              );
              const fetchedEpisodes = getArrayResponse<EpisodeDetail>(
                response.data,
                "episódios",
              );

              return [
                String(series.tmdb_id),
                applyWatchedRecords(fetchedEpisodes, cloudWatchedRecords),
              ] as const;
            } catch {
              return null;
            }
          }),
        );

        if (cancelled) return;

        const loadedEntries = entries.filter(
          (entry): entry is readonly [string, EpisodeDetail[]] =>
            entry !== null,
        );

        if (loadedEntries.length === 0) return;

        setEpisodeCache((current) => {
          const nextCache = { ...current };

          loadedEntries.forEach(([tmdbId, seriesEpisodes]) => {
            if (!nextCache[tmdbId]) {
              nextCache[tmdbId] = seriesEpisodes;
            }
          });

          return nextCache;
        });
      } finally {
        if (!cancelled) {
          setIsEpisodePrefetchLoading(false);
        }
      }
    };

    prefetchEpisodes();

    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    cloudWatchedRecords,
    continueWatching,
    episodeCache,
  ]);

  const getLatestEpisodeLabel = (series: TrackedSeries) => {
    const latest = watchedRecords
      .filter((record) => record.series_tmdb_id === series.tmdb_id)
      .sort(
        (recordA, recordB) =>
          new Date(recordB.watched_at).getTime() -
          new Date(recordA.watched_at).getTime(),
      )[0];

    if (!latest?.season_number || !latest?.episode_number)
      return "Ainda não iniciado";
    return `S${latest.season_number} - E${latest.episode_number}`;
  };

  const nextWatchlistEpisodes = useMemo<UpcomingEpisodeItem[]>(() => {
    return continueWatching
      .map((series) => {
        const seriesEpisodes = episodeCache[String(series.tmdb_id)];
        if (!seriesEpisodes?.length) return undefined;

        const sortedEpisodes = [...seriesEpisodes].sort(
          (episodeA, episodeB) =>
            episodeA.season_number - episodeB.season_number ||
            episodeA.episode_number - episodeB.episode_number,
        );
        const nextEpisode =
          sortedEpisodes.find(
            (episode) =>
              episode.season_number > 0 &&
              !watchedEpisodeKeys.has(getEpisodeKey(episode)),
          ) ??
          sortedEpisodes.find(
            (episode) => !watchedEpisodeKeys.has(getEpisodeKey(episode)),
          );

        if (!nextEpisode) return undefined;

        return {
          source: "watchlist",
          series,
          episode_id: nextEpisode.id,
          series_id: series.id,
          series_title: series.title,
          season_number: nextEpisode.season_number,
          episode_number: nextEpisode.episode_number,
          title: nextEpisode.title,
          air_date: nextEpisode.air_date,
          still_path: nextEpisode.still_path,
          series_poster_path: series.poster_path,
          watched: false,
        };
      })
      .filter((item): item is UpcomingEpisodeItem => Boolean(item));
  }, [continueWatching, episodeCache, watchedEpisodeKeys]);

  const calendarUpcomingEpisodes = useMemo<UpcomingEpisodeItem[]>(() => {
    const byEpisode = new Map<string, UpcomingEpisodeItem>();

    [...calendarEvents, ...newEpisodes].forEach((episode) => {
      const key = [
        episode.episode_id,
        episode.series_id,
        episode.season_number,
        episode.episode_number,
      ].join("-");

      if (!byEpisode.has(key)) {
        byEpisode.set(key, {
          ...episode,
          source: "calendar",
        });
      }
    });

    return Array.from(byEpisode.values());
  }, [calendarEvents, newEpisodes]);

  const upcomingEpisodes = useMemo(() => {
    const byEpisode = new Map<string, UpcomingEpisodeItem>();

    [...calendarUpcomingEpisodes, ...nextWatchlistEpisodes].forEach(
      (episode) => {
        const key = [
          episode.episode_id,
          episode.series_id,
          episode.season_number,
          episode.episode_number,
        ].join("-");

        if (!byEpisode.has(key)) {
          byEpisode.set(key, episode);
        }
      },
    );

    return Array.from(byEpisode.values())
      .sort((episodeA, episodeB) => {
        const dateA = episodeA.air_date
          ? new Date(episodeA.air_date).getTime()
          : Number.MAX_SAFE_INTEGER;
        const dateB = episodeB.air_date
          ? new Date(episodeB.air_date).getTime()
          : Number.MAX_SAFE_INTEGER;

        if (dateA !== dateB) return dateA - dateB;

        return String(episodeA.series_title ?? "").localeCompare(
          String(episodeB.series_title ?? ""),
          "pt-BR",
        );
      })
      .slice(0, 6);
  }, [calendarUpcomingEpisodes, nextWatchlistEpisodes]);

  const isDashboardLoading =
    (isTrackedLoading && tracked.length === 0) ||
    (isStatsLoading && !stats.overview);
  const isContinueWatchingLoading =
    isTrackedLoading && continueWatching.length === 0;
  const isUpcomingEpisodeLoading =
    (isCalendarLoading || isEpisodePrefetchLoading) &&
    upcomingEpisodes.length === 0;

  const dashboardMetrics: DashboardMetric[] = [
    {
      label: "Séries",
      value: String(tracked.length),
      icon: Play,
      layout: "compact",
      tone: "cyan",
    },
    {
      label: "Episódios assistidos",
      value: String(totalWatchedEpisodes),
      icon: Tv,
      layout: "compact",
      tone: "purple",
    },
    {
      label: "Tempo total assistindo",
      value: formatWatchDuration(totalRuntimeMinutes),
      icon: Clock3,
      layout: "wide",
      tone: "amber",
    },
    {
      label: "Dias ativos assistindo",
      value: String(activeWatchDays),
      icon: CalendarDays,
      layout: "wide",
      tone: "green",
    },
  ];

  const libraryStatusIcons: Record<
    Exclude<LibrarySeriesStatus, "notStarted">,
    LucideIcon
  > = {
    watching: Star,
    waiting: BookmarkPlus,
    finished: BookmarkCheck,
    abandoned: BookmarkX,
  };

  const libraryTabs: { id: LibraryFilter; label: string; icon?: LucideIcon }[] = [
    { id: "watching", label: "Assistindo", icon: Star },
    { id: "waiting", label: "Aguardando", icon: BookmarkPlus },
    { id: "finished", label: "Finalizadas", icon: BookmarkCheck },
    { id: "abandoned", label: "Largadas", icon: BookmarkX },
    { id: "all", label: "Todas", icon: Library },
  ];

  const librarySeries = useMemo(() => {
    if (libraryFilter === "watching") {
      return sortSeriesByTitle(
        tracked.filter((series) => getLibrarySeriesStatus(series) === "watching"),
      );
    }

    if (libraryFilter === "waiting") {
      return sortSeriesByTitle(
        tracked.filter((series) => getLibrarySeriesStatus(series) === "waiting"),
      );
    }

    if (libraryFilter === "finished") {
      return sortSeriesByTitle(
        tracked.filter((series) => getLibrarySeriesStatus(series) === "finished"),
      );
    }

    if (libraryFilter === "abandoned") {
      return sortSeriesByTitle(
        tracked.filter(
          (series) => getLibrarySeriesStatus(series) === "abandoned",
        ),
      );
    }

    return sortSeriesByTitle(tracked);
  }, [tracked, libraryFilter]);

  const groupedLibrarySeries = useMemo(() => {
    if (libraryFilter !== "all") {
      return [{ label: "", series: librarySeries }];
    }

    return librarySeries.reduce<{ label: string; series: TrackedSeries[] }[]>(
      (groups, series) => {
        const label = getSeriesInitial(series.title);
        const currentGroup = groups[groups.length - 1];

        if (currentGroup?.label === label) {
          currentGroup.series.push(series);
          return groups;
        }

        groups.push({ label, series: [series] });
        return groups;
      },
      [],
    );
  }, [libraryFilter, librarySeries]);

  const cycleLibraryViewMode = () => {
    setLibraryViewMode((currentMode) =>
      currentMode === "covers" ? "list" : "covers",
    );
  };

  const selectLibraryFilter = (filter: LibraryFilter) => {
    if (filter === libraryFilter) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const currentIndex = libraryFilterOrder.indexOf(libraryFilter);
    const nextIndex = libraryFilterOrder.indexOf(filter);

    setLibraryTabTransitionDirection(
      nextIndex > currentIndex ? "slide-left" : "slide-right",
    );
    setLibraryFilter(filter);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const toggleLibraryGroup = (label: string) => {
    setCollapsedLibraryGroups((currentGroups) => {
      const nextGroups = new Set(currentGroups);

      if (nextGroups.has(label)) {
        nextGroups.delete(label);
      } else {
        nextGroups.add(label);
      }

      return nextGroups;
    });
  };

  const getLibraryEmptyMessage = () => {
    if (libraryFilter === "watching") {
      return "Nenhuma série com episódios em andamento.";
    }

    if (libraryFilter === "waiting") {
      return "Nenhuma série aguardando novas temporadas.";
    }

    if (libraryFilter === "finished") {
      return "Nenhuma série finalizada por enquanto.";
    }

    if (libraryFilter === "abandoned") {
      return "Nenhuma série largada por enquanto.";
    }

    return "Nenhuma série encontrada na biblioteca.";
  };

  const getLibrarySeriesMeta = (series: TrackedSeries) => {
    const status = getLibrarySeriesStatus(series);

    if (status === "finished") {
      return "Finalizada";
    }

    if (status === "waiting") {
      return "Aguardando nova temporada";
    }

    if (status === "abandoned") {
      return "Abandonada";
    }

    if (status === "watching") {
      return `${series.completed_percent}% assistido`;
    }

    return "Ainda não iniciada";
  };

  const selectedSeriesDetails = useMemo(() => {
    if (!selectedSeries) return [];

    return [
      {
        label: "Status",
        value: getLibrarySeriesMeta(selectedSeries),
      },
      {
        label: "Temporadas",
        value: String(selectedSeries.number_of_seasons ?? seasonGroups.length),
      },
      {
        label: "Episódios",
        value: selectedEpisodeTotals.regular
          ? String(selectedEpisodeTotals.regular)
          : String(selectedSeries.number_of_episodes ?? 0),
      },
      {
        label: "Primeiro episódio",
        value: formatDate(selectedSeries.first_air_date),
      },
      {
        label: "Último episódio",
        value: formatDate(selectedSeries.last_air_date),
      },
    ];
  }, [selectedEpisodeTotals, selectedSeries, seasonGroups.length]);

  const renderLibraryCard = (series: TrackedSeries) => {
    const seriesStatus = getLibrarySeriesStatus(series);
    const StatusIcon =
      seriesStatus === "notStarted" ? undefined : libraryStatusIcons[seriesStatus];

    return (
      <button
        key={series.id}
        type="button"
        className={`library-card ${selectedSeries?.id === series.id ? "selected" : ""}`}
        onClick={() => setSelectedSeries(series)}
      >
        {libraryFilter === "all" && StatusIcon && (
          <span
            className={`library-status-badge library-status-badge-${seriesStatus}`}
            aria-label={getLibrarySeriesMeta(series)}
            title={getLibrarySeriesMeta(series)}
          >
            <StatusIcon aria-hidden="true" />
          </span>
        )}
        <MediaImage
          path={series.poster_path}
          alt={`Capa de ${series.title}`}
          className="library-poster"
          fallback="Sem capa"
          size="w342"
        />
        <span className="library-card-copy">
          <strong>{series.title}</strong>
          <small>{getLibrarySeriesMeta(series)}</small>
          <span className="progress-track">
            <span
              className="progress-fill"
              style={{ width: `${series.completed_percent}%` }}
            />
          </span>
        </span>
      </button>
    );
  };

  const hasLibraryGroups = groupedLibrarySeries.some(
    (group) => group.series.length > 0,
  );

  const scrollContinueWatching = (direction: "left" | "right") => {
    const container = continueScrollRef.current;
    if (!container) return;

    const distance = Math.round(container.clientWidth * 0.78);
    container.scrollBy({
      left: direction === "left" ? -distance : distance,
      behavior: "smooth",
    });
  };

  const handleContinueWatchingWheel = (
    event: WheelEvent<HTMLDivElement>,
  ) => {
    const container = event.currentTarget;
    if (container.scrollWidth <= container.clientWidth) return;

    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    const maxScrollLeft = container.scrollWidth - container.clientWidth;
    const nextScrollLeft = Math.max(
      0,
      Math.min(maxScrollLeft, container.scrollLeft + delta),
    );

    if (nextScrollLeft !== container.scrollLeft) {
      event.preventDefault();
      container.scrollLeft = nextScrollLeft;
    }
  };

  const installApp = async () => {
    if (!installPrompt) return;

    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const navItems: { id: ActiveTab | "search"; label: string; icon: LucideIcon }[] = [
    { id: "home", label: "Início", icon: Home },
    { id: "tracked", label: "Biblioteca", icon: Library },
    { id: "calendar", label: "Calendário", icon: CalendarDays },
    { id: "stats", label: "Estatísticas", icon: BarChart3 },
    { id: "search", label: "Buscar", icon: Search },
  ];

  return (
    <div className="app-shell">
      <main className="app-main">
        {activeTab === "home" && (
          <header className="home-header">
            <div className="brand-mark" aria-label="Series Vault">
              <span className="series">Series</span>
              <strong className="vault">Vault</strong>
            </div>
            {activeTab === "home" && auth.isConfigured && (
              <div className="cloud-auth">
                {auth.user?.picture && (
                  <img
                    className="cloud-avatar"
                    src={auth.user.picture}
                    alt={auth.user.name || "Usuário Google"}
                  />
                )}
                <span className={`cloud-status cloud-status-${syncStatus}`}>
                  {syncLabel}
                </span>
                {auth.isSignedIn ? (
                  <button
                    type="button"
                    className="cloud-button"
                    onClick={auth.signOut}
                  >
                    Sair
                  </button>
                ) : (
                  <button
                    type="button"
                    className="cloud-button"
                    onClick={auth.signIn}
                    disabled={auth.isLoading}
                  >
                    Entrar
                  </button>
                )}
              </div>
            )}
          </header>
        )}

        {activeTab === "home" && (
          <section className="home-view">
            <div className="greeting-block">
              <span className="greeting-copy">
                <h1>
                  {getGreeting()}, {auth.user?.name?.split(" ")[0] ?? "Leandro"}!
                </h1>
                <p>Pronto para mais uma maratona?</p>
              </span>
              {installPrompt && !isAppInstalled && (
                <span className="greeting-actions">
                  <button
                    type="button"
                    className="icon-button install-button"
                    aria-label="Instalar app"
                    onClick={installApp}
                  >
                    <Download aria-hidden="true" />
                  </button>
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
                        <span
                          className={`metric-icon metric-icon-${metric.tone}`}
                        >
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
                <h2>Continue assistindo</h2>
                <span className="section-actions">
                  {continueWatching.length > 2 && (
                    <span className="carousel-controls">
                      <button
                        type="button"
                        className="icon-button carousel-button"
                        aria-label="Rolar para a esquerda"
                        onClick={() => scrollContinueWatching("left")}
                      >
                        <ChevronLeft aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-button carousel-button"
                        aria-label="Rolar para a direita"
                        onClick={() => scrollContinueWatching("right")}
                      >
                        <ChevronRight aria-hidden="true" />
                      </button>
                    </span>
                  )}
                  <button type="button" onClick={() => setActiveTab("tracked")}>
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
                <p className="empty-state">
                  Adicione uma série para montar sua fila.
                </p>
              ) : (
                <div
                  ref={continueScrollRef}
                  className="continue-watching-scroll"
                  onWheel={handleContinueWatchingWheel}
                >
                  {continueWatching.map((series) => (
                    <button
                      key={series.id}
                      type="button"
                      className="continue-card"
                      onClick={() => {
                        setSelectedSeries(series);
                        setActiveTab("tracked");
                      }}
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
                        <span
                          className="continue-play-button"
                          aria-hidden="true"
                        >
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
                <button type="button" onClick={() => setActiveTab("calendar")}>
                  Ver calendário
                </button>
              </div>

              {isUpcomingEpisodeLoading ? (
                <div
                  className="upcoming-card upcoming-card-skeleton"
                  aria-hidden="true"
                >
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
                      onClick={() => {
                        if (episode.source === "watchlist" && episode.series) {
                          setSelectedSeries(episode.series);
                          setActiveTab("tracked");
                          return;
                        }

                        setActiveTab("calendar");
                      }}
                    >
                      <MediaImage
                        path={episode.still_path ?? episode.series_poster_path}
                        alt={`Imagem de ${episode.title ?? episode.series_title ?? "episódio"}`}
                        className="upcoming-poster"
                        fallback="Sem imagem"
                        size="w300"
                      />
                      <span>
                        <strong>
                          {episode.series_title ?? "Série acompanhada"}
                        </strong>
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
        )}

        {activeTab === "tracked" && (
          <section className="library-view">
            <div className="library-sticky">
              <div className="library-header">
                <div className="page-title-block">
                  <div className="brand-mark brand-mark-small" aria-label="Series Vault">
                    <span className="series">Series</span>
                    <strong className="vault">Vault</strong>
                  </div>
                  <h1>Biblioteca</h1>
                </div>
                <div className="library-actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Buscar séries"
                    onClick={() => setIsSearchOpen(true)}
                  >
                    <Search aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={
                      libraryViewMode === "covers"
                        ? "Visualizar em lista"
                        : "Visualizar em capas"
                    }
                    onClick={cycleLibraryViewMode}
                  >
                    {libraryViewMode === "covers" ? (
                      <List aria-hidden="true" />
                    ) : (
                      <Grid2X2 aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div
                className="library-tabs"
                role="tablist"
                aria-label="Filtros da biblioteca"
              >
                {libraryTabs.map((tab) => {
                  const TabIcon = tab.icon;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={libraryFilter === tab.id}
                      className={
                        libraryFilter === tab.id
                          ? `library-tab library-tab-${tab.id} active`
                          : `library-tab library-tab-${tab.id}`
                      }
                      onClick={() => selectLibraryFilter(tab.id)}
                    >
                      {TabIcon && (
                        <TabIcon className="library-tab-icon" aria-hidden="true" />
                      )}
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              key={libraryFilter}
              className={`library-tab-content ${libraryTabTransitionDirection}`}
            >
              {!hasLibraryGroups ? (
                <p className="empty-state">{getLibraryEmptyMessage()}</p>
              ) : (
                <div className="library-groups">
                  {groupedLibrarySeries.map((group) => {
                    const isAlphabetGroup = libraryFilter === "all" && group.label;
                    const isCollapsed =
                      isAlphabetGroup &&
                      collapsedLibraryGroups.has(group.label);

                    return (
                      <section
                        key={group.label || libraryFilter}
                        className="library-group"
                      >
                        {isAlphabetGroup && (
                          <button
                            type="button"
                            className="library-group-toggle"
                            aria-expanded={!isCollapsed}
                            onClick={() => toggleLibraryGroup(group.label)}
                          >
                            <ChevronDown
                              className={
                                isCollapsed
                                  ? "library-group-icon"
                                  : "library-group-icon expanded"
                              }
                              aria-hidden="true"
                            />
                            <span className="library-group-heading">
                              {group.label}
                            </span>
                            <span className="library-group-count">
                              {group.series.length}
                            </span>
                          </button>
                        )}

                        {!isCollapsed && (
                          <div
                            className={`library-grid library-grid-${libraryViewMode}`}
                          >
                            {group.series.map(renderLibraryCard)}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "calendar" && (
          <section className="panel grid-layout">
            <div className="page-header">
              <div className="page-title-block">
                <div className="brand-mark brand-mark-small" aria-label="Series Vault">
                  <span className="series">Series</span>
                  <strong className="vault">Vault</strong>
                </div>
                <h1>Calendário</h1>
              </div>
            </div>

            <div className="panel-inner">
              <h2>Lançamentos próximos</h2>
              {calendarEvents.length === 0 ? (
                <p className="empty-state">
                  Nenhum lançamento encontrado para os próximos 7 dias.
                </p>
              ) : (
                calendarEvents.map((item, index) => (
                  <div
                    key={index}
                    className="card card-row media-card compact-media-card"
                  >
                    <MediaImage
                      path={item.still_path ?? item.series_poster_path}
                      alt={`Imagem de ${item.title ?? item.series_title ?? "episódio"}`}
                      className="calendar-thumb"
                      fallback="Sem imagem"
                      size="w300"
                    />
                    <div className="card-copy">
                      <strong>{item.series_title}</strong>
                      <p>
                        S{item.season_number}E{item.episode_number} ·{" "}
                        {formatDate(item.air_date)}
                      </p>
                      <p className="item-description">{item.title}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="panel-inner">
              <h2>Novos episódios</h2>
              {newEpisodes.length === 0 ? (
                <p className="empty-state">
                  Nenhum episódio novo registrado desde o início do período.
                </p>
              ) : (
                newEpisodes.map((episode) => (
                  <div
                    key={episode.episode_id}
                    className="card card-row media-card compact-media-card"
                  >
                    <MediaImage
                      path={episode.still_path ?? episode.series_poster_path}
                      alt={`Imagem de ${episode.title ?? "episódio"}`}
                      className="calendar-thumb"
                      fallback="Sem imagem"
                      size="w300"
                    />
                    <div className="card-copy">
                      <strong>
                        S{episode.season_number}E{episode.episode_number}:{" "}
                        {episode.title ?? "Sem título"}
                      </strong>
                      <p>{formatDate(episode.air_date)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {activeTab === "stats" && (
          <section className="panel stats-grid">
            <div className="page-header">
              <div className="page-title-block">
                <div className="brand-mark brand-mark-small" aria-label="Series Vault">
                  <span className="series">Series</span>
                  <strong className="vault">Vault</strong>
                </div>
                <h1>Estatísticas</h1>
              </div>
            </div>

            <div className="stat-card">
              <h3>Visão geral</h3>
              <p>
                {isStatsLoading &&
                !stats.overview &&
                watchedRecords.length === 0
                  ? "..."
                  : `${totalWatchedEpisodes} episódios assistidos`}
              </p>
              <p>
                {isStatsLoading &&
                !stats.overview &&
                watchedRecords.length === 0
                  ? ""
                  : `${totalRuntimeMinutes} minutos no total`}
              </p>
            </div>

            <div className="stat-card">
              <h3>Gêneros</h3>
              <ol>
                {stats.genres.slice(0, 6).map((item) => (
                  <li key={item.genre}>
                    {item.genre}: {item.count}
                  </li>
                ))}
              </ol>
            </div>

            <div className="stat-card">
              <h3>Atores</h3>
              <ol className="image-list">
                {stats.actors.slice(0, 6).map((item) => (
                  <li key={item.actor}>
                    <MediaImage
                      path={item.profile_path}
                      alt={`Foto de ${item.actor}`}
                      className="profile-thumb"
                      fallback={item.actor.slice(0, 1)}
                      size="w185"
                    />
                    <span>
                      {item.actor}: {item.count}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="stat-card">
              <h3>Anos</h3>
              <ol>
                {stats.years.slice(0, 6).map((item) => (
                  <li key={item.year}>
                    {item.year}: {item.count}
                  </li>
                ))}
              </ol>
            </div>

            <div className="stat-card wide-card">
              <h3>Séries mais assistidas</h3>
              <ol className="poster-list">
                {stats.topSeries.slice(0, 8).map((item) => (
                  <li key={item.series}>
                    <MediaImage
                      path={item.poster_path}
                      alt={`Capa de ${item.series}`}
                      className="mini-poster"
                      fallback="Sem capa"
                      size="w185"
                    />
                    <span>
                      {item.series}: {item.count}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}
      </main>

      {selectedSeries && (
        <div
          className="series-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedSeries(null);
            }
          }}
        >
          <section
            className="series-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="series-modal-title"
          >
            <div
              className="series-modal-hero"
              style={
                selectedSeries.backdrop_path
                  ? {
                      backgroundImage: `linear-gradient(90deg, rgba(6, 10, 9, 0.92), rgba(6, 10, 9, 0.7) 46%, rgba(6, 10, 9, 0.36)), url(${tmdbImageUrl(selectedSeries.backdrop_path, "w500")})`,
                    }
                  : undefined
              }
            >
              <MediaImage
                path={selectedSeries.poster_path}
                alt={`Capa de ${selectedSeries.title}`}
                className="series-modal-poster"
                fallback="Sem capa"
                size="w342"
              />
              <div className="series-modal-title">
                <h2 id="series-modal-title">{selectedSeries.title}</h2>
                <p>{getLibrarySeriesMeta(selectedSeries)}</p>
              </div>
              <button
                type="button"
                className="icon-button series-modal-close"
                aria-label="Fechar detalhes da série"
                onClick={() => setSelectedSeries(null)}
              >
                <X aria-hidden="true" />
              </button>
            </div>

            <div className="series-modal-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={seriesModalTab === "details"}
                className={
                  seriesModalTab === "details"
                    ? "series-modal-tab active"
                    : "series-modal-tab"
                }
                onClick={() => setSeriesModalTab("details")}
              >
                Descrição
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={seriesModalTab === "seasons"}
                className={
                  seriesModalTab === "seasons"
                    ? "series-modal-tab active"
                    : "series-modal-tab"
                }
                onClick={() => setSeriesModalTab("seasons")}
              >
                Temporadas
              </button>
            </div>

            <div className="series-modal-content">
              {seriesModalTab === "details" ? (
                <div className="series-overview-panel">
                  <p className="series-overview-text">
                    {selectedSeries.overview || "Sem descrição disponível."}
                  </p>

                  <div className="series-detail-stats">
                    <div>
                      <span>Nota TMDb</span>
                      <strong>
                        {selectedSeries.vote_average
                          ? selectedSeries.vote_average.toFixed(1)
                          : "-"}
                      </strong>
                      {selectedSeries.vote_count ? (
                        <small>
                          {selectedSeries.vote_count.toLocaleString("pt-BR")} votos
                        </small>
                      ) : null}
                    </div>
                    <div>
                      <span>Assistidos</span>
                      <strong>
                        {selectedEpisodeTotals.regularWatched}/
                        {selectedEpisodeTotals.regular ||
                          selectedSeries.number_of_episodes ||
                          0}
                      </strong>
                      <small>{selectedSeries.completed_percent}% completo</small>
                    </div>
                    {selectedSeriesDetails.map((detail) => (
                      <div key={detail.label}>
                        <span>{detail.label}</span>
                        <strong>{detail.value}</strong>
                      </div>
                    ))}
                  </div>

                  {selectedSeries.genres?.length ? (
                    <div className="series-chip-list">
                      {selectedSeries.genres.map((genre) => (
                        <span key={genre} className="status-chip">
                          {genre}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <section className="series-cast-section">
                    <h3>Atores</h3>
                    {selectedSeries.actors?.length ? (
                      <div className="series-cast-list">
                        {selectedSeries.actors.slice(0, 8).map((actor) => (
                          <div key={`${actor.name}-${actor.character ?? ""}`}>
                            <MediaImage
                              path={actor.profile_path}
                              alt={`Foto de ${actor.name}`}
                              className="actor-avatar"
                              fallback={actor.name.slice(0, 1)}
                              size="w185"
                            />
                            <strong>{actor.name}</strong>
                            {actor.character && <small>{actor.character}</small>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-state">Elenco não disponível.</p>
                    )}
                  </section>
                </div>
              ) : episodes.length === 0 ? (
                <p className="empty-state">Episódios não carregados.</p>
              ) : (
                <div className="season-list series-modal-season-list">
                  {seasonGroups.map((group) => {
                    const isExpanded = expandedSeasons.has(group.seasonNumber);
                    const isSeasonComplete =
                      group.watchedCount === group.episodes.length;
                    const seasonTitle = `Temporada ${group.seasonNumber}`;

                    return (
                      <section key={group.seasonNumber} className="season-group">
                        <div className="season-header">
                          <button
                            type="button"
                            className="season-toggle"
                            aria-expanded={isExpanded}
                            onClick={() => toggleSeason(group.seasonNumber)}
                          >
                            <ChevronDown
                              className={
                                isExpanded
                                  ? "season-toggle-icon expanded"
                                  : "season-toggle-icon"
                              }
                              aria-hidden="true"
                            />
                            <span className="season-title">{seasonTitle}</span>
                            <span className="season-count">
                              {group.watchedCount}/{group.episodes.length}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="season-watch-button"
                            onClick={() =>
                              setSeasonWatchState(group, !isSeasonComplete)
                            }
                          >
                            {isSeasonComplete
                              ? "Desmarcar temporada"
                              : "Marcar temporada"}
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="season-episodes">
                            {group.episodes.map((episode) => (
                              <div
                                key={episode.id}
                                className={`card episode-card ${episode.watched ? "episode-card-watched" : ""}`}
                              >
                                <MediaImage
                                  path={episode.still_path}
                                  alt={`Imagem de ${episode.title ?? "episódio"}`}
                                  className="episode-still"
                                  fallback="Sem imagem"
                                  size="w300"
                                />
                                <div className="episode-copy">
                                  <strong>
                                    E{episode.episode_number}:{" "}
                                    {episode.title ?? "Sem título"}
                                  </strong>
                                  <p>
                                    {formatDate(episode.air_date)} ·{" "}
                                    {episode.runtime ?? 0} min
                                  </p>
                                  <p className="item-description">
                                    {episode.overview}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleEpisodeWatch(episode)}
                                >
                                  {episode.watched
                                    ? "Desmarcar"
                                    : "Marcar como visto"}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      <section
        className={isSearchOpen ? "search-drawer open" : "search-drawer"}
        aria-hidden={isSearchOpen ? "false" : "true"}
      >
        <div className="search-drawer-panel">
          <div className="search-row search-drawer-row">
            <div className="search-input-wrap">
              <Search aria-hidden="true" />
              <input
                type="text"
                placeholder="Buscar série"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    searchSeries();
                  }
                  if (event.key === "Escape") {
                    setIsSearchOpen(false);
                  }
                }}
              />
              {query && (
                <button
                  type="button"
                  className="search-clear-button"
                  aria-label="Limpar busca"
                  onClick={() => {
                    setQuery("");
                    setResults([]);
                  }}
                >
                  <X aria-hidden="true" />
                </button>
              )}
            </div>
            <button type="button" onClick={searchSeries}>
              Buscar
            </button>
          </div>

          <div className="search-results">
            {results.length === 0 ? (
              <p className="empty-state">Busque por uma série para começar.</p>
            ) : (
              results.map((item) => (
                <div key={item.tmdb_id} className="card card-row media-card">
                  <MediaImage
                    path={item.poster_path}
                    alt={`Capa de ${item.name}`}
                    className="poster-thumb"
                    fallback="Sem capa"
                    size="w185"
                  />
                  <div className="card-copy">
                    <strong>{item.name}</strong>
                    <p>{formatDate(item.first_air_date)}</p>
                    <p className="item-description">{item.overview}</p>
                  </div>
                  <button type="button" onClick={() => addSeries(item.tmdb_id)}>
                    Adicionar
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <nav className="bottom-nav" aria-label="Navegacao principal">
        {navItems.map((item) => {
          const NavIcon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              className={
                (item.id === "search" && isSearchOpen) ||
                activeTab === item.id
                  ? "bottom-nav-item active"
                  : "bottom-nav-item"
              }
              onClick={() => {
                if (item.id === "search") {
                  setIsSearchOpen((current) => !current);
                  setError("");
                  return;
                }

                setActiveTab(item.id);
                setIsSearchOpen(false);
                setError("");
              }}
            >
              <NavIcon aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <footer className="tmdb-attribution">
        This product uses the TMDb API but is not endorsed or certified by TMDb.
      </footer>

      {error && <div className="toast">{error}</div>}
    </div>
  );
}

export default App;
