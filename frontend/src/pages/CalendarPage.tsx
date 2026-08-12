import {
  CalendarDays,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { MediaImage } from "../components/MediaImage";
import { UpcomingEpisodeItem } from "../types/series";
import { formatLongDate, type CalendarDayCell } from "../utils/date";

type CalendarPageProps = {
  calendarDays: CalendarDayCell[];
  calendarEmptyMessage: string;
  calendarEpisodeCountByDate: Map<string, number>;
  calendarListHeading: string;
  calendarMonthLabel: string;
  canOpenPreviousCalendarMonth: boolean;
  isCalendarLoading: boolean;
  isCalendarMonthPanelExpanded: boolean;
  isEpisodePrefetchLoading: boolean;
  selectedCalendarDate: string | null;
  todayDateKey: string;
  visibleCalendarEpisodes: UpcomingEpisodeItem[];
  onClearSelectedDate: () => void;
  onOpenNextMonth: () => void;
  onOpenPreviousMonth: () => void;
  onSelectEpisode: (episode: UpcomingEpisodeItem) => void;
  onSelectCalendarDay: (day: CalendarDayCell) => void;
  onToggleMonthPanel: () => void;
};

const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export const CalendarPage = ({
  calendarDays,
  calendarEmptyMessage,
  calendarEpisodeCountByDate,
  calendarListHeading,
  calendarMonthLabel,
  canOpenPreviousCalendarMonth,
  isCalendarLoading,
  isCalendarMonthPanelExpanded,
  isEpisodePrefetchLoading,
  selectedCalendarDate,
  todayDateKey,
  visibleCalendarEpisodes,
  onClearSelectedDate,
  onOpenNextMonth,
  onOpenPreviousMonth,
  onSelectEpisode,
  onSelectCalendarDay,
  onToggleMonthPanel,
}: CalendarPageProps) => {
  const HeaderCalendarIcon = isCalendarMonthPanelExpanded
    ? CalendarOff
    : CalendarDays;

  return (
    <section className="calendar-view page-view">
      <div className="page-topbar page-sticky">
        <div className="page-header">
          <div className="page-title-block">
            <div className="brand-mark brand-mark-small" aria-label="Series Vault">
              <span className="series">Series</span>
              <strong className="vault">Vault</strong>
            </div>
            <h1>Calendário</h1>
          </div>
          <div className="page-actions">
            <button
              type="button"
              className="icon-button"
              aria-label={
                isCalendarMonthPanelExpanded
                  ? "Recolher calendário"
                  : "Expandir calendário"
              }
              aria-expanded={isCalendarMonthPanelExpanded}
              onClick={onToggleMonthPanel}
            >
              <HeaderCalendarIcon aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="calendar-content">
        <section className="calendar-month-panel">
          <div className="calendar-month-controls">
            <button
              type="button"
              className="icon-button calendar-nav-button"
              aria-label="Mês anterior"
              disabled={!canOpenPreviousCalendarMonth}
              onClick={onOpenPreviousMonth}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <strong>{calendarMonthLabel}</strong>
            <button
              type="button"
              className="icon-button calendar-nav-button"
              aria-label="Próximo mês"
              onClick={onOpenNextMonth}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>

          {isCalendarMonthPanelExpanded && (
            <>
            <div className="calendar-weekdays" aria-hidden="true">
              {weekdays.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>

            <div className="calendar-grid" aria-label={calendarMonthLabel}>
              {calendarDays.map((day) => {
                const episodeCount =
                  calendarEpisodeCountByDate.get(day.dateKey) ?? 0;
                const isToday = day.dateKey === todayDateKey;
                const isPast = day.dateKey < todayDateKey;
                const isSelected = selectedCalendarDate === day.dateKey;
                const isSelectable =
                  day.isCurrentMonth && !isPast && episodeCount > 0;

                return (
                  <button
                    key={day.dateKey}
                    type="button"
                    className={[
                      "calendar-day",
                      !day.isCurrentMonth ? "outside-month" : "",
                      isPast ? "past" : "",
                      isToday ? "today" : "",
                      episodeCount > 0 ? "has-episodes" : "",
                      isSelected ? "selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-label={`${day.dayNumber} de ${calendarMonthLabel}${
                      episodeCount > 0
                        ? `, ${episodeCount} episódio${
                            episodeCount > 1 ? "s" : ""
                          }`
                        : ""
                    }`}
                    aria-pressed={isSelected}
                    disabled={!isSelectable}
                    onClick={() => onSelectCalendarDay(day)}
                  >
                    <span>{day.dayNumber}</span>
                    {episodeCount > 0 && (
                      <span className="calendar-day-marker">
                        {episodeCount > 3 ? "3+" : episodeCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            </>
          )}
        </section>

        <section className="calendar-episode-section">
          <div className="calendar-list-heading">
            <h2>{calendarListHeading}</h2>
            {selectedCalendarDate && (
              <button
                type="button"
                className="icon-button"
                aria-label="Limpar filtro de data"
                onClick={onClearSelectedDate}
              >
                <X aria-hidden="true" />
              </button>
            )}
          </div>

          {isCalendarLoading || isEpisodePrefetchLoading ? (
            <div
              className="calendar-episode-card calendar-episode-card-skeleton"
              aria-hidden="true"
            >
              <span className="calendar-thumb skeleton" />
              <span>
                <span className="skeleton skeleton-text skeleton-title" />
                <span className="skeleton skeleton-text skeleton-subtitle" />
                <span className="skeleton skeleton-text skeleton-date" />
              </span>
            </div>
          ) : visibleCalendarEpisodes.length === 0 ? (
            <p className="empty-state">{calendarEmptyMessage}</p>
          ) : (
            <div className="calendar-episode-list">
              {visibleCalendarEpisodes.map((episode) => (
                <button
                  key={[
                    episode.episode_id,
                    episode.series_id,
                    episode.season_number,
                    episode.episode_number,
                  ].join("-")}
                  type="button"
                  className="calendar-episode-card"
                  onClick={() => onSelectEpisode(episode)}
                >
                  <MediaImage
                    path={episode.still_path ?? episode.series_poster_path}
                    alt={`Imagem de ${episode.title ?? episode.series_title ?? "episódio"}`}
                    className="calendar-thumb"
                    fallback="Sem imagem"
                    size="w300"
                  />
                  <div className="card-copy">
                    <small>{formatLongDate(episode.air_date)}</small>
                    <strong>{episode.series_title}</strong>
                    <p>
                      S{episode.season_number ?? "-"}E
                      {episode.episode_number ?? "-"}
                      {episode.title ? ` · ${episode.title}` : ""}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
};
