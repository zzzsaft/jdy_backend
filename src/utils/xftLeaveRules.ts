const SINGLE_DAY_OFF_LIMIT_WHITELIST_DATES = new Set(["2026-08-10"]);

export const toLocalDateKey = (date: Date | string) => {
  if (typeof date === "string") {
    const matched = date.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (matched) {
      return `${matched[1]}-${matched[2].padStart(2, "0")}-${matched[3].padStart(
        2,
        "0"
      )}`;
    }
    date = new Date(date);
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
};

export const isSingleDayOffLimitWhitelistDate = (date: Date | string) =>
  SINGLE_DAY_OFF_LIMIT_WHITELIST_DATES.has(toLocalDateKey(date));

export const filterSingleDayOffLimitDates = (dates: Date[]) =>
  dates.filter((date) => !isSingleDayOffLimitWhitelistDate(date));

