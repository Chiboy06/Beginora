// Runs the relay's D1-style queries on Postgres (Supabase). `query` takes SQL
// with $1, $2 ... and returns the rows; any Postgres client can provide it.

// D1 uses "?" placeholders; Postgres uses $1, $2 ...
export function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Postgres returns BIGINT and COUNT(*) as strings or bigints; the relay
// compares these columns as numbers.
const NUMBER_COLUMNS = /^(n|.*_at|code_expires)$/;

function numeric(row) {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, NUMBER_COLUMNS.test(k) && v !== null ? Number(v) : v]));
}

export function d1FromPostgres(query) {
  return {
    prepare(sql) {
      const text = toPg(sql);
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async first() { const rows = await query(text, args); return rows.length ? numeric(rows[0]) : null; },
        async all() { return { results: (await query(text, args)).map(numeric) }; },
        async run() { await query(text, args); return { success: true }; },
      };
      return stmt;
    },
  };
}
