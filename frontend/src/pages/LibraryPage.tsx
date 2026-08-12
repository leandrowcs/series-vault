import {
  BookmarkCheck,
  BookmarkPlus,
  BookmarkX,
  ChevronDown,
  Grid2X2,
  List,
  Search,
  Star,
  type LucideIcon,
} from "lucide-react";
import { MediaImage } from "../components/MediaImage";
import type { TrackedSeries } from "../types/series";
import type {
  LibraryFilter,
  LibrarySeriesGroup,
  LibrarySeriesStatus,
  LibraryViewMode,
  TabTransitionDirection,
} from "../types/ui";

type LibraryTab = {
  id: LibraryFilter;
  label: string;
  icon?: LucideIcon;
};

type LibraryPageProps = {
  collapsedLibraryGroups: Set<string>;
  groupedLibrarySeries: LibrarySeriesGroup[];
  hasLibraryGroups: boolean;
  libraryFilter: LibraryFilter;
  libraryTabTransitionDirection: TabTransitionDirection;
  libraryTabs: LibraryTab[];
  libraryViewMode: LibraryViewMode;
  selectedSeriesId?: number;
  onOpenSearch: () => void;
  onSelectFilter: (filter: LibraryFilter) => void;
  onSelectSeries: (series: TrackedSeries) => void;
  onToggleGroup: (groupId: string) => void;
  onToggleViewMode: () => void;
  getLibraryEmptyMessage: () => string;
  getLibrarySeriesMeta: (series: TrackedSeries) => string;
  getLibrarySeriesStatus: (series: TrackedSeries) => LibrarySeriesStatus;
};

const libraryStatusIcons: Record<
  Exclude<LibrarySeriesStatus, "notStarted">,
  LucideIcon
> = {
  watching: Star,
  waiting: BookmarkPlus,
  finished: BookmarkCheck,
  abandoned: BookmarkX,
};

export const LibraryPage = ({
  collapsedLibraryGroups,
  groupedLibrarySeries,
  hasLibraryGroups,
  libraryFilter,
  libraryTabTransitionDirection,
  libraryTabs,
  libraryViewMode,
  selectedSeriesId,
  onOpenSearch,
  onSelectFilter,
  onSelectSeries,
  onToggleGroup,
  onToggleViewMode,
  getLibraryEmptyMessage,
  getLibrarySeriesMeta,
  getLibrarySeriesStatus,
}: LibraryPageProps) => {
  const renderLibraryCard = (series: TrackedSeries) => {
    const seriesStatus = getLibrarySeriesStatus(series);
    const StatusIcon =
      seriesStatus === "notStarted" ? undefined : libraryStatusIcons[seriesStatus];

    return (
      <button
        key={series.id}
        type="button"
        className={`library-card ${selectedSeriesId === series.id ? "selected" : ""}`}
        onClick={() => onSelectSeries(series)}
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

  return (
    <section className="library-view page-view">
      <div className="page-topbar page-sticky">
        <div className="page-header">
          <div className="page-title-block">
            <div className="brand-mark brand-mark-small" aria-label="Series Vault">
              <span className="series">Series</span>
              <strong className="vault">Vault</strong>
            </div>
            <h1>Biblioteca</h1>
          </div>
          <div className="page-actions">
            <button
              type="button"
              className="icon-button"
              aria-label="Buscar séries"
              onClick={onOpenSearch}
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
              onClick={onToggleViewMode}
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
                onClick={() => onSelectFilter(tab.id)}
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
              const isCollapsed =
                group.collapsible && collapsedLibraryGroups.has(group.id);

              return (
                <section key={group.id} className="library-group">
                  {group.collapsible && (
                    <button
                      type="button"
                      className="library-group-toggle"
                      aria-expanded={!isCollapsed}
                      onClick={() => onToggleGroup(group.id)}
                    >
                      <ChevronDown
                        className={
                          isCollapsed
                            ? "library-group-icon"
                            : "library-group-icon expanded"
                        }
                        aria-hidden="true"
                      />
                      <span className="library-group-heading">{group.label}</span>
                      <span className="library-group-count">
                        {group.series.length}
                      </span>
                    </button>
                  )}

                  {!isCollapsed && (
                    <div className={`library-grid library-grid-${libraryViewMode}`}>
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
  );
};
