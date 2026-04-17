export interface MeteorShowerCatalogEntry {
  id: string;
  name: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  peakMonth: number;
  peakDay: number;
  peakTimeUtc?: string;
  peakTimeUtcByYear?: Readonly<Record<number, string>>;
  expectedZhr?: number;
  radiant: string;
  radiantRaDeg: number;
  radiantDecDeg: number;
  velocityKmS?: number;
  parentBody?: string;
  moonlightNotes: string;
  sourceUrl: string;
  reviewStatus: "needs-review" | "reviewed";
}

export interface MeteorShowerOccurrence {
  id: string;
  name: string;
  startTimeUtc: string;
  endTimeUtc: string;
  peakTimeUtc: string | null;
  expectedZhr?: number;
  radiant: string;
  radiantRaDeg: number;
  radiantDecDeg: number;
  velocityKmS?: number;
  parentBody?: string;
  moonlightNotes: string;
  sourceUrl: string;
}

const AMS_METEOR_SHOWER_CALENDAR =
  "https://www.amsmeteors.org/meteor-showers/meteor-shower-calendar/";

export const METEOR_SHOWER_CATALOG: readonly MeteorShowerCatalogEntry[] = [
  {
    id: "quadrantids",
    name: "Quadrantids",
    startMonth: 1,
    startDay: 1,
    endMonth: 1,
    endDay: 12,
    peakMonth: 1,
    peakDay: 3,
    peakTimeUtcByYear: {
      2026: "2026-01-04T00:36:00.000Z",
      2027: "2027-01-04T03:30:00.000Z"
    },
    expectedZhr: 120,
    radiant: "Bootes / former Quadrans Muralis",
    radiantRaDeg: 230,
    radiantDecDeg: 49,
    velocityKmS: 40.4,
    parentBody: "2003 EH",
    moonlightNotes: "Short peak, often strong if the Moon is absent.",
    sourceUrl: AMS_METEOR_SHOWER_CALENDAR,
    reviewStatus: "needs-review"
  },
  {
    id: "lyrids",
    name: "Lyrids",
    startMonth: 4,
    startDay: 14,
    endMonth: 4,
    endDay: 30,
    peakMonth: 4,
    peakDay: 22,
    peakTimeUtcByYear: {
      2026: "2026-04-22T20:00:00.000Z"
    },
    expectedZhr: 18,
    radiant: "Lyra",
    radiantRaDeg: 271,
    radiantDecDeg: 34,
    velocityKmS: 49,
    parentBody: "C/1861 G1 (Thatcher)",
    moonlightNotes: "Moderate shower with a compact peak window.",
    sourceUrl: AMS_METEOR_SHOWER_CALENDAR,
    reviewStatus: "reviewed"
  },
  {
    id: "eta-aquariids",
    name: "Eta Aquariids",
    startMonth: 4,
    startDay: 19,
    endMonth: 5,
    endDay: 28,
    peakMonth: 5,
    peakDay: 6,
    expectedZhr: 50,
    radiant: "Aquarius",
    radiantRaDeg: 338,
    radiantDecDeg: -1,
    velocityKmS: 65.4,
    parentBody: "1P/Halley",
    moonlightNotes: "Morning shower; darker pre-dawn skies help substantially.",
    sourceUrl: AMS_METEOR_SHOWER_CALENDAR,
    reviewStatus: "reviewed"
  },
  {
    id: "perseids",
    name: "Perseids",
    startMonth: 7,
    startDay: 17,
    endMonth: 8,
    endDay: 24,
    peakMonth: 8,
    peakDay: 12,
    peakTimeUtcByYear: {
      2023: "2023-08-13T08:00:00.000Z"
    },
    expectedZhr: 100,
    radiant: "Perseus",
    radiantRaDeg: 48,
    radiantDecDeg: 58.1,
    velocityKmS: 59,
    parentBody: "109P/Swift-Tuttle",
    moonlightNotes: "Popular and reliable, but moon phase can dominate the experience.",
    sourceUrl: AMS_METEOR_SHOWER_CALENDAR,
    reviewStatus: "reviewed"
  },
  {
    id: "orionids",
    name: "Orionids",
    startMonth: 10,
    startDay: 2,
    endMonth: 11,
    endDay: 7,
    peakMonth: 10,
    peakDay: 21,
    expectedZhr: 20,
    radiant: "Orion",
    radiantRaDeg: 95,
    radiantDecDeg: 15.8,
    velocityKmS: 66,
    parentBody: "1P/Halley",
    moonlightNotes: "Best in darker conditions after midnight.",
    sourceUrl: AMS_METEOR_SHOWER_CALENDAR,
    reviewStatus: "reviewed"
  },
  {
    id: "leonids",
    name: "Leonids",
    startMonth: 11,
    startDay: 6,
    endMonth: 11,
    endDay: 30,
    peakMonth: 11,
    peakDay: 17,
    expectedZhr: 15,
    radiant: "Leo",
    radiantRaDeg: 152,
    radiantDecDeg: 21.8,
    velocityKmS: 69.7,
    parentBody: "55P/Tempel-Tuttle",
    moonlightNotes: "Can produce strong outbursts in some years; usually modest.",
    sourceUrl: AMS_METEOR_SHOWER_CALENDAR,
    reviewStatus: "reviewed"
  },
  {
    id: "geminids",
    name: "Geminids",
    startMonth: 12,
    startDay: 4,
    endMonth: 12,
    endDay: 17,
    peakMonth: 12,
    peakDay: 14,
    expectedZhr: 150,
    radiant: "Gemini",
    radiantRaDeg: 112,
    radiantDecDeg: 33,
    velocityKmS: 35,
    parentBody: "3200 Phaethon",
    moonlightNotes: "Typically one of the strongest annual showers.",
    sourceUrl: AMS_METEOR_SHOWER_CALENDAR,
    reviewStatus: "reviewed"
  },
  {
    id: "ursids",
    name: "Ursids",
    startMonth: 12,
    startDay: 17,
    endMonth: 12,
    endDay: 26,
    peakMonth: 12,
    peakDay: 22,
    expectedZhr: 10,
    radiant: "Ursa Minor",
    radiantRaDeg: 217,
    radiantDecDeg: 76,
    velocityKmS: 33.1,
    parentBody: "8P/Tuttle",
    moonlightNotes: "Small shower, but useful as a winter fallback.",
    sourceUrl: AMS_METEOR_SHOWER_CALENDAR,
    reviewStatus: "reviewed"
  }
] as const;

function toIsoDate(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0)).toISOString();
}

export function materializeMeteorShowerOccurrence(
  entry: MeteorShowerCatalogEntry,
  year: number
): MeteorShowerOccurrence {
  return {
    id: `${entry.id}-${year}`,
    name: entry.name,
    startTimeUtc: toIsoDate(year, entry.startMonth, entry.startDay),
    endTimeUtc: toIsoDate(year, entry.endMonth, entry.endDay),
    peakTimeUtc: entry.peakTimeUtcByYear?.[year] ?? entry.peakTimeUtc ?? null,
    expectedZhr: entry.expectedZhr,
    radiant: entry.radiant,
    radiantRaDeg: entry.radiantRaDeg,
    radiantDecDeg: entry.radiantDecDeg,
    velocityKmS: entry.velocityKmS,
    parentBody: entry.parentBody,
    moonlightNotes: entry.moonlightNotes,
    sourceUrl: entry.sourceUrl
  };
}

export function getMeteorShowerOccurrencesForYear(year: number): MeteorShowerOccurrence[] {
  return METEOR_SHOWER_CATALOG.map((entry) => materializeMeteorShowerOccurrence(entry, year));
}
