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
  expectedZhr?: number;
  radiant: string;
  moonlightNotes: string;
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
  moonlightNotes: string;
}

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
    expectedZhr: 120,
    radiant: "Bootes / former Quadrans Muralis",
    moonlightNotes: "Short peak, often strong if the Moon is absent.",
    reviewStatus: "needs-review"
  },
  {
    id: "lyrids",
    name: "Lyrids",
    startMonth: 4,
    startDay: 16,
    endMonth: 4,
    endDay: 25,
    peakMonth: 4,
    peakDay: 22,
    expectedZhr: 18,
    radiant: "Lyra",
    moonlightNotes: "Moderate shower with a compact peak window.",
    reviewStatus: "needs-review"
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
    moonlightNotes: "Morning shower; darker pre-dawn skies help substantially.",
    reviewStatus: "needs-review"
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
    expectedZhr: 100,
    radiant: "Perseus",
    moonlightNotes: "Popular and reliable, but moon phase can dominate the experience.",
    reviewStatus: "needs-review"
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
    moonlightNotes: "Best in darker conditions after midnight.",
    reviewStatus: "needs-review"
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
    moonlightNotes: "Can produce strong outbursts in some years; usually modest.",
    reviewStatus: "needs-review"
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
    moonlightNotes: "Typically one of the strongest annual showers.",
    reviewStatus: "needs-review"
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
    moonlightNotes: "Small shower, but useful as a winter fallback.",
    reviewStatus: "needs-review"
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
    peakTimeUtc: entry.peakTimeUtc ?? null,
    expectedZhr: entry.expectedZhr,
    radiant: entry.radiant,
    moonlightNotes: entry.moonlightNotes
  };
}

export function getMeteorShowerOccurrencesForYear(year: number): MeteorShowerOccurrence[] {
  return METEOR_SHOWER_CATALOG.map((entry) => materializeMeteorShowerOccurrence(entry, year));
}
