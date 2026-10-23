import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** AGENTS.md 4b.5: Lambdas log IDs and statuses only, never descriptions, notes, messages or names. */
const root = resolve(__dirname, '../amplify');

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (path.endsWith('.ts')) yield path;
  }
}

const PERSONAL = /\b(text|description|notes?|names?|email|phone|message|summary|patient|detail)\b/i;
const calls = [...sources(join(root, 'functions')), ...sources(join(root, 'auth'))].flatMap((file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .map((line, i) => ({ where: `${file.slice(root.length + 1)}:${i + 1}`, line }))
    .filter(({ line }) => /console\.(log|info|warn|error|debug)\(/.test(line)),
);

describe('Lambda logging', () => {
  it('finds the log calls it checks', () => {
    expect(calls.length).toBeGreaterThan(30);
  });

  it('never interpolates personal fields into a log line', () => {
    const bad = calls.filter(({ line }) =>
      [...line.matchAll(/\$\{([^}]*)\}/g)].some(([, expr]) => PERSONAL.test(expr) && !/error/i.test(expr)),
    );
    expect(bad.map((c) => c.where)).toEqual([]);
  });

  it('never logs a raw error object, whose message can echo the input', () => {
    const bad = calls.filter(({ line }) => /console\.\w+\((?:.*,\s*)?(?:error|err|e|cause)\s*\)/.test(line));
    expect(bad.map((c) => c.where)).toEqual([]);
  });
});
