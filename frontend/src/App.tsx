import { useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import axios from "axios";
import {
  BarChart3,
  CalendarDays,
  BookmarkCheck,
  BookmarkPlus,
  BookmarkX,
  ChevronDown,
  Clock3,
  Home,
  Library,
  Play,
  Search,
  Star,
  Square,
  SquareCheckBig,
  Tv,
  X,
  type LucideIcon,
} from "lucide-react";
import { MediaImage, tmdbImageUrl } from "./components/MediaImage";
import { useCloudAuth } from "./hooks/useCloudAuth";
import { useGoogleDriveBackup } from "./hooks/useGoogleDriveBackup";
import { usePushNotifications } from "./hooks/usePushNotifications";
import {
  deleteCloudTrackedSeries,
  deleteCloudWatchedEpisodesForSeries,
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
  StreamingProvider,
  TopSeriesStat,
  PopularSeries,
  RecommendedSeries,
  TrendingSeries,
  TrackedSeries,
  UpcomingEpisodeItem,
  WatchedEpisodeRecord,
  YearStat,
} from "./types/series";
import { CalendarPage } from "./pages/CalendarPage";
import { HomePage } from "./pages/HomePage";
import { LibraryPage } from "./pages/LibraryPage";
import { LoginPage } from "./pages/LoginPage";
import { StatsPage } from "./pages/StatsPage";
import {
  addMonths,
  formatDate,
  formatLongDate,
  formatMonthLabel,
  getCalendarDays,
  getDateKey,
  getMonthEnd,
  getMonthStart,
  isSameMonth,
  toDateKey,
  type CalendarDayCell,
} from "./utils/date";
import { getRecommendedSeries } from "./utils/recommendations";
import type {
  ActiveTab,
  DashboardMetric,
  LibraryFilter,
  LibrarySeriesGroup,
  LibrarySeriesStatus,
  LibraryViewMode,
  SeriesActionValue,
  SeriesModalTab,
  TabTransitionDirection,
} from "./types/ui";
import "./App.css";

type SeasonEpisodeGroup = {
  seasonNumber: number;
  episodes: EpisodeDetail[];
  watchedCount: number;
  name?: string;
  posterPath?: string;
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

const seriesModalTabOrder: SeriesModalTab[] = ["details", "seasons"];
const activeTabs = new Set<ActiveTab>(["home", "tracked", "calendar", "stats"]);

const getInitialActiveTab = (): ActiveTab => {
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab && activeTabs.has(tab as ActiveTab) ? (tab as ActiveTab) : "home";
};

const configuredApiBaseUrl = String(
  import.meta.env.VITE_API_BASE_URL ?? "",
).trim();
const apiBaseUrl = configuredApiBaseUrl || "/api";
const hasApi = Boolean(apiBaseUrl);

const api = axios.create({
  baseURL: apiBaseUrl,
  headers: { "Content-Type": "application/json" },
});

const parseEpisodeReleaseTime = (dateString?: string) => {
  const normalizedDate = dateString?.trim();
  if (!normalizedDate) return undefined;

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    const [year, month, day] = normalizedDate.split("-").map(Number);
    return new Date(year, month - 1, day).getTime();
  }

  const releaseTime = new Date(normalizedDate).getTime();
  return Number.isNaN(releaseTime) ? undefined : releaseTime;
};

const isEpisodeReleased = (episode: EpisodeDetail, now = new Date()) => {
  const releaseTime = parseEpisodeReleaseTime(episode.air_date);
  return releaseTime !== undefined && releaseTime <= now.getTime();
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

const getTmdbStarCount = (rating?: number) =>
  Math.max(0, Math.min(5, Math.round(Number(rating ?? 0) / 2)));

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

const getTrackedSeriesLibraryStatus = (
  series: TrackedSeries,
  episodeCache: Record<string, EpisodeDetail[]> = {},
  watchedEpisodeKeys: Set<string> = new Set(),
): LibrarySeriesStatus => {
  if (isSeriesAbandoned(series)) {
    return "abandoned";
  }

  const regularEpisodes =
    episodeCache[String(series.tmdb_id)]?.filter(
      (episode) => episode.season_number > 0,
    ) ?? [];

  if (regularEpisodes.length > 0) {
    const releasedEpisodes = regularEpisodes.filter((episode) =>
      isEpisodeReleased(episode),
    );
    const watchedReleasedEpisodes = releasedEpisodes.filter((episode) =>
      watchedEpisodeKeys.has(getEpisodeKey(episode)),
    );
    const hasUpcomingEpisodes = releasedEpisodes.length < regularEpisodes.length;

    if (
      watchedReleasedEpisodes.length > 0 &&
      watchedReleasedEpisodes.length === releasedEpisodes.length &&
      hasUpcomingEpisodes
    ) {
      return "waiting";
    }
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
  watch_providers: series.watch_providers,
  user_status: series.user_status,
  library_status: series.library_status,
  personal_status: series.personal_status,
  last_synced_at: series.last_synced_at ?? new Date().toISOString(),
});

function App() {
  const auth = useCloudAuth();
  const drive = useGoogleDriveBackup(auth.driveAccessToken);
  const pushNotifications = usePushNotifications(auth.user?.uid);
  const continueScrollRef = useRef<HTMLDivElement | null>(null);
  const trendingScrollRef = useRef<HTMLDivElement | null>(null);
  const recommendedScrollRef = useRef<HTMLDivElement | null>(null);
  const popularScrollRef = useRef<HTMLDivElement | null>(null);
  const requestedSeriesModalTabRef = useRef<SeriesModalTab>("details");
  const requestedExpandedSeasonRef = useRef<number | null>(null);
  const requestedEpisodeRef = useRef<EpisodeDetail | null>(null);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>(getInitialActiveTab);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [trendingSeries, setTrendingSeries] = useState<TrendingSeries[]>([]);
  const [popularSeries, setPopularSeries] = useState<PopularSeries[]>([]);
  const [recommendedPage, setRecommendedPage] = useState(0);
  const [tracked, setTracked] = useState<TrackedSeries[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<TrackedSeries | null>(
    null,
  );
  const [selectedEpisode, setSelectedEpisode] = useState<EpisodeDetail | null>(
    null,
  );
  const [seriesModalTab, setSeriesModalTab] =
    useState<SeriesModalTab>("details");
  const [seriesModalTabTransitionDirection, setSeriesModalTabTransitionDirection] =
    useState<TabTransitionDirection>("slide-left");
  const [episodes, setEpisodes] = useState<EpisodeDetail[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [newEpisodes, setNewEpisodes] = useState<CalendarNewEpisode[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() =>
    getMonthStart(new Date()),
  );
  const [isCalendarMonthPanelExpanded, setIsCalendarMonthPanelExpanded] =
    useState(true);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<
    string | null
  >(null);
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
  const [isTrendingLoading, setIsTrendingLoading] = useState(false);
  const [isPopularLoading, setIsPopularLoading] = useState(false);
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
  const [watchProvidersBySeries, setWatchProvidersBySeries] = useState<
    Record<number, StreamingProvider[]>
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
    useState<TabTransitionDirection>("slide-left");
  const [libraryViewMode, setLibraryViewMode] =
    useState<LibraryViewMode>("covers");
  const [seasonToScroll, setSeasonToScroll] = useState<number | null>(null);

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

    const cloudUser = auth.user;
    let cancelled = false;

    const loadCloudData = async () => {
      try {
        setSyncStatus("syncing");
        await publishCloudProfile(cloudUser.uid, cloudUser);

        const [cloudTracked, cloudWatched, driveBackup] = await Promise.all([
          loadCloudTrackedSeries(cloudUser.uid),
          loadCloudWatchedEpisodes(cloudUser.uid),
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
      const { startDate, endDate } = getCalendarFetchRange(activeTab);

      fetchCalendar(startDate, endDate);
    }
    if (activeTab === "tracked") {
      fetchTracked();
    }
    if (activeTab === "home" || activeTab === "stats") {
      fetchStats();
    }
    if (activeTab === "home") {
      fetchTrendingSeries();
      fetchPopularSeries();
    }
  }, [activeTab, calendarMonth]);

  useEffect(() => {
    if (selectedSeries) {
      const requestedExpandedSeason = requestedExpandedSeasonRef.current;
      const requestedEpisode = requestedEpisodeRef.current;

      setEpisodes([]);
      setExpandedSeasons(
        requestedExpandedSeason === null
          ? new Set()
          : new Set([requestedExpandedSeason]),
      );
      setSelectedEpisode(requestedEpisode);
      setSeriesModalTab(requestedSeriesModalTabRef.current);

      requestedSeriesModalTabRef.current = "details";
      requestedExpandedSeasonRef.current = null;
      requestedEpisodeRef.current = null;

      if (requestedExpandedSeason !== null) {
        setSeasonToScroll(requestedExpandedSeason);
      }
    }
  }, [selectedSeries?.tmdb_id]);

  useEffect(() => {
    if (!selectedSeries) return;
    const selectedTrackedSeries = tracked.find(
      (series) => series.tmdb_id === selectedSeries.tmdb_id,
    );
    if (selectedTrackedSeries) {
      fetchSeriesEpisodes(selectedTrackedSeries.id);
    }
  }, [selectedSeries?.tmdb_id, tracked]);

  useEffect(() => {
    if (!selectedSeries) return;

    const selectedTrackedSeries = tracked.find(
      (series) => series.tmdb_id === selectedSeries.tmdb_id,
    );

    if (selectedSeries.watch_providers?.length) {
      setWatchProvidersBySeries((current) => ({
        ...current,
        [selectedSeries.id]: selectedSeries.watch_providers ?? [],
      }));
      return;
    }

    if (
      !hasApi ||
      !selectedTrackedSeries ||
      watchProvidersBySeries[selectedTrackedSeries.id]
    ) {
      return;
    }

    let cancelled = false;

    const fetchWatchProviders = async () => {
      try {
        const response = await api.get<StreamingProvider[]>(
          "/series",
          {
            params: {
              route: "watch-providers",
              seriesId: selectedTrackedSeries.id,
            },
          },
        );
        const providers = getArrayResponse<StreamingProvider>(
          response.data,
          "serviços de streaming",
        );

        if (!cancelled) {
          setWatchProvidersBySeries((current) => ({
            ...current,
            [selectedTrackedSeries.id]: providers,
          }));
        }
      } catch {
        if (!cancelled) {
          setWatchProvidersBySeries((current) => ({
            ...current,
            [selectedTrackedSeries.id]: [],
          }));
        }
      }
    };

    fetchWatchProviders();

    return () => {
      cancelled = true;
    };
  }, [selectedSeries, tracked, watchProvidersBySeries]);

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
          name: sortedEpisodes.find((episode) => episode.season_name)
            ?.season_name,
          posterPath: sortedEpisodes.find((episode) => episode.season_poster_path)
            ?.season_poster_path,
        };
      });
  }, [episodes]);

  useEffect(() => {
    if (seasonGroups.length === 0) {
      if (seasonToScroll === null) {
        setExpandedSeasons(new Set());
      }
      return;
    }

    setExpandedSeasons((currentExpandedSeasons) => {
      const availableSeasons = new Set(
        seasonGroups.map((group) => group.seasonNumber),
      );
      const stillAvailable = [...currentExpandedSeasons].filter(
        (seasonNumber) => availableSeasons.has(seasonNumber),
      );

      if (
        seasonToScroll !== null &&
        availableSeasons.has(seasonToScroll) &&
        !stillAvailable.includes(seasonToScroll)
      ) {
        stillAvailable.push(seasonToScroll);
      }

      return new Set(stillAvailable);
    });
  }, [seasonGroups, seasonToScroll]);

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

  useEffect(() => {
    if (
      seasonToScroll === null ||
      seriesModalTab !== "seasons" ||
      seasonGroups.length === 0
    ) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const seasonElement = document.querySelector<HTMLElement>(
        `[data-season-number="${seasonToScroll}"]`,
      );

      seasonElement?.scrollIntoView({ block: "start", behavior: "smooth" });
      setSeasonToScroll(null);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [seasonGroups, seasonToScroll, seriesModalTab]);

  const fetchTracked = async () => {
    if (!hasApi) return;

    try {
      setLoading(true);
      setIsTrackedLoading(true);
      const response = await api.get<TrackedSeries[]>("/series", {
        params: { route: "tracked" },
      });
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

  const fetchTrendingSeries = async (force = false) => {
    if (!hasApi || (!force && trendingSeries.length > 0)) return;

    try {
      setIsTrendingLoading(true);
      const response = await api.get<TrendingSeries[]>("/series", {
        params: { route: "trending" },
      });
      setTrendingSeries(
        getArrayResponse<TrendingSeries>(
          response.data,
          "séries em destaque",
        ),
      );
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao carregar séries em destaque"));
    } finally {
      setIsTrendingLoading(false);
    }
  };

  const fetchPopularSeries = async (force = false) => {
    if (!hasApi || (!force && popularSeries.length > 0)) return;

    try {
      setIsPopularLoading(true);
      const pages = await Promise.all(
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((page) =>
          api.get<PopularSeries[]>("/series", {
            params: { route: "popular", page },
          }),
        ),
      );
      const combined = pages.flatMap((page) =>
        getArrayResponse<PopularSeries>(page.data, "séries populares"),
      );
      const uniqueByTmdbId = Array.from(
        new Map(combined.map((series) => [series.tmdb_id, series])).values(),
      );
      setPopularSeries(uniqueByTmdbId);
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao carregar séries populares"));
    } finally {
      setIsPopularLoading(false);
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
    const existingSeries = tracked.find((series) => series.tmdb_id === tmdb_id);
    if (existingSeries) {
      setSelectedSeries(existingSeries);
      setActiveTab("tracked");
      setIsSearchOpen(false);
      return existingSeries;
    }

    if (!hasApi) {
      setError(
        "API TMDb não configurada neste ambiente. Configure VITE_API_BASE_URL na Vercel.",
      );
      return undefined;
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
      return addedSeries;
    } catch (err) {
      setLoading(false);
      setError(getApiErrorMessage(err, "Falha ao adicionar série"));
      return undefined;
    }
  };

  const abandonSeries = async (series: TrackedSeries) => {
    const abandonedSeries: TrackedSeries = {
      ...series,
      user_status: "abandoned",
      library_status: "abandoned",
      personal_status: "abandoned",
      last_synced_at: new Date().toISOString(),
    };

    setTracked((current) =>
      current.map((item) =>
        item.tmdb_id === series.tmdb_id ? abandonedSeries : item,
      ),
    );
    setSelectedSeries((current) =>
      current?.tmdb_id === series.tmdb_id ? abandonedSeries : current,
    );

    try {
      if (auth.user) {
        await saveCloudTrackedSeries(auth.user.uid, abandonedSeries);
      }
      if (hasApi) {
        await api
          .patch(
            "/series",
            { user_status: "abandoned" },
            {
              params: {
                route: "status",
                seriesId: series.id,
                tmdbId: series.tmdb_id,
              },
            },
          )
          .catch(() => null);
      }
    } catch (err) {
      setError("Falha ao abandonar série");
    }
  };

  const reactivateSeries = async (series: TrackedSeries) => {
    const {
      user_status: _userStatus,
      library_status: _libraryStatus,
      personal_status: _personalStatus,
      ...activeSeries
    } = series;
    const nextSeries: TrackedSeries = {
      ...activeSeries,
      last_synced_at: new Date().toISOString(),
    };

    setTracked((current) =>
      current.map((item) =>
        item.tmdb_id === series.tmdb_id ? nextSeries : item,
      ),
    );
    setSelectedSeries((current) =>
      current?.tmdb_id === series.tmdb_id ? nextSeries : current,
    );

    try {
      if (auth.user) {
        await saveCloudTrackedSeries(auth.user.uid, nextSeries);
      }
      if (hasApi) {
        await api
          .patch(
            "/series",
            { user_status: null },
            {
              params: {
                route: "status",
                seriesId: series.id,
                tmdbId: series.tmdb_id,
              },
            },
          )
          .catch(() => null);
      }
    } catch (err) {
      setError("Falha ao reativar série");
    }
  };

  const rateSeries = async (series: TrackedSeries, rating: number) => {
    const clampedRating = Math.max(0, Math.min(10, Math.round(rating * 10) / 10));
    const ratedSeries: TrackedSeries = {
      ...series,
      user_rating: clampedRating,
      last_synced_at: new Date().toISOString(),
    };

    setTracked((current) =>
      current.map((item) =>
        item.tmdb_id === series.tmdb_id ? ratedSeries : item,
      ),
    );
    setSelectedSeries((current) =>
      current?.tmdb_id === series.tmdb_id ? ratedSeries : current,
    );

    try {
      if (auth.user) {
        await saveCloudTrackedSeries(auth.user.uid, ratedSeries);
      }
    } catch (err) {
      setError("Falha ao salvar sua nota");
    }
  };

  const removeSeriesFromLibrary = async (series: TrackedSeries) => {
    setTracked((current) =>
      current.filter((item) => item.tmdb_id !== series.tmdb_id),
    );
    setSelectedSeries((current) =>
      current?.tmdb_id === series.tmdb_id ? null : current,
    );
    setEpisodes((current) =>
      selectedSeries?.tmdb_id === series.tmdb_id ? [] : current,
    );
    setEpisodeCache((current) => {
      const nextCache = { ...current };
      delete nextCache[String(series.tmdb_id)];
      return nextCache;
    });
    setCloudWatchedRecords((current) => {
      const nextRecords = new Map(current);
      nextRecords.forEach((record, key) => {
        if (record.series_tmdb_id === series.tmdb_id) {
          nextRecords.delete(key);
        }
      });
      return nextRecords;
    });

    try {
      if (auth.user) {
        await Promise.all([
          deleteCloudTrackedSeries(auth.user.uid, series),
          deleteCloudWatchedEpisodesForSeries(auth.user.uid, series),
        ]);
      }
      if (hasApi) {
        await api
          .delete("/series", {
            params: {
              seriesId: series.id,
              tmdbId: series.tmdb_id,
            },
          })
          .catch(() => null);
      }
    } catch (err) {
      setError("Falha ao remover série");
    }
  };

  const handleSeriesAction = async (
    value: SeriesActionValue,
    series: TrackedSeries,
  ) => {
    if (value === "abandon") {
      await abandonSeries(series);
      return;
    }

    if (value === "reactivate") {
      await reactivateSeries(series);
      return;
    }

    if (value === "remove") {
      await removeSeriesFromLibrary(series);
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
        "/series",
        {
          params: {
            route: "episodes",
            seriesId,
          },
        },
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
      setSelectedEpisode((currentEpisode) => {
        if (!currentEpisode) return currentEpisode;

        return (
          nextEpisodes.find(
            (episode) =>
              episode.id === currentEpisode.id ||
              (episode.season_number === currentEpisode.season_number &&
                episode.episode_number === currentEpisode.episode_number &&
                getDateKey(episode.air_date) ===
                  getDateKey(currentEpisode.air_date)),
          ) ?? currentEpisode
        );
      });

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
    if (!isEpisodeReleased(episode)) {
      setError("Este episódio ainda não foi lançado.");
      return;
    }

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
    setSelectedEpisode((currentEpisode) =>
      currentEpisode && getEpisodeKey(currentEpisode) === getEpisodeKey(episode)
        ? {
            ...currentEpisode,
            watched: shouldMarkWatched,
            progress_percent: shouldMarkWatched ? 100 : 0,
          }
        : currentEpisode,
    );
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
          await api
            .delete("/watch", {
              params: { episodeId: episode.id },
            })
            .catch(() => null);
        }
        if (auth.user) {
          await deleteCloudWatchedEpisode(auth.user.uid, episode);
        }
      } else {
        if (hasApi) {
          await api
            .patch(
              "/watch",
              {
                watched: true,
                progress_percent: 100,
              },
              {
                params: { episodeId: episode.id },
              },
            )
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
      (episode) =>
        isEpisodeReleased(episode) && episode.watched !== shouldMarkWatched,
    );
    if (changedEpisodes.length === 0) {
      setError("Nenhum episódio lançado para atualizar nesta temporada.");
      return;
    }

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
    setSelectedEpisode((currentEpisode) =>
      currentEpisode && changedEpisodeKeys.has(getEpisodeKey(currentEpisode))
        ? {
            ...currentEpisode,
            watched: shouldMarkWatched,
            progress_percent: shouldMarkWatched ? 100 : 0,
          }
        : currentEpisode,
    );
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
                .patch(
                  "/watch",
                  {
                    watched: true,
                    progress_percent: 100,
                  },
                  {
                    params: { episodeId: episode.id },
                  },
                )
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
              api
                .delete("/watch", {
                  params: { episodeId: episode.id },
                })
                .catch(() => null),
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

  const fetchCalendar = async (startDate: string, endDate: string) => {
    if (!hasApi) {
      setCalendarEvents([]);
      setNewEpisodes([]);
      return;
    }

    try {
      setIsCalendarLoading(true);
      const [calendarRes, newRes] = await Promise.all([
        api.get<CalendarEvent[]>("/calendar", {
          params: { start: startDate, end: endDate },
        }),
        api.get<CalendarNewEpisode[]>("/calendar", {
          params: { route: "new-episodes", since: startDate },
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
          api.get<OverviewStats>("/stats", {
            params: { route: "overview" },
          }),
          api.get<GenreStat[]>("/stats", {
            params: { route: "genres" },
          }),
          api.get<ActorStat[]>("/stats", {
            params: { route: "actors" },
          }),
          api.get<YearStat[]>("/stats", {
            params: { route: "years" },
          }),
          api.get<TopSeriesStat[]>("/stats", {
            params: { route: "top-series" },
          }),
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

  const getCalendarFetchRange = (tab: ActiveTab) => {
    const today = new Date();
    const targetMonth =
      tab === "calendar" ? calendarMonth : getMonthStart(today);
    const startDate = isSameMonth(targetMonth, today)
      ? toDateKey(today)
      : toDateKey(getMonthStart(targetMonth));
    const endDate = toDateKey(getMonthEnd(targetMonth));

    return { startDate, endDate };
  };

  const refreshTabData = async (tab: ActiveTab) => {
    setError("");

    if (tab === "home") {
      const { startDate, endDate } = getCalendarFetchRange(tab);
      await Promise.all([
        fetchTracked(),
        fetchCalendar(startDate, endDate),
        fetchStats(),
        fetchTrendingSeries(true),
        fetchPopularSeries(true),
      ]);
      return;
    }

    if (tab === "tracked") {
      await fetchTracked();
      return;
    }

    if (tab === "calendar") {
      const { startDate, endDate } = getCalendarFetchRange(tab);
      await fetchCalendar(startDate, endDate);
      return;
    }

    await fetchStats();
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

  const getLibrarySeriesStatus = (series: TrackedSeries) =>
    getTrackedSeriesLibraryStatus(series, episodeCache, watchedEpisodeKeys);

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
    [tracked, episodeCache, watchedEpisodeKeys],
  );

  const calendarEligibleSeries = useMemo(
    () =>
      tracked.filter((series) => {
        const status = getLibrarySeriesStatus(series);

        return (
          status === "watching" ||
          status === "waiting" ||
          status === "notStarted"
        );
      }),
    [tracked, episodeCache, watchedEpisodeKeys],
  );

  const suggestedTrendingSeries = useMemo(() => {
    const trackedTmdbIds = new Set(tracked.map((series) => series.tmdb_id));

    return trendingSeries
      .filter((series) => !trackedTmdbIds.has(series.tmdb_id))
      .sort(
        (seriesA, seriesB) =>
          Number(seriesB.vote_average ?? 0) - Number(seriesA.vote_average ?? 0),
      )
      .slice(0, 10);
  }, [tracked, trendingSeries]);

  const suggestedPopularSeries = useMemo(() => {
    const trackedTmdbIds = new Set(tracked.map((series) => series.tmdb_id));

    return popularSeries
      .filter((series) => !trackedTmdbIds.has(series.tmdb_id))
      .filter(
        (series) =>
          Number(series.vote_count ?? 0) >= 500 &&
          Number(series.vote_average ?? 0) >= 7.5,
      )
      .sort(
        (seriesA, seriesB) =>
          Number(seriesB.popularity ?? 0) - Number(seriesA.popularity ?? 0),
      )
      .slice(0, 10);
  }, [tracked, popularSeries]);

  const allRecommendedSeries = useMemo(
    () =>
      getRecommendedSeries(tracked, [
        ...popularSeries,
        ...trendingSeries,
      ]),
    [tracked, popularSeries, trendingSeries],
  );
  const recommendedSeries = useMemo(() => {
    const pageCount = Math.max(1, Math.ceil(allRecommendedSeries.length / 10));
    const page = recommendedPage % pageCount;

    return allRecommendedSeries.slice(page * 10, (page + 1) * 10);
  }, [allRecommendedSeries, recommendedPage]);

  useEffect(() => {
    if (
      (activeTab !== "home" &&
        activeTab !== "calendar" &&
        activeTab !== "stats") ||
      !hasApi
    ) {
      return;
    }

    const prefetchSeries =
      activeTab === "calendar" || activeTab === "stats"
        ? calendarEligibleSeries
        : continueWatching.slice(0, 6);

    if (prefetchSeries.length === 0) return;

    const seriesMissingEpisodes = prefetchSeries
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
                "/series",
                {
                  params: {
                    route: "episodes",
                    seriesId: series.tmdb_id,
                  },
                },
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
    calendarEligibleSeries,
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
      .map((series): UpcomingEpisodeItem | undefined => {
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
    const abandonedSeriesIds = new Set(
      tracked
        .filter((series) => getLibrarySeriesStatus(series) === "abandoned")
        .flatMap((series) => [series.id, series.tmdb_id]),
    );

    [...calendarEvents, ...newEpisodes].forEach((episode) => {
      if (abandonedSeriesIds.has(episode.series_id)) return;

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
  }, [calendarEvents, newEpisodes, tracked, episodeCache, watchedEpisodeKeys]);

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
      .filter((episode) => Boolean(episode.air_date?.trim()))
      .sort((episodeA, episodeB) => {
        const dateA = new Date(episodeA.air_date ?? "").getTime();
        const dateB = new Date(episodeB.air_date ?? "").getTime();

        if (dateA !== dateB) return dateB - dateA;

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
  const isTrendingSeriesLoading =
    isTrendingLoading && suggestedTrendingSeries.length === 0;
  const isRecommendedSeriesLoading =
    (isPopularLoading || isTrendingLoading) && recommendedSeries.length === 0;
  const isPopularSeriesLoading =
    isPopularLoading && suggestedPopularSeries.length === 0;
  const isUpcomingEpisodeLoading =
    (isCalendarLoading || isEpisodePrefetchLoading) &&
    upcomingEpisodes.length === 0;

  const todayDateKey = toDateKey(new Date());
  const isCalendarAtCurrentMonth = isSameMonth(calendarMonth, new Date());
  const canOpenPreviousCalendarMonth = !isCalendarAtCurrentMonth;
  const calendarMonthLabel = formatMonthLabel(calendarMonth);
  const calendarRangeStartDateKey = isCalendarAtCurrentMonth
    ? todayDateKey
    : toDateKey(getMonthStart(calendarMonth));
  const calendarRangeEndDateKey = toDateKey(getMonthEnd(calendarMonth));
  const calendarDays = useMemo(
    () => getCalendarDays(calendarMonth),
    [calendarMonth],
  );

  const cachedCalendarEpisodes = useMemo<UpcomingEpisodeItem[]>(() => {
    return calendarEligibleSeries.flatMap((series) => {
      const seriesEpisodes = episodeCache[String(series.tmdb_id)] ?? [];

      return seriesEpisodes
        .filter((episode) => episode.season_number > 0)
        .filter((episode) => {
          const dateKey = getDateKey(episode.air_date);

          return (
            Boolean(dateKey) &&
            dateKey! >= calendarRangeStartDateKey &&
            dateKey! <= calendarRangeEndDateKey
          );
        })
        .map((episode) => ({
          source: "watchlist" as const,
          series,
          episode_id: episode.id,
          series_id: series.id,
          series_title: series.title,
          season_number: episode.season_number,
          episode_number: episode.episode_number,
          title: episode.title,
          air_date: episode.air_date,
          still_path: episode.still_path,
          series_poster_path: series.poster_path,
          watched:
            episode.watched || watchedEpisodeKeys.has(getEpisodeKey(episode)),
        }));
    });
  }, [
    calendarEligibleSeries,
    calendarRangeEndDateKey,
    calendarRangeStartDateKey,
    episodeCache,
    watchedEpisodeKeys,
  ]);

  const calendarMonthEpisodes = useMemo<UpcomingEpisodeItem[]>(() => {
    const byEpisode = new Map<string, UpcomingEpisodeItem>();

    cachedCalendarEpisodes.forEach((episode) => {
      const dateKey = getDateKey(episode.air_date);
      if (
        !dateKey ||
        dateKey < calendarRangeStartDateKey ||
        dateKey > calendarRangeEndDateKey
      ) {
        return;
      }

      const key = [
        getDateKey(episode.air_date),
        String(episode.series_title ?? episode.series_id).toLowerCase(),
        episode.season_number,
        episode.episode_number,
      ].join("-");

      if (!byEpisode.has(key)) {
        byEpisode.set(key, episode);
      }
    });

    return Array.from(byEpisode.values())
      .sort((episodeA, episodeB) => {
        const dateA = getDateKey(episodeA.air_date) ?? "";
        const dateB = getDateKey(episodeB.air_date) ?? "";

        if (dateA !== dateB) return dateA.localeCompare(dateB);

        return String(episodeA.series_title ?? "").localeCompare(
          String(episodeB.series_title ?? ""),
          "pt-BR",
        );
      });
  }, [
    cachedCalendarEpisodes,
    calendarRangeEndDateKey,
    calendarRangeStartDateKey,
  ]);

  const calendarEpisodeCountByDate = useMemo(() => {
    const countByDate = new Map<string, number>();

    calendarMonthEpisodes.forEach((episode) => {
      const dateKey = getDateKey(episode.air_date);
      if (!dateKey) return;

      countByDate.set(dateKey, (countByDate.get(dateKey) ?? 0) + 1);
    });

    return countByDate;
  }, [calendarMonthEpisodes]);

  const visibleCalendarEpisodes = selectedCalendarDate
    ? calendarMonthEpisodes.filter(
        (episode) => getDateKey(episode.air_date) === selectedCalendarDate,
      )
    : calendarMonthEpisodes;
  const calendarListHeading = selectedCalendarDate
    ? formatLongDate(selectedCalendarDate)
    : isCalendarAtCurrentMonth
      ? `Hoje até ${formatDate(toDateKey(getMonthEnd(calendarMonth)))}`
      : formatMonthLabel(calendarMonth);
  const calendarEmptyMessage = selectedCalendarDate
    ? "Nenhum episódio encontrado para o dia selecionado."
    : isCalendarAtCurrentMonth
      ? "Nenhum lançamento encontrado de hoje até o fim do mês."
      : "Nenhum lançamento previsto para este mês.";

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
      label: "Séries em andamento",
      value: String(continueWatching.length),
      icon: Star,
      layout: "wide",
      tone: "green",
    },
  ];

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
        tracked.filter((series) => {
          const status = getLibrarySeriesStatus(series);
          return status === "waiting" || status === "notStarted";
        }),
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
  }, [tracked, libraryFilter, episodeCache, watchedEpisodeKeys]);

  const groupedLibrarySeries = useMemo<LibrarySeriesGroup[]>(() => {
    if (libraryFilter === "waiting") {
      return [
        {
          id: "waiting:not-started",
          label: "Ainda não iniciadas",
          series: sortSeriesByTitle(
            librarySeries.filter(
              (series) => getLibrarySeriesStatus(series) === "notStarted",
            ),
          ),
          collapsible: true,
        },
        {
          id: "waiting:up-to-date",
          label: "Aguardando nova temporada",
          series: sortSeriesByTitle(
            librarySeries.filter(
              (series) => getLibrarySeriesStatus(series) === "waiting",
            ),
          ),
          collapsible: true,
        },
      ].filter((group) => group.series.length > 0);
    }

    if (libraryFilter !== "all") {
      return [
        {
          id: libraryFilter,
          label: "",
          series: librarySeries,
          collapsible: false,
        },
      ];
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
    ).map((group) => ({
      id: `letter:${group.label}`,
      label: group.label,
      series: group.series,
      collapsible: true,
    }));
  }, [libraryFilter, librarySeries]);

  const openPreviousCalendarMonth = () => {
    setSelectedCalendarDate(null);
    setCalendarMonth((currentMonth) => {
      const currentMonthStart = getMonthStart(new Date());
      const previousMonth = addMonths(currentMonth, -1);

      return previousMonth < currentMonthStart ? currentMonthStart : previousMonth;
    });
  };

  const openNextCalendarMonth = () => {
    setSelectedCalendarDate(null);
    setCalendarMonth((currentMonth) => addMonths(currentMonth, 1));
  };

  const selectCalendarDay = (day: CalendarDayCell) => {
    const hasEpisodes = Boolean(calendarEpisodeCountByDate.get(day.dateKey));
    if (!day.isCurrentMonth || day.dateKey < todayDateKey || !hasEpisodes) return;

    setSelectedCalendarDate((currentDate) =>
      currentDate === day.dateKey ? null : day.dateKey,
    );
  };

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

  const openSeriesModal = (
    series: TrackedSeries,
    options: {
      tab?: SeriesModalTab;
      expandedSeason?: number;
      episode?: EpisodeDetail;
      scrollToSeason?: boolean;
    } = {},
  ) => {
    requestedSeriesModalTabRef.current = options.tab ?? "details";
    requestedExpandedSeasonRef.current = options.expandedSeason ?? null;
    requestedEpisodeRef.current = options.episode ?? null;

    if (options.scrollToSeason && options.expandedSeason !== undefined) {
      setSeasonToScroll(options.expandedSeason);
    }

    if (selectedSeries?.tmdb_id === series.tmdb_id) {
      setSeriesModalTab(options.tab ?? "details");
      setExpandedSeasons(
        options.expandedSeason === undefined
          ? new Set()
          : new Set([options.expandedSeason]),
      );
      setSelectedEpisode(options.episode ?? null);
      return;
    }

    setSelectedSeries(series);
  };

  const openTrendingSeriesDetails = (series: TrendingSeries) => {
    const trackedSeries = tracked.find((item) => item.tmdb_id === series.tmdb_id);

    openSeriesModal(
      trackedSeries ??
        normalizeTrackedSeries({
          ...series,
          id: series.tmdb_id,
          tmdb_id: series.tmdb_id,
          title: series.name,
          completed_percent: 0,
        }),
    );
  };

  const openPopularSeriesDetails = (series: PopularSeries) => {
    const trackedSeries = tracked.find((item) => item.tmdb_id === series.tmdb_id);

    openSeriesModal(
      trackedSeries ??
        normalizeTrackedSeries({
          ...series,
          id: series.tmdb_id,
          tmdb_id: series.tmdb_id,
          title: series.name,
          completed_percent: 0,
        }),
    );
  };

  const openRecommendedSeriesDetails = (series: RecommendedSeries) => {
    openPopularSeriesDetails(series);
  };

  const getInProgressSeasonNumber = (series: TrackedSeries) => {
    const seriesEpisodes = episodeCache[String(series.tmdb_id)] ?? [];
    const sortedEpisodes = [...seriesEpisodes]
      .filter((episode) => episode.season_number > 0)
      .sort(
        (episodeA, episodeB) =>
          episodeA.season_number - episodeB.season_number ||
          episodeA.episode_number - episodeB.episode_number,
      );

    const nextEpisode = sortedEpisodes.find(
      (episode) => !watchedEpisodeKeys.has(getEpisodeKey(episode)),
    );
    if (nextEpisode) return nextEpisode.season_number;

    const latestWatchedEpisode = [...watchedRecords]
      .filter((record) => record.series_tmdb_id === series.tmdb_id)
      .sort(
        (recordA, recordB) =>
          new Date(recordB.watched_at).getTime() -
          new Date(recordA.watched_at).getTime(),
      )[0];

    return latestWatchedEpisode?.season_number ?? 1;
  };

  const openContinueWatchingSeries = (series: TrackedSeries) => {
    const seasonNumber = getInProgressSeasonNumber(series);

    openSeriesModal(series, {
      tab: "seasons",
      expandedSeason: seasonNumber,
      scrollToSeason: true,
    });
  };

  const findSeriesForEpisode = (episode: UpcomingEpisodeItem) => {
    if (episode.series) return episode.series;

    return tracked.find(
      (series) =>
        series.id === episode.series_id ||
        series.tmdb_id === episode.series_id ||
        series.title === episode.series_title,
    );
  };

  const getEpisodeDetailFromItem = (
    episode: UpcomingEpisodeItem,
    series: TrackedSeries,
  ): EpisodeDetail => {
    const cachedEpisode = episodeCache[String(series.tmdb_id)]?.find(
      (item) =>
        item.id === episode.episode_id ||
        (item.season_number === episode.season_number &&
          item.episode_number === episode.episode_number &&
          getDateKey(item.air_date) === getDateKey(episode.air_date)),
    );

    if (cachedEpisode) return cachedEpisode;

    return {
      id: episode.episode_id,
      season_number: episode.season_number ?? 0,
      episode_number: episode.episode_number ?? 0,
      title: episode.title,
      air_date: episode.air_date,
      still_path: episode.still_path,
      watched: Boolean(episode.watched),
      progress_percent: episode.watched ? 100 : 0,
    };
  };

  const openEpisodeModal = (episode: UpcomingEpisodeItem) => {
    const series = findSeriesForEpisode(episode);

    if (!series) {
      setError("Não foi possível encontrar a série deste episódio.");
      return;
    }

    const episodeDetail = getEpisodeDetailFromItem(episode, series);

    openSeriesModal(series, {
      tab: "seasons",
      expandedSeason: episodeDetail.season_number,
      episode: episodeDetail,
    });
  };

  const selectSeriesModalTab = (tab: SeriesModalTab) => {
    if (tab === seriesModalTab) return;

    const currentIndex = seriesModalTabOrder.indexOf(seriesModalTab);
    const nextIndex = seriesModalTabOrder.indexOf(tab);

    setSeriesModalTabTransitionDirection(
      nextIndex > currentIndex ? "slide-left" : "slide-right",
    );
    setSeriesModalTab(tab);
  };

  const getLibraryEmptyMessage = () => {
    if (libraryFilter === "watching") {
      return "Nenhuma série com episódios em andamento.";
    }

    if (libraryFilter === "waiting") {
      return "Nenhuma série aguardando ou ainda não iniciada.";
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

  const selectedSeriesStarCount = getTmdbStarCount(
    selectedSeries?.vote_average,
  );

  const selectedTrackedSeries = selectedSeries
    ? tracked.find((series) => series.tmdb_id === selectedSeries.tmdb_id)
    : undefined;
  const isSelectedSeriesTracked = Boolean(selectedTrackedSeries);

  const selectedWatchProviders = selectedSeries
    ? (watchProvidersBySeries[selectedSeries.id] ??
      selectedSeries.watch_providers ??
      [])
    : [];

  const renderSeriesActionSelect = (
    series: TrackedSeries,
    variant: "compact" | "modal" = "compact",
  ) => {
    const isAbandoned = getLibrarySeriesStatus(series) === "abandoned";

    return (
      <select
        className={`series-action-select series-action-select-${variant}`}
        aria-label={`Ações para ${series.title}`}
        value={isAbandoned ? "abandoned" : "added"}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          const value = event.target.value as SeriesActionValue;
          if (value === "added" || value === "abandoned") return;
          void handleSeriesAction(value, series);
        }}
      >
        <option value={isAbandoned ? "abandoned" : "added"}>
          {isAbandoned ? "Largada" : "Adicionada"}
        </option>
        {isAbandoned ? (
          <option value="reactivate">Reativar</option>
        ) : (
          <option value="abandon">Abandonar</option>
        )}
        <option value="remove">Remover</option>
      </select>
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

  const scrollTrendingSeries = (direction: "left" | "right") => {
    const container = trendingScrollRef.current;
    if (!container) return;

    const distance = Math.round(container.clientWidth * 0.78);
    container.scrollBy({
      left: direction === "left" ? -distance : distance,
      behavior: "smooth",
    });
  };

  const scrollRecommendedSeries = (direction: "left" | "right") => {
    const container = recommendedScrollRef.current;
    if (!container) return;

    const distance = Math.round(container.clientWidth * 0.78);
    container.scrollBy({
      left: direction === "left" ? -distance : distance,
      behavior: "smooth",
    });
  };

  const scrollPopularSeries = (direction: "left" | "right") => {
    const container = popularScrollRef.current;
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

  if (!auth.user || !hasLoadedCloudData) {
    return (
      <div className="app-shell login-shell">
        <LoginPage
          authError={auth.error}
          isAuthLoading={auth.isLoading}
          isConfigured={auth.isConfigured}
          isLoadingUserData={Boolean(auth.user) && !hasLoadedCloudData}
          onSignIn={auth.signIn}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        {activeTab === "home" && (
          <HomePage
            authIsConfigured={auth.isConfigured}
            authIsLoading={auth.isLoading}
            authIsSignedIn={auth.isSignedIn}
            continueScrollRef={continueScrollRef}
            continueWatching={continueWatching}
            dashboardMetrics={dashboardMetrics}
            firstName={auth.user?.name?.split(" ")[0] ?? "Leandro"}
            getGreeting={getGreeting}
            getLatestEpisodeLabel={getLatestEpisodeLabel}
            installPromptAvailable={Boolean(installPrompt)}
            isAppInstalled={isAppInstalled}
            isContinueWatchingLoading={isContinueWatchingLoading}
            isDashboardLoading={isDashboardLoading}
            isRecommendedSeriesLoading={isRecommendedSeriesLoading}
            hasMoreRecommendedSeries={allRecommendedSeries.length > 10}
            isTrendingSeriesLoading={isTrendingSeriesLoading}
            isPopularSeriesLoading={isPopularSeriesLoading}
            isUpcomingEpisodeLoading={isUpcomingEpisodeLoading}
            loading={loading}
            notificationStatus={
              auth.isSignedIn ? pushNotifications.status : "unsupported"
            }
            suggestedTrendingSeries={suggestedTrendingSeries}
            recommendedSeries={recommendedSeries}
            suggestedPopularSeries={suggestedPopularSeries}
            syncLabel={syncLabel}
            syncStatus={syncStatus}
            trendingScrollRef={trendingScrollRef}
            recommendedScrollRef={recommendedScrollRef}
            popularScrollRef={popularScrollRef}
            upcomingEpisodes={upcomingEpisodes}
            userPicture={auth.user?.picture}
            onContinueWatchingWheel={handleContinueWatchingWheel}
            onGoToCalendar={() => setActiveTab("calendar")}
            onGoToLibrary={() => setActiveTab("tracked")}
            onEnableNotifications={pushNotifications.registerToken}
            onInstallApp={installApp}
            onOpenContinueWatchingSeries={openContinueWatchingSeries}
            onOpenEpisodeModal={openEpisodeModal}
            onOpenTrendingSeriesDetails={openTrendingSeriesDetails}
            onOpenRecommendedSeriesDetails={openRecommendedSeriesDetails}
            onRefreshRecommendedSeries={() => setRecommendedPage((page) => page + 1)}
            onOpenPopularSeriesDetails={openPopularSeriesDetails}
            onScrollContinueWatching={scrollContinueWatching}
            onScrollTrendingSeries={scrollTrendingSeries}
            onScrollRecommendedSeries={scrollRecommendedSeries}
            onScrollPopularSeries={scrollPopularSeries}
            onSignIn={auth.signIn}
            onSignOut={auth.signOut}
          />
        )}

        {activeTab === "tracked" && (
          <LibraryPage
            collapsedLibraryGroups={collapsedLibraryGroups}
            getLibraryEmptyMessage={getLibraryEmptyMessage}
            getLibrarySeriesMeta={getLibrarySeriesMeta}
            getLibrarySeriesStatus={getLibrarySeriesStatus}
            groupedLibrarySeries={groupedLibrarySeries}
            hasLibraryGroups={hasLibraryGroups}
            libraryFilter={libraryFilter}
            libraryTabTransitionDirection={libraryTabTransitionDirection}
            libraryTabs={libraryTabs}
            libraryViewMode={libraryViewMode}
            selectedSeriesId={selectedSeries?.id}
            onOpenSearch={() => setIsSearchOpen(true)}
            onSelectFilter={selectLibraryFilter}
            onSelectSeries={setSelectedSeries}
            onToggleGroup={toggleLibraryGroup}
            onToggleViewMode={cycleLibraryViewMode}
          />
        )}
        {activeTab === "calendar" && (
          <CalendarPage
            calendarDays={calendarDays}
            calendarEmptyMessage={calendarEmptyMessage}
            calendarEpisodeCountByDate={calendarEpisodeCountByDate}
            calendarListHeading={calendarListHeading}
            calendarMonthLabel={calendarMonthLabel}
            canOpenPreviousCalendarMonth={canOpenPreviousCalendarMonth}
            isCalendarLoading={isCalendarLoading}
            isCalendarMonthPanelExpanded={isCalendarMonthPanelExpanded}
            isEpisodePrefetchLoading={isEpisodePrefetchLoading}
            selectedCalendarDate={selectedCalendarDate}
            todayDateKey={todayDateKey}
            visibleCalendarEpisodes={visibleCalendarEpisodes}
            onClearSelectedDate={() => setSelectedCalendarDate(null)}
            onOpenNextMonth={openNextCalendarMonth}
            onOpenPreviousMonth={openPreviousCalendarMonth}
            onSelectEpisode={openEpisodeModal}
            onSelectCalendarDay={selectCalendarDay}
            onToggleMonthPanel={() =>
              setIsCalendarMonthPanelExpanded((isExpanded) => !isExpanded)
            }
          />
        )}

        {activeTab === "stats" && (
          <StatsPage
            actorStats={stats.actors}
            episodeCache={episodeCache}
            genreStats={stats.genres}
            isStatsLoading={isStatsLoading}
            topSeriesStats={stats.topSeries}
            totalRuntimeMinutes={totalRuntimeMinutes}
            totalWatchedEpisodes={totalWatchedEpisodes}
            tracked={tracked}
            watchedRecords={watchedRecords}
          />
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
                <div
                  className="series-rating-line"
                  aria-label={`Nota TMDb ${selectedSeries.vote_average?.toFixed(1) ?? "indisponível"}`}
                >
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star
                      key={index}
                      className={
                        index < selectedSeriesStarCount
                          ? "series-rating-star filled"
                          : "series-rating-star"
                      }
                      aria-hidden="true"
                    />
                  ))}
                  <span>
                    {selectedSeries.vote_average
                      ? selectedSeries.vote_average.toFixed(1)
                      : "-"}
                  </span>
                </div>
              </div>
              <div className="series-modal-actions">
                <button
                  type="button"
                  className="icon-button series-modal-close"
                  aria-label="Fechar detalhes da série"
                  onClick={() => setSelectedSeries(null)}
                >
                  <X aria-hidden="true" />
                </button>
                {isSelectedSeriesTracked && selectedTrackedSeries ? (
                  renderSeriesActionSelect(selectedTrackedSeries, "modal")
                ) : (
                  <button
                    type="button"
                    className="trending-add-button"
                    disabled={loading}
                    onClick={async () => {
                      const addedSeries = await addSeries(selectedSeries.tmdb_id);
                      if (addedSeries) {
                        setSelectedSeries(addedSeries);
                      }
                    }}
                  >
                    <BookmarkPlus aria-hidden="true" />
                    Adicionar
                  </button>
                )}
              </div>
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
                onClick={() => selectSeriesModalTab("details")}
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
                onClick={() => selectSeriesModalTab("seasons")}
              >
                Temporadas
              </button>
            </div>

            <div className="series-modal-content">
              <div
                key={seriesModalTab}
                className={`series-modal-tab-content ${seriesModalTabTransitionDirection}`}
              >
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
                      <span>Sua nota</span>
                      {isSelectedSeriesTracked && selectedTrackedSeries ? (
                        <div className="series-user-rating">
                          <div
                            className="series-user-rating-stars"
                            role="slider"
                            tabIndex={0}
                            aria-label="Sua nota para a série"
                            aria-valuemin={0}
                            aria-valuemax={10}
                            aria-valuenow={selectedTrackedSeries.user_rating ?? 0}
                            onClick={(event) => {
                              const rect =
                                event.currentTarget.getBoundingClientRect();
                              const ratio = Math.max(
                                0,
                                Math.min(1, (event.clientX - rect.left) / rect.width),
                              );
                              rateSeries(
                                selectedTrackedSeries,
                                Math.round(ratio * 10 * 2) / 2,
                              );
                            }}
                            onKeyDown={(event) => {
                              const current =
                                selectedTrackedSeries.user_rating ?? 0;
                              if (event.key === "ArrowRight") {
                                rateSeries(
                                  selectedTrackedSeries,
                                  Math.min(10, current + 0.5),
                                );
                              }
                              if (event.key === "ArrowLeft") {
                                rateSeries(
                                  selectedTrackedSeries,
                                  Math.max(0, current - 0.5),
                                );
                              }
                            }}
                          >
                            <div className="series-user-rating-stars-base">
                              {Array.from({ length: 5 }).map((_, index) => (
                                <Star key={index} aria-hidden="true" />
                              ))}
                            </div>
                            <div
                              className="series-user-rating-stars-fill"
                              style={{
                                width: `${((selectedTrackedSeries.user_rating ?? 0) / 10) * 100}%`,
                              }}
                            >
                              {Array.from({ length: 5 }).map((_, index) => (
                                <Star key={index} aria-hidden="true" />
                              ))}
                            </div>
                          </div>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={10}
                            step={0.1}
                            className="series-user-rating-input"
                            placeholder="-"
                            value={selectedTrackedSeries.user_rating ?? ""}
                            onChange={(event) => {
                              const value = event.target.valueAsNumber;
                              if (!Number.isNaN(value)) {
                                rateSeries(selectedTrackedSeries, value);
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <small>Adicione a série para avaliar</small>
                      )}
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

                  {selectedWatchProviders.length > 0 && (
                    <section className="streaming-section">
                      <h3>Onde assistir</h3>
                      <div className="streaming-provider-list">
                        {selectedWatchProviders.map((provider) => (
                          <button
                            key={`${provider.name}-${provider.type ?? ""}`}
                            type="button"
                            className="streaming-provider-button"
                          >
                            {provider.logo_path ? (
                              <img
                                src={tmdbImageUrl(provider.logo_path, "w92")}
                                alt=""
                                loading="lazy"
                              />
                            ) : (
                              <span aria-hidden="true">
                                {provider.name.slice(0, 1)}
                              </span>
                            )}
                            <strong>{provider.name}</strong>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

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
                    const releasedEpisodes = group.episodes.filter((episode) =>
                      isEpisodeReleased(episode),
                    );
                    const releasedWatchedCount = releasedEpisodes.filter(
                      (episode) => episode.watched,
                    ).length;
                    const releasedRemainingCount =
                      releasedEpisodes.length - releasedWatchedCount;
                    const isSeasonComplete =
                      group.episodes.length > 0 &&
                      group.watchedCount === group.episodes.length;
                    const isSeasonUpToDate =
                      !isSeasonComplete &&
                      releasedEpisodes.length > 0 &&
                      releasedRemainingCount === 0;
                    const isSeasonButtonDisabled =
                      releasedEpisodes.length === 0 || isSeasonUpToDate;
                    const SeasonWatchIcon = isSeasonComplete
                      ? SquareCheckBig
                      : Square;
                    const seasonWatchLabel = isSeasonButtonDisabled
                      ? isSeasonUpToDate
                        ? "Em dia"
                        : "Em breve"
                      : isSeasonComplete
                        ? "Desmarcar temporada"
                        : releasedWatchedCount > 0
                          ? "Marcar restantes"
                          : "Marcar temporada";
                    const seasonTitle = `Temporada ${group.seasonNumber}`;

                    return (
                      <section
                        key={group.seasonNumber}
                        className="season-group"
                        data-season-number={group.seasonNumber}
                      >
                        <div
                          className={
                            group.posterPath
                              ? "season-header season-header-with-art"
                              : "season-header"
                          }
                          style={
                            group.posterPath
                              ? {
                                  backgroundImage: `linear-gradient(90deg, rgba(6, 10, 9, 0.9), rgba(6, 10, 9, 0.68)), url(${tmdbImageUrl(group.posterPath, "w342")})`,
                                }
                              : undefined
                          }
                        >
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
                            className={`season-watch-button ${
                              isSeasonComplete
                                ? "watch-button-watched"
                                : "watch-button-unwatched"
                            }`}
                            disabled={isSeasonButtonDisabled}
                            title={
                              isSeasonUpToDate
                                ? "Todos os episódios lançados foram vistos. A temporada ainda não terminou."
                                : isSeasonButtonDisabled
                                ? "Disponível quando houver episódios lançados"
                                : undefined
                            }
                            aria-label={seasonWatchLabel}
                            onClick={() =>
                              setSeasonWatchState(
                                group,
                                !isSeasonComplete,
                              )
                            }
                          >
                            <SeasonWatchIcon aria-hidden="true" />
                            <span>{seasonWatchLabel}</span>
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="season-episodes">
                            {group.episodes.map((episode) => {
                              const isReleased = isEpisodeReleased(episode);
                              const EpisodeWatchIcon = episode.watched
                                ? SquareCheckBig
                                : Square;
                              const episodeWatchLabel = !isReleased
                                ? "Disponível a partir do lançamento"
                                : episode.watched
                                  ? "Desmarcar episódio visto"
                                  : "Marcar episódio como visto";

                              return (
                                <div
                                  key={episode.id}
                                  className={`card episode-card ${episode.watched ? "episode-card-watched" : ""}`}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setSelectedEpisode(episode)}
                                  onKeyDown={(event) => {
                                    if (
                                      event.key === "Enter" ||
                                      event.key === " "
                                    ) {
                                      event.preventDefault();
                                      setSelectedEpisode(episode);
                                    }
                                  }}
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
                                    className={`episode-watch-toggle ${
                                      episode.watched
                                        ? "watch-button-watched"
                                        : "watch-button-unwatched"
                                    }`}
                                    aria-label={episodeWatchLabel}
                                    disabled={!isReleased}
                                    title={episodeWatchLabel}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      toggleEpisodeWatch(episode);
                                    }}
                                  >
                                    <EpisodeWatchIcon aria-hidden="true" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
              </div>
            </div>
          </section>
        </div>
      )}

      {selectedSeries &&
        selectedEpisode &&
        (() => {
          const isSelectedEpisodeReleased = isEpisodeReleased(selectedEpisode);
          const SelectedEpisodeWatchIcon = selectedEpisode.watched
            ? SquareCheckBig
            : Square;
          const selectedEpisodeWatchLabel = !isSelectedEpisodeReleased
            ? "Em breve"
            : selectedEpisode.watched
              ? "Desmarcar episódio visto"
              : "Marcar episódio como visto";

          return (
        <div
          className="episode-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedEpisode(null);
            }
          }}
        >
          <section
            className="episode-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="episode-modal-title"
          >
            <MediaImage
              path={selectedEpisode.still_path ?? selectedSeries.poster_path}
              alt={`Imagem de ${selectedEpisode.title ?? "episódio"}`}
              className="episode-modal-image"
              fallback="Sem imagem"
              size="w500"
            />
            <div className="episode-modal-copy">
              <div className="episode-modal-heading">
                <span className="status-chip">
                  S{selectedEpisode.season_number}E
                  {selectedEpisode.episode_number}
                </span>
                <button
                  type="button"
                  className="icon-button episode-modal-close"
                  aria-label="Fechar detalhes do episódio"
                  onClick={() => setSelectedEpisode(null)}
                >
                  <X aria-hidden="true" />
                </button>
              </div>

              <h2 id="episode-modal-title">
                {selectedEpisode.title ?? "Sem título"}
              </h2>
              <p>
                {formatDate(selectedEpisode.air_date)} ·{" "}
                {selectedEpisode.runtime ?? 0} min
              </p>

              {selectedEpisode.vote_average ? (
                <div className="series-rating-line">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star
                      key={index}
                      className={
                        index < getTmdbStarCount(selectedEpisode.vote_average)
                          ? "series-rating-star filled"
                          : "series-rating-star"
                      }
                      aria-hidden="true"
                    />
                  ))}
                  <span>{selectedEpisode.vote_average.toFixed(1)}</span>
                </div>
              ) : null}

              <p className="episode-modal-overview">
                {selectedEpisode.overview || "Sem descrição disponível."}
              </p>

              <button
                type="button"
                className={`episode-modal-watch-button ${
                  selectedEpisode.watched
                    ? "watch-button-watched"
                    : "watch-button-unwatched"
                }`}
                disabled={!isSelectedEpisodeReleased}
                title={
                  isSelectedEpisodeReleased
                    ? selectedEpisodeWatchLabel
                    : "Disponível a partir do lançamento"
                }
                aria-label={selectedEpisodeWatchLabel}
                onClick={() => toggleEpisodeWatch(selectedEpisode)}
              >
                <SelectedEpisodeWatchIcon aria-hidden="true" />
                <span>{selectedEpisodeWatchLabel}</span>
              </button>
            </div>
          </section>
        </div>
          );
        })()}

      {isSearchOpen && (
        <button
          type="button"
          className="search-drawer-backdrop"
          aria-label="Fechar busca"
          onClick={() => setIsSearchOpen(false)}
        />
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
              results.map((item) => {
                const trackedSeries = tracked.find(
                  (series) => series.tmdb_id === item.tmdb_id,
                );

                return (
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
                    {trackedSeries ? (
                      renderSeriesActionSelect(trackedSeries)
                    ) : (
                      <button
                        type="button"
                        onClick={() => addSeries(item.tmdb_id)}
                      >
                        Adicionar
                      </button>
                    )}
                  </div>
                );
              })
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

                if (item.id === activeTab) {
                  void refreshTabData(item.id);
                  setIsSearchOpen(false);
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
