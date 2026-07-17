// NOAA Storm Events ingestion CLI. This is the ONLY place that performs live
// downloads from NCEI — run it explicitly.
//
//   tsx scripts/noaa-ingest.ts list                 # list newest details files (no download)
//   tsx scripts/noaa-ingest.ts backfill VA:Fairfax  # add + backfill a county (24 mo)
//   tsx scripts/noaa-ingest.ts monthly              # refresh recent years + prune >24 mo
//
// `backfill`/`monthly` require DATABASE_URL. `list` only hits the directory index.

async function main(): Promise<void> {
  const [cmd, arg] = process.argv.slice(2);

  if (cmd === 'list') {
    const { listDetailsFiles } = await import('../src/weather/noaa/fetch.js');
    const files = await listDetailsFiles();
    for (const f of files) {
      console.log(`d${f.year}  c${f.created}  ${f.filename}`);
    }
    return;
  }

  if (cmd === 'backfill') {
    if (!arg || !arg.includes(':')) throw new Error('Usage: backfill <STATE>:<County>  e.g. VA:Fairfax');
    const [state, county] = arg.split(':');
    const { backfillCounty } = await import('../src/weather/noaa/ingest.js');
    const res = await backfillCounty({ state: state!, county: county! });
    console.log(`[backfill] ${arg}: upserted ${res.upserted} rows from ${res.files.length} file(s).`);
    return;
  }

  if (cmd === 'monthly') {
    const { monthlyRefresh } = await import('../src/weather/noaa/ingest.js');
    const res = await monthlyRefresh();
    console.log(
      `[monthly] upserted ${res.upserted}, pruned ${res.pruned}, files: ${res.files.join(', ') || '(none)'}.`,
    );
    return;
  }

  console.log('Usage: noaa-ingest.ts <list | backfill STATE:County | monthly>');
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
