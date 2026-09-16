import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, '..');
const sourcePath = path.resolve(process.argv[2] || 'ecdict.csv');
const outputDirectory = path.join(projectDirectory, 'public', 'dictionary', 'shards');

function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
}

function normalizeWord(value) {
  return String(value || '').normalize('NFKC').replace(/[‘’]/g, "'").toLowerCase();
}

function shardName(word) {
  const first = /^[a-z]$/.test(word[0]) ? word[0] : '_';
  const second = /^[a-z]$/.test(word[1] || '') ? word[1] : '_';
  return `${first}${second}`;
}

function qualityScore(fields, indexes) {
  return (fields[indexes.translation] ? 8 : 0)
    + (fields[indexes.phonetic] ? 3 : 0)
    + (fields[indexes.exchange] ? 2 : 0)
    + (Number(fields[indexes.collins]) || 0)
    + (Number(fields[indexes.oxford]) ? 2 : 0)
    + (fields[indexes.tag] ? 2 : 0);
}

await mkdir(outputDirectory, { recursive: true });
for (const entry of await readdir(outputDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.json')) await rm(path.join(outputDirectory, entry.name));
}

const streams = new Map();
const seen = new Map();
let headers;
let indexes;
let count = 0;

function outputStream(shard) {
  if (!streams.has(shard)) {
    const stream = createWriteStream(path.join(outputDirectory, `${shard}.ndjson`), { encoding: 'utf8' });
    streams.set(shard, stream);
  }
  return streams.get(shard);
}

const lines = readline.createInterface({ input: createReadStream(sourcePath, 'utf8'), crlfDelay: Infinity });
for await (const line of lines) {
  if (!headers) {
    headers = parseCsvLine(line.replace(/^\uFEFF/, ''));
    indexes = Object.fromEntries(headers.map((header, index) => [header, index]));
    continue;
  }
  const fields = parseCsvLine(line);
  const originalWord = fields[indexes.word] || '';
  const word = normalizeWord(originalWord);
  if (!/^[a-z]+(?:['-][a-z]+)*$/.test(word)) continue;
  const translation = fields[indexes.translation] || '';
  if (!translation) continue;

  const score = qualityScore(fields, indexes);
  const previous = seen.get(word);
  if (previous && previous.score >= score) continue;
  seen.set(word, { score, shard: shardName(word) });

  const record = [word, fields[indexes.phonetic] || '', translation, fields[indexes.exchange] || ''];
  outputStream(shardName(word)).write(`${JSON.stringify(record)}\n`);
  count += 1;
}

await Promise.all([...streams.values()].map((stream) => new Promise((resolve, reject) => {
  stream.on('error', reject);
  stream.end(resolve);
})));

const shardFiles = (await readdir(outputDirectory)).filter((name) => name.endsWith('.ndjson'));
let finalCount = 0;
for (const shardFile of shardFiles) {
  const latestRecords = new Map();
  const shardLines = readline.createInterface({
    input: createReadStream(path.join(outputDirectory, shardFile), 'utf8'),
    crlfDelay: Infinity,
  });
  for await (const line of shardLines) {
    if (!line) continue;
    const record = JSON.parse(line);
    latestRecords.set(record[0], record);
  }
  const output = Object.fromEntries([...latestRecords.entries()].sort(([left], [right]) => left.localeCompare(right)));
  const jsonPath = path.join(outputDirectory, shardFile.replace(/\.ndjson$/, '.json'));
  await writeFile(jsonPath, JSON.stringify(output), 'utf8');
  await rm(path.join(outputDirectory, shardFile));
  finalCount += latestRecords.size;
}

await writeFile(path.join(projectDirectory, 'public', 'dictionary', 'metadata.json'), JSON.stringify({
  name: 'ECDICT',
  source: 'https://github.com/skywind3000/ECDICT',
  license: 'MIT',
  generatedAt: new Date().toISOString(),
  entries: finalCount,
  shards: shardFiles.length,
}, null, 2), 'utf8');

console.log(`Generated ${finalCount} dictionary entries in ${shardFiles.length} shards (${count} source records accepted).`);
