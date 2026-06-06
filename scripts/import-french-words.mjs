import fs from "node:fs";
import path from "node:path";

function normalizeScrabbleWord(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
}

function parseWords(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (Array.isArray(parsed.words)) {
      return parsed.words;
    }
    throw new Error('JSON attendu: ["MOT"] ou { "words": ["MOT"] }.');
  }

  return raw.split(/\r?\n|,|;|\s+/);
}

const [, , sourceUrl, outputPath = "data/french-words.txt"] = process.argv;

if (!sourceUrl) {
  console.error("Usage: npm run import:fr-words -- <url> [outputPath]");
  process.exit(1);
}

const response = await fetch(sourceUrl);
if (!response.ok) {
  throw new Error(`Telechargement impossible (${response.status}) depuis ${sourceUrl}`);
}

const raw = await response.text();
const words = [...new Set(parseWords(raw).map(normalizeScrabbleWord).filter(Boolean))].sort();
const resolvedOutputPath = path.resolve(outputPath);

fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
fs.writeFileSync(resolvedOutputPath, `${words.join("\n")}\n`, "utf8");

console.log(`${words.length} mots importes dans ${resolvedOutputPath}`);
console.log(`Lance ensuite le serveur avec SCRABBLE_FR_WORDS_PATH=${resolvedOutputPath}`);
