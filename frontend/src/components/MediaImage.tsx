export type TmdbImageSize =
  | "w92"
  | "w185"
  | "w300"
  | "w342"
  | "w500"
  | "original";

const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

export const tmdbImageUrl = (
  path?: string,
  size: TmdbImageSize = "w342",
) => {
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

export const MediaImage = ({
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
