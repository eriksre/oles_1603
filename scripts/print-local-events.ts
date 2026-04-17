import { LocalAstronomyEventSource } from "../src/providers/astronomy/localAstronomyEventSource.ts";
import type { AstronomyEventCandidate, EventType } from "../src/domain/events.ts";
import { EVENT_TYPES } from "../src/domain/events.ts";

interface CliOptions {
  date?: string;
  end?: string;
  days: number;
  latitude?: number;
  longitude?: number;
  elevationM?: number;
  timezoneOffsetMinutes?: number;
  place?: string;
  json: boolean;
  limit?: number;
  types?: EventType[];
  nativeOnly: boolean;
  includeBelowHorizon: boolean;
  visibilityWindowHours: number;
}

const usage = `Print raw locally-derived astronomy events.

Usage:
  npm run events:local -- --date 2025-03-01 --days 31 --lat -33.8688 --lon 151.2093 --place "Sydney"
  npm run events:local -- --date 2025-03-01 --end 2025-03-31 --lat -33.8688 --lon 151.2093 --json

Options:
  --date YYYY-MM-DD|ISO      Start date/time. Date-only values start at 00:00 UTC.
  --end YYYY-MM-DD|ISO       End date/time. Date-only values end at 23:59:59.999 UTC.
  --days N                   Number of days from --date when --end is omitted. Default: 14.
  --lat N                    Observer latitude.
  --lon N                    Observer longitude.
  --elevation N              Observer elevation in meters.
  --tz-offset N              Timezone offset from UTC in minutes. Optional metadata only.
  --place TEXT               Location label printed in the summary.
  --types a,b,c              Optional event type filter.
  --limit N                  Maximum events to print.
  --native-only              Only print events from direct Astronomy Engine search APIs.
  --include-below-horizon    Include events with no local above-horizon viewing time.
  --visibility-window-hours N
                             Window before/after instant event peaks. Default: 24.
  --json                     Print raw event JSON instead of the readable table.
  --help                     Show this help.
`;

function parseNumber(value: string | undefined, flag: string): number {
  if (value === undefined) {
    throw new Error(`Missing value for ${flag}.`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${flag} must be a finite number.`);
  }

  return parsed;
}

function parseDate(value: string | undefined, flag: string, endOfDay = false): Date {
  if (!value) {
    throw new Error(`Missing required ${flag}.`);
  }

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
    : value;
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${flag} must be a valid date or ISO timestamp.`);
  }

  return date;
}

function parseEventTypes(value: string | undefined): EventType[] | undefined {
  if (!value) {
    return undefined;
  }

  const allowedTypes = new Set<string>(EVENT_TYPES);
  const types = value
    .split(",")
    .map((type) => type.trim())
    .filter(Boolean);

  for (const type of types) {
    if (!allowedTypes.has(type)) {
      throw new Error(
        `Unknown event type "${type}". Allowed values: ${EVENT_TYPES.join(", ")}`
      );
    }
  }

  return types as EventType[];
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    days: 14,
    json: false,
    nativeOnly: false,
    includeBelowHorizon: false,
    visibilityWindowHours: 24
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case "--date":
        options.date = argv[++i];
        break;
      case "--end":
        options.end = argv[++i];
        break;
      case "--days":
        options.days = parseNumber(argv[++i], "--days");
        break;
      case "--lat":
      case "--latitude":
        options.latitude = parseNumber(argv[++i], arg);
        break;
      case "--lon":
      case "--longitude":
        options.longitude = parseNumber(argv[++i], arg);
        break;
      case "--elevation":
      case "--elevation-m":
        options.elevationM = parseNumber(argv[++i], arg);
        break;
      case "--tz-offset":
      case "--timezone-offset":
        options.timezoneOffsetMinutes = parseNumber(argv[++i], arg);
        break;
      case "--place":
        options.place = argv[++i];
        break;
      case "--types":
        options.types = parseEventTypes(argv[++i]);
        break;
      case "--limit":
        options.limit = parseNumber(argv[++i], "--limit");
        break;
      case "--native-only":
        options.nativeOnly = true;
        break;
      case "--include-below-horizon":
        options.includeBelowHorizon = true;
        break;
      case "--visibility-window-hours":
        options.visibilityWindowHours = parseNumber(
          argv[++i],
          "--visibility-window-hours"
        );
        break;
      case "--json":
        options.json = true;
        break;
      case "--help":
      case "-h":
        console.log(usage);
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.date) {
    throw new Error("Missing --date.");
  }

  if (options.latitude === undefined || options.longitude === undefined) {
    throw new Error("Missing --lat and/or --lon.");
  }

  if (options.latitude < -90 || options.latitude > 90) {
    throw new Error("--lat must be between -90 and 90.");
  }

  if (options.longitude < -180 || options.longitude > 180) {
    throw new Error("--lon must be between -180 and 180.");
  }

  if (options.days <= 0) {
    throw new Error("--days must be greater than 0.");
  }

  if (options.visibilityWindowHours <= 0) {
    throw new Error("--visibility-window-hours must be greater than 0.");
  }

  return options;
}

function formatDate(date: Date): string {
  return date.toISOString();
}

function formatNumber(value: number | undefined, digits = 1): string {
  return value === undefined ? "n/a" : value.toFixed(digits);
}

function eventLines(event: AstronomyEventCandidate, index: number): string[] {
  return [
    `${index + 1}. ${event.eventType} | ${event.title}`,
    `   peak: ${formatDate(event.peakTime)}`,
    `   window: ${formatDate(event.startTime)} -> ${formatDate(event.endTime)}`,
    `   source: ${event.sourceType}/${event.sourceName} | confidence ${formatNumber(event.confidence, 2)}`,
    `   peak target: ${event.targetDirectionLabel ?? "n/a"} | az ${formatNumber(event.targetAzimuthDeg)} deg | alt ${formatNumber(event.targetAltitudeDeg)} deg`,
    `   best local view: ${event.localBestViewingTime?.toISOString() ?? "none"} | ${event.localBestViewingDirectionLabel ?? "n/a"} | az ${formatNumber(event.localBestViewingAzimuthDeg)} deg | alt ${formatNumber(event.localBestViewingAltitudeDeg)} deg`,
    `   peak sky: sun alt ${formatNumber(event.sunAltitudeDeg)} deg | moon alt ${formatNumber(event.moonAltitudeDeg)} deg | moon illum ${formatNumber(event.moonIllumination, 3)}`,
    `   best sky: sun alt ${formatNumber(event.localBestViewingSunAltitudeDeg)} deg | moon alt ${formatNumber(event.localBestViewingMoonAltitudeDeg)} deg | moon illum ${formatNumber(event.localBestViewingMoonIllumination, 3)}`,
    `   instruction: ${event.instructionText ?? "n/a"}`,
    `   description: ${event.description}`
  ];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const start = parseDate(options.date, "--date");
  const end = options.end
    ? parseDate(options.end, "--end", true)
    : new Date(start.getTime() + options.days * 24 * 60 * 60 * 1000 - 1);
  const source = new LocalAstronomyEventSource(
    {
      includeBelowHorizon: options.includeBelowHorizon,
      visibilityWindowHours: options.visibilityWindowHours,
      ...(options.nativeOnly
        ? {
            includeCloseApproaches: false,
            includePlanetParades: false
          }
        : {})
    }
  );
  const typeFilter = options.types ? new Set<EventType>(options.types) : undefined;

  if (end.getTime() < start.getTime()) {
    throw new Error("--end must be after --date.");
  }

  let events = await source.generateEvents(
    {
      latitude: options.latitude!,
      longitude: options.longitude!,
      elevationM: options.elevationM,
      timezoneOffsetMinutes: options.timezoneOffsetMinutes,
      locationLabel: options.place
    },
    { start, end }
  );

  if (typeFilter) {
    events = events.filter((event) => typeFilter.has(event.eventType));
  }

  if (options.limit !== undefined) {
    events = events.slice(0, options.limit);
  }

  if (options.json) {
    console.log(JSON.stringify(events, null, 2));
    return;
  }

  console.log(`Local astronomy events`);
  console.log(
    `mode: ${options.nativeOnly ? "native Astronomy Engine searches only" : "native searches plus local product heuristics"}`
  );
  console.log(
    `horizon filter: ${options.includeBelowHorizon ? "including below-horizon diagnostics" : `visible within ${options.visibilityWindowHours}h of instant peaks / event windows`}`
  );
  console.log(`place: ${options.place ?? "unlabeled"} (${options.latitude}, ${options.longitude})`);
  console.log(`range: ${formatDate(start)} -> ${formatDate(end)}`);
  console.log(`count: ${events.length}`);
  console.log("");

  if (events.length === 0) {
    console.log("No local events found for that range.");
    return;
  }

  console.log(
    events
      .map((event, index) => eventLines(event, index).join("\n"))
      .join("\n\n")
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  console.error("");
  console.error(usage);
  process.exit(1);
});
