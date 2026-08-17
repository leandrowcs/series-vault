import type {
  PopularSeries,
  RecommendedSeries,
  TrackedSeries,
  TrendingSeries,
} from "../types/series";

const tvGenreNamesById: Record<number, string> = {
  16: "Animação",
  18: "Drama",
  35: "Comédia",
  37: "Faroeste",
  80: "Crime",
  99: "Documentário",
  9648: "Mistério",
  10751: "Família",
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
};

type CandidateSeries = PopularSeries | TrendingSeries;

type GenrePreference = {
  genre: string;
  weight: number;
};

const normalizeGenre = (genre: string) => genre.trim().toLocaleLowerCase("pt-BR");

const getSeriesGenres = (series: Pick<CandidateSeries, "genres" | "genre_ids">) => {
  const namedGenres = series.genres ?? [];
  const idGenres =
    series.genre_ids
      ?.map((genreId) => tvGenreNamesById[genreId])
      .filter((genre): genre is string => Boolean(genre)) ?? [];

  return Array.from(new Set([...namedGenres, ...idGenres]));
};

const getProfileWeight = (series: TrackedSeries) => {
  if (series.completed_percent >= 100) return 2.4;
  if (series.completed_percent > 0) return 3;
  return 0;
};

const getGenrePreferences = (trackedSeries: TrackedSeries[]) => {
  const preferencesByGenre = new Map<string, GenrePreference>();

  trackedSeries.forEach((series) => {
    if (
      series.user_status === "abandoned" ||
      series.library_status === "abandoned" ||
      series.personal_status === "abandoned"
    ) {
      return;
    }

    const profileWeight = getProfileWeight(series);
    if (profileWeight === 0) return;

    series.genres?.forEach((genre) => {
      const normalizedGenre = normalizeGenre(genre);
      const current = preferencesByGenre.get(normalizedGenre) ?? {
        genre,
        weight: 0,
      };

      preferencesByGenre.set(normalizedGenre, {
        genre: current.genre,
        weight: current.weight + profileWeight,
      });
    });
  });

  return preferencesByGenre;
};

const getRecommendationReason = (matchedGenres: string[], source: "watching" | "finished" | "mixed") => {
  const genreLabel = matchedGenres.slice(0, 2).join(" + ");

  if (source === "watching") {
    return `Combina com o que você está assistindo em ${genreLabel}.`;
  }

  if (source === "finished") {
    return `Segue o clima das séries que você terminou em ${genreLabel}.`;
  }

  return `Cruza seus gêneros favoritos: ${genreLabel}.`;
};

export const getRecommendedSeries = (
  trackedSeries: TrackedSeries[],
  candidates: CandidateSeries[],
  limit?: number,
): RecommendedSeries[] => {
  const genrePreferences = getGenrePreferences(trackedSeries);
  if (genrePreferences.size === 0) return [];

  const trackedTmdbIds = new Set(trackedSeries.map((series) => series.tmdb_id));
  const watchingGenres = new Set(
    trackedSeries
      .filter((series) => series.completed_percent > 0 && series.completed_percent < 100)
      .flatMap((series) => series.genres ?? [])
      .map(normalizeGenre),
  );
  const finishedGenres = new Set(
    trackedSeries
      .filter((series) => series.completed_percent >= 100)
      .flatMap((series) => series.genres ?? [])
      .map(normalizeGenre),
  );

  return Array.from(
    new Map(candidates.map((candidate) => [candidate.tmdb_id, candidate])).values(),
  )
    .filter((candidate) => !trackedTmdbIds.has(candidate.tmdb_id))
    .map((candidate) => {
      const candidateGenres = getSeriesGenres(candidate);
      const matchedGenres = candidateGenres.filter((genre) =>
        genrePreferences.has(normalizeGenre(genre)),
      );
      const genreScore = matchedGenres.reduce(
        (score, genre) => score + (genrePreferences.get(normalizeGenre(genre))?.weight ?? 0),
        0,
      );
      const ratingScore = Number(candidate.vote_average ?? 0) * 0.35;
      const popularityScore = Math.min(Number(candidate.popularity ?? 0) / 100, 2);
      const recommendationScore = genreScore + ratingScore + popularityScore;
      const hasWatchingMatch = matchedGenres.some((genre) =>
        watchingGenres.has(normalizeGenre(genre)),
      );
      const hasFinishedMatch = matchedGenres.some((genre) =>
        finishedGenres.has(normalizeGenre(genre)),
      );
      const source =
        hasWatchingMatch && hasFinishedMatch
          ? "mixed"
          : hasWatchingMatch
            ? "watching"
            : "finished";

      return {
        ...candidate,
        genres: candidateGenres,
        matchedGenres,
        recommendationReason: getRecommendationReason(matchedGenres, source),
        recommendationScore,
      };
    })
    .filter((candidate) => candidate.matchedGenres.length > 0)
    .filter((candidate) => Number(candidate.vote_average ?? 0) >= 6.8)
    .sort(
      (seriesA, seriesB) =>
        seriesB.recommendationScore - seriesA.recommendationScore ||
        Number(seriesB.vote_count ?? 0) - Number(seriesA.vote_count ?? 0),
    )
    .slice(0, limit);
};
