// Génère un JSON de tous les mots du dictionnaire français Scrabble, avec les variantes en S si elles existent
// Usage: node scripts/export-scrabble-words.js

import { DICTIONARY_SETS } from "../src/lib/dictionary.js";
import fs from "fs";

function getWordsWithSVariants(dictionarySet) {
  const words = Array.from(dictionarySet);
  const resultSet = new Set(words);
  words.forEach(word => {
    if (word.length > 1 && !word.endsWith("S")) {
      const plural = word + "S";
      if (dictionarySet.has(plural)) {
        resultSet.add(plural);
      }
    }
  });
  return Array.from(resultSet).sort();
}

const frWords = getWordsWithSVariants(DICTIONARY_SETS.fr);

fs.writeFileSync("scrabble-words-fr.json", JSON.stringify(frWords, null, 2), "utf-8");
console.log(`Exporté: ${frWords.length} mots dans scrabble-words-fr.json`);
