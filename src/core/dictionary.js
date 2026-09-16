const LOOKUP_TOKEN_PATTERN = /[A-Za-z]+(?:[’'-][A-Za-z]+)*/g;

const FORM_LABELS = {
  p: '过去式',
  d: '过去分词',
  i: '现在分词',
  3: '第三人称单数',
  s: '复数',
  r: '比较级',
  t: '最高级',
  o: '所有格',
};

export function normalizeLookupWord(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.normalize('NFKC').replace(/[‘’]/g, "'");
  const match = normalized.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/);
  return match ? match[0].toLowerCase() : '';
}

export function tokenizeSubtitleLine(line) {
  const value = String(line ?? '');
  const parts = [];
  let cursor = 0;
  for (const match of value.matchAll(LOOKUP_TOKEN_PATTERN)) {
    if (match.index > cursor) parts.push({ text: value.slice(cursor, match.index), word: null });
    parts.push({ text: match[0], word: normalizeLookupWord(match[0]) });
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) parts.push({ text: value.slice(cursor), word: null });
  return parts;
}

export function dictionaryShardName(value) {
  const word = normalizeLookupWord(value);
  if (!word) return '__';
  const first = /^[a-z]$/.test(word[0]) ? word[0] : '_';
  const second = /^[a-z]$/.test(word[1] || '') ? word[1] : '_';
  return `${first}${second}`;
}

export function parseExchange(exchange) {
  const result = { lemma: '', formCodes: [] };
  if (typeof exchange !== 'string') return result;
  for (const item of exchange.split('/')) {
    const separator = item.indexOf(':');
    if (separator < 0) continue;
    const code = item.slice(0, separator);
    const value = item.slice(separator + 1);
    if (code === '0') result.lemma = normalizeLookupWord(value);
    if (code === '1') result.formCodes = [...new Set([...value].filter((itemCode) => FORM_LABELS[itemCode]))];
  }
  return result;
}

export function wordFormLabels(codes) {
  return (codes || []).map((code) => FORM_LABELS[code]).filter(Boolean);
}

function fallbackCandidates(word) {
  const candidates = [];
  const add = (candidate, formCodes) => {
    const normalized = normalizeLookupWord(candidate);
    if (normalized && normalized !== word && !candidates.some((item) => item.word === normalized)) {
      candidates.push({ word: normalized, formCodes });
    }
  };

  if (word.endsWith("'s")) add(word.slice(0, -2), ['o']);
  if (word.endsWith('ies') && word.length > 3) add(`${word.slice(0, -3)}y`, ['s']);
  if (word.endsWith('ves') && word.length > 3) {
    add(`${word.slice(0, -3)}f`, ['s']);
    add(`${word.slice(0, -3)}fe`, ['s']);
  }
  if (word.endsWith('es') && word.length > 2) add(word.slice(0, -2), ['s']);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 1) add(word.slice(0, -1), ['s']);
  if (word.endsWith('ied') && word.length > 3) add(`${word.slice(0, -3)}y`, ['p', 'd']);
  if (word.endsWith('ed') && word.length > 2) {
    const stem = word.slice(0, -2);
    add(stem, ['p', 'd']);
    add(`${stem}e`, ['p', 'd']);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) add(stem.slice(0, -1), ['p', 'd']);
  }
  if (word.endsWith('ing') && word.length > 3) {
    const stem = word.slice(0, -3);
    add(stem, ['i']);
    add(`${stem}e`, ['i']);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) add(stem.slice(0, -1), ['i']);
  }
  return candidates;
}

export async function lookupDictionaryWord(rawWord, loadEntry) {
  const query = normalizeLookupWord(rawWord);
  if (!query) return null;

  let surfaceEntry = await loadEntry(query);
  let lemma = query;
  let formCodes = [];

  if (surfaceEntry) {
    const exchange = parseExchange(surfaceEntry.exchange);
    if (exchange.lemma) lemma = exchange.lemma;
    formCodes = exchange.formCodes;
  } else {
    for (const candidate of fallbackCandidates(query)) {
      const entry = await loadEntry(candidate.word);
      if (!entry) continue;
      surfaceEntry = null;
      lemma = candidate.word;
      formCodes = candidate.formCodes;
      break;
    }
  }

  if (!surfaceEntry && lemma === query) return null;
  const entry = lemma !== query ? await loadEntry(lemma) : surfaceEntry;
  if (!entry) return surfaceEntry ? {
    query,
    lemma: query,
    entry: surfaceEntry,
    surfaceEntry,
    formLabels: [],
  } : null;

  return {
    query,
    lemma,
    entry,
    surfaceEntry,
    formLabels: wordFormLabels(formCodes),
  };
}

export function splitDictionaryMeanings(value, limit = 8) {
  if (typeof value !== 'string') return [];
  return value
    .split(/\\n|\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}
