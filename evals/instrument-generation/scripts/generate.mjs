/**
 * Sensoraft "Natural Language -> Instrument DSL" eval dataset generator.
 *
 * Reads the hand-authored case groups from ./data-*.mjs, builds 1000 cases,
 * runs mechanical quality checks (counts, duplicate ids/prompts, near-duplicate
 * prompts, sensor validity, status consistency), and writes:
 *
 *   evals/instrument-generation/supported.jsonl
 *   evals/instrument-generation/unsupported.jsonl
 *   evals/instrument-generation/ambiguous.jsonl
 *   evals/instrument-generation/adversarial.jsonl
 *   evals/instrument-generation/multilingual.jsonl
 *   evals/instrument-generation/stats.json
 *
 * stats.json is always recomputed from the emitted cases, never hand-written.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { supportedGroups } from './data-supported.mjs';
import { unsupportedGroups } from './data-unsupported-b.mjs';
import { ambiguousGroups } from './data-ambiguous.mjs';
import { adversarialGroups } from './data-adversarial.mjs';
import { multilingualGroups } from './data-multilingual.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..');

const VALID_SENSORS = ['accelerometer', 'gyroscope', 'magnetometer'];
const VALID_STATUSES = ['success', 'unsupported'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];
const VALID_LANGUAGES = ['en', 'ja', 'es', 'fr', 'de', 'zh', 'ko'];
const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;

const FILE_SPECS = [
  { file: 'supported.jsonl', groups: supportedGroups, expectedCount: 350 },
  { file: 'unsupported.jsonl', groups: unsupportedGroups, expectedCount: 250 },
  { file: 'ambiguous.jsonl', groups: ambiguousGroups, expectedCount: 150 },
  { file: 'adversarial.jsonl', groups: adversarialGroups, expectedCount: 100 },
  { file: 'multilingual.jsonl', groups: multilingualGroups, expectedCount: 150 },
];

const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function buildCases() {
  const cases = [];
  let idCounter = 0;

  for (const spec of FILE_SPECS) {
    let fileCount = 0;
    for (const group of spec.groups) {
      for (const prompt of group.prompts) {
        idCounter += 1;
        fileCount += 1;
        cases.push({
          id: 'eval-' + String(idCounter).padStart(4, '0'),
          prompt,
          language: group.language ?? 'en',
          category: group.category,
          expected_status: group.expectedStatus,
          expected_sensor: group.expectedSensor ?? null,
          allowed_sensors: group.allowedSensors ?? [],
          forbidden_sensors: group.forbiddenSensors ?? [],
          difficulty: group.difficulty,
          tags: group.tags,
          reason: group.reason,
          _file: spec.file,
        });
      }
    }

    if (fileCount !== spec.expectedCount) {
      fail(spec.file + ' has ' + fileCount + ' cases but expected ' + spec.expectedCount + '.');
    }
  }

  if (cases.length !== 1000) {
    fail('Total case count is ' + cases.length + ' but expected 1000.');
  }

  return cases;
}

function validateCases(cases) {
  const seenIds = new Map();
  const seenPrompts = new Map();
  const tokenSets = new Map();

  for (const c of cases) {
    // --- structural validation -------------------------------------------
    if (typeof c.prompt !== 'string' || c.prompt.trim().length === 0) {
      fail(c.id + ': prompt must be a non-empty string.');
    }
    if (!VALID_LANGUAGES.includes(c.language)) {
      fail(c.id + ': invalid language ' + c.language);
    }
    if (typeof c.category !== 'string' || c.category.length === 0) {
      fail(c.id + ': invalid category');
    }
    if (!VALID_STATUSES.includes(c.expected_status)) {
      fail(c.id + ': invalid expected_status ' + c.expected_status);
    }
    if (!VALID_DIFFICULTIES.includes(c.difficulty)) {
      fail(c.id + ': invalid difficulty ' + c.difficulty);
    }
    if (!Array.isArray(c.tags) || c.tags.length === 0) {
      fail(c.id + ': tags must be a non-empty array.');
    }
    if (typeof c.reason !== 'string' || c.reason.trim().length === 0) {
      fail(c.id + ': reason must be a non-empty string.');
    }

    for (const sensor of [...c.allowed_sensors, ...c.forbidden_sensors]) {
      if (!VALID_SENSORS.includes(sensor)) {
        fail(c.id + ': invalid sensor in allowed/forbidden lists: ' + sensor);
      }
    }

    if (c.expected_sensor !== null && !VALID_SENSORS.includes(c.expected_sensor)) {
      fail(c.id + ': expected_sensor is not a Sensoraft v1 sensor: ' + c.expected_sensor);
    }

    const allowedSet = new Set(c.allowed_sensors);
    for (const sensor of c.forbidden_sensors) {
      if (allowedSet.has(sensor)) {
        fail(c.id + ': sensor appears in both allowed_sensors and forbidden_sensors: ' + sensor);
      }
    }

    // --- status consistency ----------------------------------------------
    if (c.expected_status === 'success') {
      if (c.expected_sensor === null) {
        fail(c.id + ': success case must have a valid expected_sensor.');
      } else if (!c.allowed_sensors.includes(c.expected_sensor)) {
        fail(c.id + ': success case expected_sensor must be in allowed_sensors.');
      }
      if (c.allowed_sensors.length === 0) {
        fail(c.id + ': success case must allow at least one sensor.');
      }
    } else {
      if (c.expected_sensor !== null) {
        fail(c.id + ': unsupported case must have expected_sensor null.');
      }
      if (c.allowed_sensors.length !== 0 || c.forbidden_sensors.length !== 0) {
        fail(c.id + ': unsupported case must have empty allowed/forbidden sensor lists.');
      }
    }

    // --- duplicates --------------------------------------------------------
    if (seenIds.has(c.id)) {
      fail('Duplicate id: ' + c.id);
    }
    seenIds.set(c.id, true);

    const normalized = c.prompt.replace(/\s+/g, ' ').trim().toLowerCase();
    if (seenPrompts.has(normalized)) {
      fail(
        'Duplicate prompt (case-insensitive): "' +
          c.prompt +
          '" also used by ' +
          seenPrompts.get(normalized),
      );
    }
    seenPrompts.set(normalized, c.id);
    tokenSets.set(c.id, tokenize(normalized));
  }

  // --- near-duplicate detection (Jaccard over content tokens) -------------
  const ids = cases.map((c) => c.id);
  const similarPairs = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const score = jaccard(tokenSets.get(ids[i]), tokenSets.get(ids[j]));
      if (score >= 0.6) {
        similarPairs.push({ a: ids[i], b: ids[j], score });
      }
    }
  }

  for (const pair of similarPairs) {
    if (pair.score >= 0.75) {
      const promptA = cases.find((c) => c.id === pair.a).prompt;
      const promptB = cases.find((c) => c.id === pair.b).prompt;
      fail(
        'Near-duplicate prompts (Jaccard ' +
          pair.score.toFixed(2) +
          '): ' +
          pair.a +
          ' "' +
          promptA +
          '" <-> ' +
          pair.b +
          ' "' +
          promptB +
          '"',
      );
    }
  }

  similarPairs.sort((a, b) => b.score - a.score);
  if (similarPairs.length > 0) {
    warnings.push('Prompt pairs with Jaccard >= 0.60: ' + similarPairs.length);
    for (const pair of similarPairs.slice(0, 25)) {
      const promptA = cases.find((c) => c.id === pair.a).prompt;
      const promptB = cases.find((c) => c.id === pair.b).prompt;
      warnings.push(
        '  ' +
          pair.score.toFixed(2) +
          ' ' +
          pair.a +
          ' "' +
          promptA +
          '" <-> ' +
          pair.b +
          ' "' +
          promptB +
          '"',
      );
    }
  }
}

function tokenize(normalizedPrompt) {
  const cleaned = normalizedPrompt
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = cleaned.split(' ').filter(Boolean);
  const grams = new Set();

  for (const token of tokens) {
    if (CJK_RE.test(token)) {
      if (token.length === 1) {
        grams.add(token);
      }
      for (let i = 0; i < token.length - 1; i += 1) {
        grams.add(token.slice(i, i + 2));
      }
    } else if (token.length > 1) {
      grams.add(token);
    }
  }

  return grams;
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

function computeStats(cases) {
  const tally = (key) => {
    const counts = {};
    for (const c of cases) {
      counts[key(c)] = (counts[key(c)] ?? 0) + 1;
    }
    return counts;
  };

  const byFile = {};
  const byStatusPerFile = {};
  for (const spec of FILE_SPECS) {
    const fileCases = cases.filter((c) => c._file === spec.file);
    byFile[spec.file] = fileCases.length;
    byStatusPerFile[spec.file] = tallyPer(fileCases, (c) => c.expected_status);
  }

  function tallyPer(list, key) {
    const counts = {};
    for (const c of list) counts[key(c)] = (counts[key(c)] ?? 0) + 1;
    return counts;
  }

  return {
    total: cases.length,
    by_status: tally((c) => c.expected_status),
    by_sensor: tally((c) => c.expected_sensor ?? 'none'),
    by_language: tally((c) => c.language),
    by_category: tally((c) => c.category),
    by_difficulty: tally((c) => c.difficulty),
    by_file: byFile,
    by_status_per_file: byStatusPerFile,
  };
}

function main() {
  const cases = buildCases();

  validateCases(cases);

  if (errors.length > 0) {
    console.error('VALIDATION FAILED with ' + errors.length + ' error(s):');
    for (const error of errors) console.error(' - ' + error);
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  for (const spec of FILE_SPECS) {
    const lines = cases
      .filter((c) => c._file === spec.file)
      .map((c) => {
        const { _file, ...rest } = c;
        return JSON.stringify(rest);
      });
    writeFileSync(join(OUT_DIR, spec.file), lines.join('\n') + '\n', 'utf8');
    console.log('wrote ' + spec.file + ' (' + lines.length + ' cases)');
  }

  const stats = computeStats(cases);
  writeFileSync(join(OUT_DIR, 'stats.json'), JSON.stringify(stats, null, 2) + '\n', 'utf8');
  console.log('wrote stats.json');

  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const warning of warnings) console.log(warning);
  }
  console.log('\nAll checks passed.');
}

main();
