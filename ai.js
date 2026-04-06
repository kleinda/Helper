// ai.js - Groq (primary) + OpenRouter (fallback)

const GROQ_URL    = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL  = 'llama-3.3-70b-versatile';
const OR_URL      = 'https://openrouter.ai/api/v1/chat/completions';
const OR_MODEL    = 'google/gemma-3-12b-it:free';

let apiKey = null;
let orKey  = null;

// ---- Groq key ----
export function getApiKey() {
  if (apiKey) return apiKey;
  apiKey = localStorage.getItem('groq_api_key');
  return apiKey;
}
export function saveApiKey(key) {
  apiKey = key;
  localStorage.setItem('groq_api_key', key);
}
export function clearApiKey() {
  apiKey = null;
  localStorage.removeItem('groq_api_key');
}

// ---- OpenRouter key ----
export function getGeminiKey() {  // kept name for app.js compatibility
  if (orKey) return orKey;
  orKey = localStorage.getItem('or_api_key');
  return orKey;
}
export function saveGeminiKey(key) {
  orKey = key;
  localStorage.setItem('or_api_key', key);
}
export function clearGeminiKey() {
  orKey = null;
  localStorage.removeItem('or_api_key');
}

const CAT_LABEL = {
  all:         'מילה, שם, מקום או מושג',
  personality: 'אישיות (אדם ידוע: אמן, ספורטאי, מנהיג, שחקן וכו׳)',
  geography:   'מושג גאוגרפי (יבשת, אזור, הר, נהר, ים)',
  history:     'אירוע, תקופה או דמות היסטורית',
  animals:     'חיה, עוף, דג, זוחל או חרק',
  science:     'מושג מדעי, יסוד כימי, תגלית או מדען',
  concepts:    'מושג, רעיון או תופעה',
  words:       'מילה עברית',
  places:      'מקום, עיר או מדינה',
  politics:    'פוליטיקאי, מפלגה או תנועה פוליטית'
};

const SYSTEM = `אתה עוזר לפתור תשבצים וחידות מילים בעברית. עליך לענות תמיד בעברית בלבד. אל תכתוב אנגלית. אל תסרב לענות — תמיד הצע את הניחושים הטובים ביותר גם אם אינך בטוח. חשוב על מגוון רחב של מילים: מילים נרדפות, מילים יידישאיות (כמו פוזמק, קישקע, חלטורה), מילות סלנג, מילים ארכאיות, שמות עצם, פעלים, שמות תואר — כל מה שמתאים לרמז ולתבנית. חשוב מאוד: אל תחזיר את מילת הרמז עצמה כתשובה — התשובה חייבת להיות מילה אחרת שמתאימה לרמז, לא הרמז עצמו. כתוב בכתיב חסר כפי שמקובל בתשבצים עבריים — הסר רק ו' או י' שנוספו כאמות קריאה בלבד, לא אותיות השייכות לשורש (למשל: "עתון" ולא "עיתון", אך "סיעה" נכתבת עם י' כי זה השורש). ספור את האותיות בכתיב החסר הנכון.`;

// ---- Shared response parser ----
function _parseResults(text) {
  const META = /^(להלן|הניחושים|הנה|אלה|אלו|תוצאות|ניחוש|תשובה|שאלה|בהתאם|לפי)/;
  const results = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const numMatch    = trimmed.match(/^\d+[.)]\s*(.+)/);
    const bulletMatch = !numMatch && trimmed.match(/^[•\-*]\s+(.+)/);
    const content     = (numMatch?.[1] || bulletMatch?.[1] || '').trim();
    if (!content || META.test(content)) continue;
    const dashIdx   = content.indexOf(' - ');
    const answer    = (dashIdx > -1 ? content.slice(0, dashIdx) : content).trim();
    let explanation = (dashIdx > -1 ? content.slice(dashIdx + 3) : '').trim();
    if (!answer || answer.length < 2) continue;
    if (/לא מתאים|לא רלוונטי|לא קשור|אינו מתאים/.test(explanation)) continue;
    explanation = explanation.replace(/\([\d\+]+\)/g, '').replace(/\d+\s*אותיות/g, '').trim();
    results.push({ answer, explanation });
  }
  return results;
}

// ---- OpenRouter API call (fallback) ----
async function _callGemini(prompt) {
  const key = getGeminiKey();
  if (!key) throw new Error('NO_OR_KEY');

  const response = await fetch(OR_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'HTTP-Referer': 'https://tracker-9fdec.web.app',
      'X-Title': 'Helper Tashbetz'
    },
    body: JSON.stringify({
      model: OR_MODEL,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
      max_tokens: 1000,
      temperature: 0.6
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err.error?.message || '';
    if (response.status === 401) throw new Error('INVALID_OR_KEY');
    if (response.status === 429) throw new Error('QUOTA: ' + msg);
    throw new Error(msg || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  return _parseResults(text).map(r => ({ ...r, source: 'or' }));
}

// ---- Groq API call (primary) with Gemini fallback ----
async function _callGroq(prompt) {
  const key = getApiKey();
  if (!key) {
    // No Groq key — try Gemini directly
    if (getGeminiKey()) return _callGemini(prompt);
    throw new Error('NO_API_KEY');
  }

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
      max_tokens: 1000,
      temperature: 0.6
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err.error?.message || '';
    if (response.status === 401)                                          throw new Error('INVALID_KEY');
    if (response.status === 404 || msg.toLowerCase().includes('model'))  throw new Error('MODEL_NOT_FOUND');
    if (response.status === 429 || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate')) {
      // Groq quota exceeded — try Gemini fallback
      if (getGeminiKey()) return _callGemini(prompt);
      throw new Error('QUOTA: ' + msg);
    }
    // Other error — try Gemini fallback
    if (getGeminiKey()) return _callGemini(prompt);
    throw new Error(msg || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  const results = _parseResults(text).map(r => ({ ...r, source: 'groq' }));

  // If Groq returned few results — try Gemini fallback and merge
  if (results.length < 3 && getGeminiKey()) {
    try {
      const geminiResults = await _callGemini(prompt);
      const seen = new Set(results.map(r => r.answer));
      const extra = geminiResults.filter(r => !seen.has(r.answer));
      return [...results, ...extra];
    } catch { /* Gemini failed, return Groq results */ }
  }
  return results;
}

export async function askGemini(pattern, hint, category, wordLengths = [], tolerance = 0) {
  const key = getApiKey();
  if (!key) throw new Error('NO_API_KEY');

  const catLabel = CAT_LABEL[category] || CAT_LABEL.all;
  const lenRange = (n) => tolerance > 0 ? `בין ${n - tolerance} ל-${n + tolerance} אותיות` : `בדיוק ${n} אותיות`;

  // ---- Name-type clue: build a focused prompt ----
  const hasFirstName  = hint && /שם פרטי/.test(hint);
  const hasFamilyName = hint && /שם משפחה/.test(hint);

  if (hasFirstName || hasFamilyName) {
    const nameMatch = hasFirstName
      ? hint.match(/שם פרטי\s+(\S+)/)
      : hint.match(/שם משפחה\s+(\S+)/);
    const knownName  = nameMatch ? nameMatch[1] : '';
    const answerType = hasFirstName ? 'שם משפחה' : 'שם פרטי';
    const searchType = hasFirstName ? 'ששמם הפרטי' : 'ששם משפחתם';
    // Extract domain keywords — remove meta-phrases and stop words
    const STOP = /^(עם|של|את|אל|כי|גם|רק|לא|כל|אבל|או|אך|כן|בו|בה|לו|לה|הם|הן|חפש|מצא)$/;
    const domainWords = hint
      .replace(/שם (פרטי|משפחה)\s+\S+/g, '')
      .trim()
      .split(/\s+/)
      .filter(w => w.length >= 2 && !STOP.test(w))
      .join(' ');

    const sizeHint = wordLengths.length >= 1 ? ` (${lenRange(wordLengths[0])})` : '';
    const patHint  = pattern ? ` תבנית: "${pattern.split(' ')[0]}".` : '';
    // Example row showing expected format
    const exampleAnswer = hasFirstName ? 'כהן' : 'יוסי';
    const exampleFull   = hasFirstName ? `${knownName} ${exampleAnswer}` : `${exampleAnswer} ${knownName}`;

    const roleDesc = domainWords || 'אדם ידוע';
    const lines = [
      `שלב 1: חשוב על ${roleDesc}ים ששמ${hasFirstName ? 'ם הפרטי הוא' : ' משפחתם הוא'} "${knownName}" — כלומר, השם ${hasFirstName ? 'הפרטי' : 'משפחה'} שלהם, לא שם ${hasFirstName ? 'המשפחה' : 'הפרטי'}, הוא "${knownName}".`,
      `שלב 2: עבור כל אחד, כתוב רק את ה${answerType} שלהם.${sizeHint}${patHint}`,
      `חשוב מאוד: אסור לכלול ${roleDesc}ים שה${answerType} שלהם הוא "${knownName}" — רק כאלה ששמ${hasFirstName ? 'ם הפרטי' : ' משפחתם'} הוא "${knownName}".`,
      '',
      `פורמט — התחל ישירות עם 1 (${answerType} בלבד, אחר כך מקף ושם מלא):`,
      `1. ${exampleAnswer} - ${exampleFull}, [תפקיד]`,
    ].filter(Boolean);

    return _callGroq(lines.join('\n'));
  }

  // ---- Standard clue ----
  const lines = [`מצא עד 20 ${catLabel} שמתאים/ת לכל הנתונים הבאים:`];

  if (pattern) {
    const wordPatterns = pattern.split(' ');
    if (wordPatterns.length === 1) {
      const len = [...wordPatterns[0]].length;
      lines.push(`• תבנית: "${pattern}" — מילה אחת בלבד, ${lenRange(len)} (קו תחתון = אות לא ידועה)`);
      lines.push(`• אל תכתוב שם מורחב או ביטוי — מילה אחת בלבד`);
    } else {
      lines.push(`• תשובה של ${wordPatterns.length} מילים נפרדות:`);
      wordPatterns.forEach((wp, i) => {
        const len = [...wp].length;
        lines.push(`  מילה ${i + 1}: "${wp}" — ${lenRange(len)}`);
      });
      lines.push(`• ספור את האותיות בכל מילה לפני שאתה עונה.`);
    }
  } else if (wordLengths.length === 1) {
    lines.push(`• תשובה: מילה אחת בלבד, ${lenRange(wordLengths[0])}`);
    lines.push(`• אל תכתוב שם מורחב, תואר שם, או מספר מילים — מילה אחת בלבד`);
  } else if (wordLengths.length > 1) {
    lines.push(`• תשובה של בדיוק ${wordLengths.length} מילים נפרדות:`);
    wordLengths.forEach((l, i) => lines.push(`  מילה ${i + 1}: ${lenRange(l)}`));
    lines.push(`• ספור אות אחר אות בכל מילה לפני שאתה כותב.`);
  }

  if (hint) {
    lines.push(`• רמז: "${hint}"`);
    lines.push(`• חפש: מילים נרדפות, מילים מקבילות, שם נרדף, תרגום, הגדרה — כל מה שיכול להיות תשובה לרמז זה`);
  }

  const wordCount = pattern ? pattern.split(' ').length : wordLengths.length || 1;
  const answerFormat = wordCount === 1
    ? '[מילה אחת בעברית]'
    : Array.from({length: wordCount}, (_, i) => `[מילה ${i+1}]`).join(' ');

  lines.push('');
  lines.push('התחל את התשובה ישירות עם המספר 1 — ללא כותרת, ללא הקדמה, ללא "להלן":');
  lines.push(`1. ${answerFormat} - [הסבר קצר]`);
  lines.push(`2. ${answerFormat} - [הסבר קצר]`);
  lines.push('(המשך עד 20 ניחושים)');

  return _callGroq(lines.join('\n'));
}
