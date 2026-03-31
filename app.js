// app.js - Main logic
import { askGemini, getApiKey, saveApiKey, clearApiKey } from './ai.js';

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
      break;

    case ' ':
    case '.':
      e.preventDefault();
      setUnknown(box);
      focusBox(idx + 1);
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
  focusBox(1);
}

// ---- Read pattern from boxes (split by word breaks) ----
function getPattern() {
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
updateApiKeyUI();
hintInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); appSearch(); }
});

// ---- Search → Gemini ----
async function appSearch() {
  let   pattern     = getPattern();
  const wordLengths = getWordLengths();
  const hint        = hintInput.value.trim();
  const category    = categorySelect.value;

  // Merge: if pattern has fewer letters than wordLengths, pad with underscores
  // e.g. pattern="ס" + wordLength=3 → "ס__"
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

  if (!getApiKey()) { appSetKey(); return; }

  setLoading(true);
  resultsCard.style.display = 'block';
  resultsDiv.innerHTML = '<p class="status-msg">מחפש...</p>';
  resultsCount.textContent = '';

  try {
    const approx = document.getElementById('approxLen')?.checked ? 1 : 0;
    let results = await askGemini(pattern, hint, category, wordLengths, approx);
    // Never return the hint word itself as a result
    if (hint) {
      const hintLower = hint.trim().toLowerCase();
      results = results.filter(r => r.answer.trim().toLowerCase() !== hintLower);
    }
    const { matched, filteredOut } = splitByLength(results, pattern, wordLengths, approx);
    renderResults(matched, filteredOut);
  } catch (err) {
    if (err.message === 'NO_API_KEY')           showError('מפתח API לא מוגדר');
    else if (err.message === 'INVALID_KEY')     showError('מפתח API לא תקין');
    else if (err.message === 'MODEL_NOT_FOUND') showError('מודל לא נמצא. וודא שהמפתח הוא מ-aistudio.google.com');
    else if (err.message.startsWith('QUOTA:'))  showError('חרגת ממכסת השימוש החינמי. נסה מחר.');
    else                                         showError('שגיאה: ' + err.message);
    if (err.message === 'NO_API_KEY') appSetKey();
  } finally {
    setLoading(false);
  }
}

// ---- Split results: matched = correct length, filteredOut = wrong length ----
function splitByLength(results, pattern, wordLengths, tolerance = 0) {
  let expected = [];
  if (pattern) {
    expected = pattern.split(' ').map(wp => [...wp].length);
  } else if (wordLengths.length > 0) {
    expected = wordLengths;
  }
  if (expected.length === 0) return { matched: results, filteredOut: 0 };

  const matched = [];
  let filteredOut = 0;
  for (const r of results) {
    const words = r.answer.trim().split(/\s+/);
    const ok = words.length === expected.length &&
      words.every((w, i) => {
        const n = [...w].filter(c => c >= '\u05D0' && c <= '\u05EA').length;
        return Math.abs(n - expected[i]) <= tolerance;
      });
    if (ok) matched.push(r); else filteredOut++;
  }
  // Sort by total letter count descending
  matched.sort((a, b) => {
    const count = s => [...s].filter(c => c >= '\u05D0' && c <= '\u05EA').length;
    return count(b.answer) - count(a.answer);
  });
  return { matched, filteredOut };
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

  results.forEach(({ answer, explanation }, i) => {
    const li = document.createElement('li');
    li.className = 'result-item';
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
window.appCloseModal = appCloseModal;
window.appClearKey   = appClearKey;
