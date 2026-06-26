// Human-readable datetime formatting for text that may be shown to the user
// or handed to the LLM advisor. Event timestamps are computed in UTC, so we
// shift by the observer's UTC offset (minutes) and format the resulting
// wall-clock time. Using a fixed `timeZone: "UTC"` formatter on the shifted
// instant avoids needing an IANA timezone name, which we don't carry.

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "UTC"
});

const TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "UTC"
});

const shiftToLocal = (
  date: Date,
  timezoneOffsetMinutes?: number
): { shifted: Date; hasOffset: boolean } => {
  const hasOffset =
    typeof timezoneOffsetMinutes === "number" && Number.isFinite(timezoneOffsetMinutes);
  const shifted = new Date(
    date.getTime() + (hasOffset ? (timezoneOffsetMinutes as number) : 0) * 60_000
  );

  return { shifted, hasOffset };
};

// "Sun, Jun 29, 9:42 PM" in the observer's local time (or "… UTC" when the
// offset is unknown).
export const formatLocalDateTime = (
  date: Date,
  timezoneOffsetMinutes?: number
): string => {
  const { shifted, hasOffset } = shiftToLocal(date, timezoneOffsetMinutes);
  const label = DATE_TIME_FORMAT.format(shifted);

  return hasOffset ? label : `${label} UTC`;
};

// "9:42 PM" — time only, for the second boundary of a same-day range.
export const formatLocalTime = (
  date: Date,
  timezoneOffsetMinutes?: number
): string => {
  const { shifted, hasOffset } = shiftToLocal(date, timezoneOffsetMinutes);
  const label = TIME_FORMAT.format(shifted);

  return hasOffset ? label : `${label} UTC`;
};
