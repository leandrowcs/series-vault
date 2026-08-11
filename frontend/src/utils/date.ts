export type CalendarDayCell = {
  date: Date;
  dateKey: string;
  dayNumber: number;
  isCurrentMonth: boolean;
};

export const formatDate = (dateString?: string) => {
  if (!dateString) return "-";
  const normalizedDate = dateString.trim();
  const dateOnlyMatch = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnlyMatch
    ? new Date(
        Number(dateOnlyMatch[1]),
        Number(dateOnlyMatch[2]) - 1,
        Number(dateOnlyMatch[3]),
      )
    : new Date(normalizedDate);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

export const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export const getDateKey = (dateString?: string) => {
  const normalizedDate = dateString?.trim();
  if (!normalizedDate) return undefined;

  const isoDateMatch = normalizedDate.match(/^\d{4}-\d{2}-\d{2}/);
  if (isoDateMatch) return isoDateMatch[0];

  const parsedDate = new Date(normalizedDate);
  if (Number.isNaN(parsedDate.getTime())) return undefined;

  return toDateKey(parsedDate);
};

export const getMonthStart = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

export const getMonthEnd = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0);

export const addMonths = (date: Date, months: number) =>
  new Date(date.getFullYear(), date.getMonth() + months, 1);

export const isSameMonth = (firstDate: Date, secondDate: Date) =>
  firstDate.getFullYear() === secondDate.getFullYear() &&
  firstDate.getMonth() === secondDate.getMonth();

export const formatMonthLabel = (date: Date) => {
  const label = date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
};

export const formatLongDate = (dateString?: string) => {
  const dateKey = getDateKey(dateString);
  if (!dateKey) return "-";

  const [year, month, day] = dateKey.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
};

export const getCalendarDays = (monthDate: Date): CalendarDayCell[] => {
  const monthStart = getMonthStart(monthDate);
  const monthEnd = getMonthEnd(monthDate);
  const calendarStart = new Date(monthStart);
  calendarStart.setDate(monthStart.getDate() - monthStart.getDay());

  const visibleDays =
    Math.ceil((monthStart.getDay() + monthEnd.getDate()) / 7) * 7;

  return Array.from({ length: visibleDays }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);

    return {
      date,
      dateKey: toDateKey(date),
      dayNumber: date.getDate(),
      isCurrentMonth: isSameMonth(date, monthDate),
    };
  });
};
