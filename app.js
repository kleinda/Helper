// app.js - Main logic
import { askGemini, getApiKey, saveApiKey, clearApiKey, getGeminiKey, saveGeminiKey, clearGeminiKey } from './ai.js';
import { HEB_WORDS_DB } from './HebWordsHard.js';

// ---- DOM refs ----
const hintInput      = document.getElementById('hintInput');
const categorySelect = document.getElementById('categorySelect');
const searchBtn      = document.getElementById('searchBtn');
const resultsCard    = document.getElementById('resultsCard');
const resultsDiv     = document.getElementById('results');
const resultsCount   = document.getElementById('resultsCount');
const apiKeyDot      = document.getElementById('apiKeyDot');
const apiKeyStatus   = document.getElementById('apiKeyStatus');
const keyModal       = document.getElementById('keyModal');
const keyInput       = document.getElementById('keyInput');

const NUM_BOXES = 15;
let lastFocusedBox = null;
const wordBreaks = new Set(); // set of box indices AFTER which there is a word break

// ---- Generate letter boxes + dividers ----
(function initBoxes() {
  const container = document.getElementById('letterBoxes');

  for (let i = 1; i <= NUM_BOXES; i++) {
    // Letter box wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'letter-box-wrapper';

    const inp = document.createElement('input');
    inp.className    = 'letter-box';
    inp.type         = 'text';
    inp.maxLength    = 1;
    inp.dataset.idx  = i;
    inp.id           = `lb-${i}`;
    inp.autocomplete = 'off';
    inp.spellcheck   = false;
    inp.inputMode    = 'text';
    inp.placeholder  = '·';

    const num = document.createElement('span');
    num.className   = 'box-num';
    num.textContent = i;

    wrapper.appendChild(inp);
    wrapper.appendChild(num);
    container.appendChild(wrapper);

    inp.addEventListener('keydown', onBoxKeydown);
    inp.addEventListener('input',   onBoxInput);
    inp.addEventListener('focus',   e => {
      lastFocusedBox = e.target;
      document.getElementById('letterBoxes').classList.add('has-focus');
      // Clear only the focused box's unknown marker (keep others for the pattern)
      const b = e.target;
      if (b.dataset.unknown === 'true') {
        b.value = '';
        b.classList.remove('unknown-box');
        delete b.dataset.unknown;
      }
      b.select();
    });
    inp.addEventListener('blur', () => {
      // Small delay so focus moving between boxes doesn't flicker
      setTimeout(() => {
        if (!document.querySelector('.letter-box:focus')) {
          document.getElementById('letterBoxes').classList.remove('has-focus');
        }
      }, 50);
    });

    // Word-break divider after each box (except the last)
    if (i < NUM_BOXES) {
      const div = document.createElement('div');
      div.className      = 'word-divider';
      div.dataset.after  = i;
      div.title          = 'לחץ להפרדת מילה כאן';
      div.innerHTML      = '<span class="divider-line"></span>';
      div.addEventListener('click', () => toggleWordBreak(i));
      container.appendChild(div);
    }
  }
})();

// ---- Word break logic ----
function toggleWordBreak(afterIdx) {
  if (wordBreaks.has(afterIdx)) {
    wordBreaks.delete(afterIdx);
  } else {
    wordBreaks.add(afterIdx);
  }
  updateDividerUI();
  syncWordLengthsFromPattern();
}

// ---- Auto-sync wl fields from boxes (real-time) ----
function syncWordLengthsFromPattern() {
  // Find last filled box
  let lastFilled = 0;
  for (let i = NUM_BOXES; i >= 1; i--) {
    const b = document.getElementById(`lb-${i}`);
    if (b.dataset.unknown === 'true' || (b.value && b.value !== '·')) {
      lastFilled = i;
      break;
    }
  }

  // No boxes filled → clear all wl fields
  if (!lastFilled) {
    for (let i = 1; i <= 3; i++) document.getElementById(`wl${i}`).value = '';
    return;
  }

  // Count letters per word segment, splitting at wordBreaks
  const wordLens = [];
  let currentLen = 0;
  for (let i = 1; i <= lastFilled; i++) {
    const b = document.getElementById(`lb-${i}`);
    if (b.dataset.unknown === 'true' || (b.value && b.value !== '·')) currentLen++;
    if (wordBreaks.has(i)) {
      wordLens.push(currentLen);
      currentLen = 0;
    }
  }
  if (currentLen > 0) wordLens.push(currentLen);

  for (let i = 0; i < 3; i++) {
    document.getElementById(`wl${i + 1}`).value = i < wordLens.length && wordLens[i] > 0 ? wordLens[i] : '';
  }
}

function updateDividerUI() {
  document.querySelectorAll('.word-divider').forEach(d => {
    const after = +d.dataset.after;
    d.classList.toggle('active', wordBreaks.has(after));
  });
}

// ---- Box event handlers ----
function onBoxInput(e) {
  const box = e.target;
  if (box.dataset.unknown === 'true') return;

  const hebrew = box.value.replace(/[^\u05D0-\u05EA]/g, '');
  box.value = hebrew;
  box.classList.remove('unknown-box');
  delete box.dataset.unknown;

  if (hebrew) focusBox(+box.dataset.idx + 1);
  syncWordLengthsFromPattern();
}

function onBoxKeydown(e) {
  const box = e.target;
  const idx = +box.dataset.idx;

  switch (e.key) {
    case 'Backspace':
      e.preventDefault();
      if (box.value || box.dataset.unknown === 'true') {
        box.value = '';
        delete box.dataset.unknown;
        box.classList.remove('unknown-box');
      } else {
        // Also remove word break before this box when stepping back
        wordBreaks.delete(idx - 1);
        updateDividerUI();
        focusBox(idx - 1);
      }
      syncWordLengthsFromPattern();
      break;

    case ' ':
    case '.':
      e.preventDefault();
      setUnknown(box);
      focusBox(idx + 1);
      syncWordLengthsFromPattern();
      break;

    case '-':
      // Add/remove word break after this box
      e.preventDefault();
      toggleWordBreak(idx);
      focusBox(idx + 1);
      break;

    case 'ArrowRight': e.preventDefault(); focusBox(idx - 1); break;
    case 'ArrowLeft':  e.preventDefault(); focusBox(idx + 1); break;
    case 'Enter':      e.preventDefault(); appSearch(); break;
  }
}

function focusBox(idx) {
  if (idx < 1 || idx > NUM_BOXES) return;
  const box = document.getElementById(`lb-${idx}`);
  if (box) { box.focus(); box.select(); }
}

function setUnknown(box) {
  box.value = '·';
  box.dataset.unknown = 'true';
  box.classList.add('unknown-box');
}

// ---- Exposed box controls ----
function markUnknown() {
  const box = document.activeElement?.classList.contains('letter-box')
    ? document.activeElement : lastFocusedBox;
  if (!box) { focusBox(1); return; }
  setUnknown(box);
  focusBox(+box.dataset.idx + 1);
}

function addWordBreak() {
  const box = document.activeElement?.classList.contains('letter-box')
    ? document.activeElement : lastFocusedBox;
  if (!box) return;
  const idx = +box.dataset.idx;
  // Add break after current box, move focus to next
  toggleWordBreak(idx);
  focusBox(idx + 1);
}

function clearBoxes() {
  for (let i = 1; i <= NUM_BOXES; i++) {
    const b = document.getElementById(`lb-${i}`);
    b.value = '';
    delete b.dataset.unknown;
    b.classList.remove('unknown-box');
  }
  wordBreaks.clear();
  updateDividerUI();
  hintInput.value = '';
  const mob = document.getElementById('mobilePattern');
  if (mob) { mob.value = ''; syncWlFromMobileInput(); }
  if (window.innerWidth > 767) focusBox(1);
}

// ---- Mobile: parse free-text pattern ----
function parseMobilePattern(raw) {
  if (!raw || !raw.trim()) return '';
  // Split on spaces (word breaks), each segment: Hebrew→keep, else→_
  const words = raw.split(' ').filter(w => w.length > 0);
  return words.map(w =>
    [...w].map(c => (c >= '\u05D0' && c <= '\u05EA') ? c : '_').join('')
  ).filter(w => w.length > 0).join(' ');
}

function syncWlFromMobileInput() {
  const raw = document.getElementById('mobilePattern')?.value || '';
  const pat = parseMobilePattern(raw);
  if (!pat) {
    for (let i = 1; i <= 3; i++) document.getElementById(`wl${i}`).value = '';
    return;
  }
  const words = pat.split(' ');
  for (let i = 0; i < 3; i++) {
    const wl = document.getElementById(`wl${i + 1}`);
    wl.value = i < words.length && words[i].length > 0 ? words[i].length : '';
  }
}

// ---- Read pattern from boxes (split by word breaks) ----
function getPattern() {
  // Mobile: read from text input
  if (window.innerWidth <= 767) {
    return parseMobilePattern(document.getElementById('mobilePattern')?.value || '');
  }
  // Find last filled box
  let lastFilled = 0;
  for (let i = NUM_BOXES; i >= 1; i--) {
    const b = document.getElementById(`lb-${i}`);
    if (b.dataset.unknown === 'true' || (b.value && b.value !== '·')) {
      lastFilled = i;
      break;
    }
  }
  if (!lastFilled) return '';

  // Build pattern, splitting into words by wordBreaks
  const groups = [];
  let current = '';

  for (let i = 1; i <= lastFilled; i++) {
    const b = document.getElementById(`lb-${i}`);
    current += (b.dataset.unknown === 'true' || b.value === '·' || !b.value) ? '_' : b.value;

    if (wordBreaks.has(i) && i < lastFilled) {
      groups.push(current);
      current = '';
    }
  }
  if (current) groups.push(current);

  return groups.join(' '); // multi-word: "ע_י שול___"
}

// ---- Read word lengths ----
function getWordLengths() {
  return [1, 2, 3]
    .map(n => parseInt(document.getElementById(`wl${n}`).value) || 0)
    .filter(l => l > 0);
}

// ---- Init ----
// On mobile: remove from tab/keyboard navigation so iOS doesn't show prev/next toolbar
if (window.innerWidth <= 767) {
  [1, 2, 3].forEach(i => {
    document.getElementById(`wl${i}`).tabIndex = -1;
  });
  // Also remove category select and approx checkbox from nav
  document.getElementById('categorySelect')?.setAttribute('tabindex', '-1');
  document.getElementById('approxLen')?.setAttribute('tabindex', '-1');
}
updateApiKeyUI();
updateGeminiKeyUI();
hintInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); appSearch(); }
});

// ---- Mobile pattern helpers ----
function mobileInsertChar(ch) {
  const inp = document.getElementById('mobilePattern');
  if (!inp) return;
  const start = inp.selectionStart;
  const end   = inp.selectionEnd;
  inp.value = inp.value.slice(0, start) + ch + inp.value.slice(end);
  inp.setSelectionRange(start + ch.length, start + ch.length);
  inp.dispatchEvent(new Event('input'));
  inp.focus();
}
window.mobileInsertUnknown   = () => mobileInsertChar('_');
window.mobileInsertWordBreak = () => mobileInsertChar(' ');

// Mobile pattern input
const mobilePatInput = document.getElementById('mobilePattern');
if (mobilePatInput) {
  mobilePatInput.addEventListener('input', () => {
    const raw = mobilePatInput.value;
    const pos = mobilePatInput.selectionStart;
    // char by char: Hebrew→keep, hyphen→space (word sep), space→_, else→_
    const converted = [...raw].map(c => {
      if (c >= '\u05D0' && c <= '\u05EA') return c; // Hebrew letter
      if (c === '-') return ' ';  // hyphen = word break
      if (c === ' ') return '_';  // space = unknown letter
      if (c === '_') return '_';  // already underscore
      return '_';                 // anything else = unknown
    }).join('');
    if (converted !== raw) {
      mobilePatInput.value = converted;
      mobilePatInput.setSelectionRange(pos, pos);
    }
    syncWlFromMobileInput();
  });
  mobilePatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); appSearch(); }
  });
}

// ---- Search: local-first + AI in background ----
async function appSearch() {
  let   pattern     = getPattern();
  const wordLengths = getWordLengths();
  const hint        = hintInput.value.trim();
  const category    = categorySelect.value;

  // Merge: if pattern has fewer letters than wordLengths, pad with underscores
  if (pattern && wordLengths.length > 0) {
    const patWords = pattern.split(' ');
    if (patWords.length === wordLengths.length) {
      pattern = patWords.map((pw, i) => {
        const patLen = [...pw].length;
        const target = wordLengths[i];
        return patLen < target ? pw + '_'.repeat(target - patLen) : pw;
      }).join(' ');
    }
  }

  if (!pattern && wordLengths.length === 0 && !hint) {
    showError('יש להזין תבנית, אורך מילה או רמז לפחות');
    return;
  }

  const approx = document.getElementById('approxLen')?.checked ? 1 : 0;
  const hintSet = hint
    ? new Set(hint.trim().toLowerCase().split(/\s+/).filter(w => w.length > 1))
    : new Set();

  // When hint is given without explicit word lengths → skip length filtering
  const skipLengthFilter = !!(hint && wordLengths.length === 0);
  const patternForFilter = skipLengthFilter ? '' : pattern;

  // Name-type clues → local DB irrelevant
  const isNameClue = hint && (/שם פרטי/.test(hint) || /שם משפחה/.test(hint));

  // Local DB is a Hebrew word dictionary — relevant only when:
  // • no hint (pattern/length only), OR
  // • hint suggests synonym/word search, OR
  // • category is "words"
  const isWordHint = hint && /מיל(ה|ון|וג)|נרדפת|מקבילה|שם נרדף|ביטוי|דומה|פועל|תואר/.test(hint);
  const useLocalDB = !isNameClue && (!hint || isWordHint || category === 'words');

  // --- Step 1: Local search (instant, 0ms) ---
  const localRaw = useLocalDB ? searchLocalDB(pattern, hint, wordLengths)
    .filter(r => !hintSet.has(r.answer.trim().toLowerCase())) : [];
  const { matched: localMatched, filteredOut: localFilteredOut } = splitByLength(localRaw, patternForFilter, wordLengths, approx);

  resultsCard.style.display = 'block';
  resultsCount.textContent = '';

  if (localMatched.length > 0) {
    renderResults(localMatched, localFilteredOut);
  } else {
    resultsDiv.innerHTML = '<p class="status-msg">מחפש...</p>';
  }

  // --- Step 2: AI search (requires key) ---
  if (!getApiKey()) {
    if (localMatched.length === 0) appSetKey();
    return;
  }

  setLoading(true);

  // Append "searching AI" note under local results
  if (localMatched.length > 0) {
    const note = document.createElement('p');
    note.className = 'status-ai status-msg';
    note.textContent = 'מחפש גם ב-AI...';
    resultsDiv.appendChild(note);
  }

  try {
    const aiResults = await askGemini(pattern, hint, category, wordLengths, approx);

    // Merge: local first, then new AI results (deduplicated)
    const seen = new Set(localRaw.map(r => r.answer));
    const newFromAI = aiResults.filter(r => !seen.has(r.answer) && !hintSet.has(r.answer.trim().toLowerCase()));
    const allResults = [...localRaw, ...newFromAI];

    const { matched, filteredOut } = splitByLength(allResults, patternForFilter, wordLengths, approx);
    renderResults(matched, filteredOut);
  } catch (err) {
    if (localMatched.length > 0) {
      // Keep local results, just remove the "searching AI" spinner note
      const note = resultsDiv.querySelector('.status-ai');
      if (note) note.remove();
    } else {
      if (err.message === 'NO_API_KEY')           showError('מפתח API לא מוגדר');
      else if (err.message === 'INVALID_KEY')     showError('מפתח API לא תקין');
      else if (err.message === 'MODEL_NOT_FOUND') showError('מודל לא נמצא — נסה למחוק ולהכניס מחדש את מפתח Groq');
      else if (err.message.startsWith('QUOTA:'))  showError('חרגת ממכסת השימוש החינמי. נסה מחר.');
      else                                         showError('שגיאה: ' + err.message);
      if (err.message === 'NO_API_KEY') appSetKey();
    }
  } finally {
    setLoading(false);
  }
}

// ---- Split results: matched = correct length, filteredOut = wrong length ----
function splitByLength(results, pattern, wordLengths, tolerance = 0) {
  let expected = [];
  if (wordLengths.length > 0) {
    expected = wordLengths;           // explicit user input wins
  } else if (pattern) {
    expected = pattern.split(' ').map(wp => [...wp].length);
  }
  if (expected.length === 0) return { matched: results, filteredOut: 0 };

  const matched = [];
  let filteredOut = 0;
  for (const r of results) {
    const words = r.answer.trim().split(/\s+/);
    if (words.length !== expected.length) { filteredOut++; continue; }
    const exact = words.every((w, i) => {
      const n = [...w].filter(c => c >= '\u05D0' && c <= '\u05EA').length;
      return n === expected[i];
    });
    const ok = exact || words.every((w, i) => {
      const n = [...w].filter(c => c >= '\u05D0' && c <= '\u05EA').length;
      return Math.abs(n - expected[i]) <= tolerance;
    });
    if (ok) matched.push({ ...r, exact }); else filteredOut++;
  }
  // Sort: exact length match first, then by total letter count ascending
  matched.sort((a, b) => {
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    const count = s => [...s].filter(c => c >= '\u05D0' && c <= '\u05EA').length;
    return count(a.answer) - count(b.answer);
  });
  return { matched, filteredOut };
}

// ---- Local dictionary search (HebWordsHard.js) ----
function searchLocalDB(pattern, hint, wordLengths) {
  // DB has single words only — skip for multi-word searches
  const patParts = pattern ? pattern.trim().split(/\s+/).filter(p => p.length > 0) : [];
  if (patParts.length > 1) return [];
  if (wordLengths.length > 1) return [];

  const hintWords = hint
    ? hint.trim().split(/\s+/).filter(w => w.length > 1)
    : [];

  const results = [];

  for (const [word, definition] of Object.entries(HEB_WORDS_DB)) {
    const hebrewChars = [...word].filter(c => c >= '\u05D0' && c <= '\u05EA');
    const len = hebrewChars.length;

    // Word length filter
    if (wordLengths.length === 1 && len !== wordLengths[0]) continue;

    // Pattern filter
    if (patParts.length === 1 && patParts[0]) {
      const patChars = [...patParts[0]].filter(c => (c >= '\u05D0' && c <= '\u05EA') || c === '_');
      if (patChars.length !== len) continue;
      let match = true;
      for (let i = 0; i < patChars.length; i++) {
        if (patChars[i] !== '_' && patChars[i] !== hebrewChars[i]) { match = false; break; }
      }
      if (!match) continue;
    }

    // Score: exact hint word matches in definition/word
    const defAndWord = definition + ' ' + word;
    let score = hintWords.filter(hw => defAndWord.includes(hw)).length;

    // Fuzzy fallback: morphological variants (e.g. פלטר→פלטור)
    // Only for short words (4-5 chars) to avoid noise with long/common words
    if (hintWords.length > 0 && score === 0) {
      const fuzzyMatch = hintWords.some(hw =>
        hw.length >= 4 && hw.length <= 5 && defAndWord.includes(hw.slice(0, 3))
      );
      if (!fuzzyMatch) continue;
      score = 0.5;
    }

    results.push({ answer: word, explanation: definition, local: true, score });
  }

  results.sort((a, b) => b.score - a.score || a.answer.length - b.answer.length);
  return results.slice(0, 30);
}

// ---- Render ----
function renderResults(results, filteredOut = 0) {
  resultsDiv.innerHTML = '';

  if (!results.length) {
    const msg = filteredOut > 0
      ? `<p class="status-msg">ה-AI הציע ${filteredOut} תשובות אך אף אחת לא מתאימה לאורך המבוקש. נסה לנסח את הרמז אחרת.</p>`
      : '<p class="status-msg">לא נמצאו תוצאות. נסה רמז אחר.</p>';
    resultsDiv.innerHTML = msg;
    resultsCount.textContent = '';
    return;
  }

  resultsCount.textContent = `${results.length} הצעות`;
  const ul = document.createElement('ul');
  ul.className = 'result-list';

  results.forEach(({ answer, explanation, exact, local, source }, i) => {
    const li = document.createElement('li');
    li.className = 'result-item' + (exact ? ' exact-match' : '');
    li.title = 'לחץ להעתקה';
    li.onclick = () => copyWord(answer, li);

    const badge = document.createElement('span');
    badge.className = 'rank-badge';
    badge.textContent = i + 1;

    const word = document.createElement('span');
    word.className = 'result-word';
    word.textContent = answer;

    li.appendChild(badge);
    li.appendChild(word);

    const srcBadge = document.createElement('span');
    srcBadge.className = 'local-badge';
    if (local) {
      srcBadge.textContent = '📚';
      srcBadge.title = 'ממאגר מקומי';
    } else if (source === 'or') {
      srcBadge.textContent = 'OR';
      srcBadge.title = 'OpenRouter AI';
      srcBadge.style.cssText = 'font-size:0.65rem;font-weight:bold;color:#7c4dff;opacity:0.8';
    } else {
      srcBadge.textContent = 'GRO';
      srcBadge.title = 'Groq AI';
      srcBadge.style.cssText = 'font-size:0.65rem;font-weight:bold;color:#e8a020;opacity:0.8';
    }
    li.appendChild(srcBadge);

    if (explanation) {
      const exp = document.createElement('span');
      exp.className = 'result-explanation';
      exp.textContent = explanation;
      li.appendChild(exp);
    }
    ul.appendChild(li);
  });

  resultsDiv.appendChild(ul);
  sizeResultsDiv();
}

// ---- Size results div to fill remaining viewport (desktop only) ----
function sizeResultsDiv() {
  if (window.innerWidth <= 767) {
    // Mobile: no fixed height, page scrolls naturally
    resultsDiv.style.height = '';
    resultsDiv.style.overflowY = '';
    return;
  }
  const top = resultsDiv.getBoundingClientRect().top;
  const h = window.innerHeight - top - 28;
  resultsDiv.style.height = Math.max(80, h) + 'px';
  resultsDiv.style.overflowY = 'auto';
}
window.addEventListener('resize', () => {
  if (resultsCard.style.display !== 'none') sizeResultsDiv();
});

function copyWord(word, el) {
  navigator.clipboard.writeText(word).catch(() => {});
  const orig = el.style.background;
  el.style.background = '#e8f5e9';
  setTimeout(() => { el.style.background = orig; }, 600);
}

// ---- API Key ----
function updateApiKeyUI() {
  const has = !!getApiKey();
  apiKeyDot.classList.toggle('set', has);
  apiKeyStatus.textContent = has ? 'Groq API מוגדר ✓' : 'Groq API לא מוגדר';
}
function appSetKey() {
  keyInput.value = getApiKey() || '';
  keyModal.style.display = 'flex';
  setTimeout(() => keyInput.focus(), 50);
}
function appSaveKey() {
  const val = keyInput.value.trim();
  if (!val) { alert('יש להזין מפתח'); return; }
  saveApiKey(val);
  keyModal.style.display = 'none';
  updateApiKeyUI();
}
function appCloseModal() { keyModal.style.display = 'none'; }
function appClearKey() {
  if (!confirm('למחוק את המפתח?')) return;
  clearApiKey();
  keyModal.style.display = 'none';
  updateApiKeyUI();
}

// ---- Gemini key ----
function updateGeminiKeyUI() {
  // UI elements removed — no-op
}
function appSetGeminiKey() {
  document.getElementById('geminiKeyInput').value = getGeminiKey() || '';
  document.getElementById('geminiModal').style.display = 'flex';
  setTimeout(() => document.getElementById('geminiKeyInput').focus(), 50);
}
function appSaveGeminiKey() {
  const val = document.getElementById('geminiKeyInput').value.trim();
  if (!val) { alert('יש להזין מפתח'); return; }
  saveGeminiKey(val);
  document.getElementById('geminiModal').style.display = 'none';
  updateGeminiKeyUI();
}
function appCloseGeminiModal() {
  document.getElementById('geminiModal').style.display = 'none';
  document.getElementById('geminiTestResult').style.display = 'none';
}
async function appTestGeminiKey() {
  const val = document.getElementById('geminiKeyInput').value.trim() || getGeminiKey();
  if (!val) { alert('הזן מפתח תחילה'); return; }
  const btn = document.getElementById('geminiTestBtn');
  const res = document.getElementById('geminiTestResult');
  btn.disabled = true;
  btn.textContent = 'בודק...';
  res.style.display = 'none';
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${val}`,
        'HTTP-Referer': 'https://tracker-9fdec.web.app',
        'X-Title': 'Helper Tashbetz'
      },
      body: JSON.stringify({
        model: 'google/gemma-3-12b-it:free',
        messages: [{ role: 'user', content: 'ענה במילה אחת בעברית: מה צבע השמיים?' }],
        max_tokens: 20
      })
    });
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    if (text) {
      res.textContent = `✅ OpenRouter עובד! תשובה: "${text.trim()}"`;
      res.style.color = '#2e7d32';
    } else {
      res.textContent = `⚠️ תגובה ריקה: ${JSON.stringify(data).slice(0, 100)}`;
      res.style.color = '#e65100';
    }
  } catch (e) {
    res.textContent = `❌ שגיאה: ${e.message}`;
    res.style.color = '#c62828';
  }
  res.style.display = 'block';
  btn.disabled = false;
  btn.textContent = 'בדוק';
}
function appClearGeminiKey() {
  if (!confirm('למחוק את מפתח Gemini?')) return;
  clearGeminiKey();
  document.getElementById('geminiModal').style.display = 'none';
  updateGeminiKeyUI();
}

// ---- Helpers ----
function setLoading(on) {
  searchBtn.innerHTML = on ? '<span class="spinner"></span> מחפש...' : '🔍 חפש';
  searchBtn.disabled = on;
}
function showError(msg) {
  resultsCard.style.display = 'block';
  resultsDiv.innerHTML = `<div class="error-msg">⚠️ ${escHtml(msg)}</div>`;
  resultsCount.textContent = '';
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ---- Expose ----
window.appSearch     = appSearch;
window.markUnknown   = markUnknown;
window.addWordBreak  = addWordBreak;
window.clearBoxes    = clearBoxes;
window.appSetKey     = appSetKey;
window.appSaveKey    = appSaveKey;
window.appCloseModal      = appCloseModal;
window.appClearKey        = appClearKey;
window.appSetGeminiKey    = appSetGeminiKey;
window.appSaveGeminiKey   = appSaveGeminiKey;
window.appCloseGeminiModal = appCloseGeminiModal;
window.appTestGeminiKey   = appTestGeminiKey;
window.appClearGeminiKey  = appClearGeminiKey;
window.showHelp  = () => { document.getElementById('helpModal').style.display = 'flex'; };
window.closeHelp = () => { document.getElementById('helpModal').style.display = 'none'; };
