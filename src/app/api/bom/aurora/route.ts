import { NextResponse } from "next/server";

import { BomSpaceWeatherClient } from "../../../../providers/space-weather/bom.js";

export const runtime = "nodejs";

const NOTICE_TYPES = ["alert", "watch", "outlook", "all"] as const;

type NoticeType = (typeof NOTICE_TYPES)[number];

const isNoticeType = (value: string | null): value is NoticeType =>
  value !== null && (NOTICE_TYPES as readonly string[]).includes(value);

const serializeAlert = (alert: Awaited<ReturnType<BomSpaceWeatherClient["getAuroraAlert"]>>[number]) => ({
  kind: alert.kind,
  startTime: alert.startTime.toISOString(),
  validUntil: alert.validUntil.toISOString(),
  kAus: alert.kAus,
  latBand: alert.latBand,
  description: alert.description
});

const serializeWatch = (watch: Awaited<ReturnType<BomSpaceWeatherClient["getAuroraWatch"]>>[number]) => ({
  kind: watch.kind,
  issueTime: watch.issueTime.toISOString(),
  startDate: watch.startDate,
  endDate: watch.endDate,
  cause: watch.cause,
  kAus: watch.kAus,
  latBand: watch.latBand,
  comments: watch.comments
});

const serializeOutlook = (
  outlook: Awaited<ReturnType<BomSpaceWeatherClient["getAuroraOutlook"]>>[number]
) => ({
  kind: outlook.kind,
  issueTime: outlook.issueTime.toISOString(),
  startDate: outlook.startDate,
  endDate: outlook.endDate,
  cause: outlook.cause,
  kAus: outlook.kAus,
  latBand: outlook.latBand,
  comments: outlook.comments
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const notice = searchParams.get("notice") ?? "all";

  if (!isNoticeType(notice)) {
    return NextResponse.json(
      {
        error: `notice must be one of ${NOTICE_TYPES.join(", ")}.`
      },
      { status: 400 }
    );
  }

  try {
    const client = new BomSpaceWeatherClient();

    if (notice === "alert") {
      const alert = await client.getAuroraAlert();

      return NextResponse.json({
        provider: "bom-space-weather",
        notice,
        fetchedAt: new Date().toISOString(),
        data: alert.map(serializeAlert)
      });
    }

    if (notice === "watch") {
      const watch = await client.getAuroraWatch();

      return NextResponse.json({
        provider: "bom-space-weather",
        notice,
        fetchedAt: new Date().toISOString(),
        data: watch.map(serializeWatch)
      });
    }

    if (notice === "outlook") {
      const outlook = await client.getAuroraOutlook();

      return NextResponse.json({
        provider: "bom-space-weather",
        notice,
        fetchedAt: new Date().toISOString(),
        data: outlook.map(serializeOutlook)
      });
    }

    const data = await client.getAuroraNotices();

    return NextResponse.json({
      provider: "bom-space-weather",
      notice,
      fetchedAt: new Date().toISOString(),
      data: {
        alert: data.alert.map(serializeAlert),
        watch: data.watch.map(serializeWatch),
        outlook: data.outlook.map(serializeOutlook)
      }
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to query BOM aurora notices.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
