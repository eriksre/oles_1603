import { BomSpaceWeatherClient } from "../src/providers/space-weather/bom.ts";

const NOTICE_TYPES = ["alert", "watch", "outlook", "all"] as const;

type NoticeType = (typeof NOTICE_TYPES)[number];

interface CliOptions {
  notice: NoticeType;
  json: boolean;
}

const usage = `Query BOM space weather aurora notices.

Usage:
  node --env-file=.env --import tsx scripts/query-bom-aurora.ts
  node --env-file=.env --import tsx scripts/query-bom-aurora.ts --notice alert --json

Options:
  --notice alert|watch|outlook|all
                        Which BOM aurora notice to query. Default: all.
  --json                Print the raw normalized JSON payload.
  --help                Show this help.
`;

const isNoticeType = (value: string): value is NoticeType =>
  (NOTICE_TYPES as readonly string[]).includes(value);

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    notice: "all",
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--notice": {
        const value = argv[++index];

        if (!value || !isNoticeType(value)) {
          throw new Error(`--notice must be one of ${NOTICE_TYPES.join(", ")}.`);
        }

        options.notice = value;
        break;
      }
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

  return options;
}

function stringify(value: unknown): string {
  return JSON.stringify(
    value,
    (_, item) => (item instanceof Date ? item.toISOString() : item),
    2
  );
}

function printNotice(kind: Exclude<NoticeType, "all">, items: unknown[]): void {
  console.log(`${kind}: ${items.length}`);

  if (items.length > 0) {
    console.log(stringify(items));
  }

  console.log("");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const client = new BomSpaceWeatherClient();

  if (options.notice === "alert") {
    const data = await client.getAuroraAlert();
    console.log(options.json ? stringify(data) : `alert notices: ${data.length}`);
    if (!options.json && data.length > 0) {
      console.log(stringify(data));
    }
    return;
  }

  if (options.notice === "watch") {
    const data = await client.getAuroraWatch();
    console.log(options.json ? stringify(data) : `watch notices: ${data.length}`);
    if (!options.json && data.length > 0) {
      console.log(stringify(data));
    }
    return;
  }

  if (options.notice === "outlook") {
    const data = await client.getAuroraOutlook();
    console.log(options.json ? stringify(data) : `outlook notices: ${data.length}`);
    if (!options.json && data.length > 0) {
      console.log(stringify(data));
    }
    return;
  }

  const data = await client.getAuroraNotices();

  if (options.json) {
    console.log(stringify(data));
    return;
  }

  printNotice("alert", data.alert);
  printNotice("watch", data.watch);
  printNotice("outlook", data.outlook);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  console.error("");
  console.error(usage);
  process.exit(1);
});
