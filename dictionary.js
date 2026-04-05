// dictionary.js - Local Hebrew pattern matching engine (no AI, no credits)

let dictionaryData = null;

async function loadDictionary() {
  if (dictionaryData) return dictionaryData;
  const response = await fetch('./data/words.json');
  dictionaryData = await response.json();
  return dictionaryData;
}

/**
 * Convert user pattern to regex
 * _ or ? = any single Hebrew letter
 * Known letters stay as-is
 * Example: "_ל_ם" → /^.ל.מ$/u
 */
function patternToRegex(pattern) {
  if (!pattern || pattern.trim() === '') return null;
  const escaped = pattern
    .trim()
    .split('')
    .map(ch => {
      if (ch === '_' || ch === '?' || ch === '*') return '.';
      // Escape regex special chars
      return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp('^' + escaped + '$', 'u');
}

/**
 * Score a word against the hint (simple keyword match)
 * Returns 0-1 score
 */
function hintScore(word, hint) {
  if (!hint || hint.trim() === '') return 0;
  const hintWords = hint.trim().toLowerCase().split(/\s+/);
  let matches = 0;
  for (const hw of hintWords) {
    if (word.includes(hw)) matches++;
  }
  return matches / hintWords.length;
}

/**
 * Main search function
 * @param {string} pattern - e.g. "_ל_ם" or "של_ם"
 * @param {string} hint - free text hint (optional)
 * @param {string} category - "all" | "words" | "names" | "places" | "concepts"
 * @param {number} maxResults - max results to return
 * @returns {Array<{word, category, score}>}
 */
async function search(pattern, hint, category = 'all', maxResults = 30) {
  const dict = await loadDictionary();

  const regex = patternToRegex(pattern);
  const results = [];

  const categories = category === 'all'
    ? ['words', 'names', 'places', 'concepts']
    : [category];

  for (const cat of categories) {
    const wordList = dict[cat] || [];
    for (const word of wordList) {
      // Pattern match (if pattern given)
      if (regex && !regex.test(word)) continue;

      // If no pattern, skip empty searches
      if (!regex && (!hint || hint.trim() === '')) continue;

      const score = hintScore(word, hint);
      results.push({ word, category: cat, score });
    }
  }

  // Sort: hint matches first, then alphabetical
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.word.localeCompare(b.word, 'he');
  });

  return results.slice(0, maxResults);
}

/**
 * Search by hint only (no pattern required)
 */
async function searchByHint(hint, category = 'all', maxResults = 20) {
  const dict = await loadDictionary();
  if (!hint || hint.trim() === '') return [];

  const categories = category === 'all'
    ? ['words', 'names', 'places', 'concepts']
    : [category];

  const results = [];
  const hintLower = hint.trim();

  for (const cat of categories) {
    const wordList = dict[cat] || [];
    for (const word of wordList) {
      if (word.includes(hintLower) || hintLower.includes(word)) {
        results.push({ word, category: cat, score: 1 });
      }
    }
  }

  return results.slice(0, maxResults);
}

export { search, searchByHint, loadDictionary };
