// openai.js — ChatGPT (OpenAI Responses API), token-efficient
//
// ⚠️  ai.js (Groq + OpenRouter) נשאר שלם ופועל במקביל.
//     אם רוצים לחזור ל-Groq בלבד — מספיק להסיר את import בapp.js.
//
// SYSTEM PROMPT המלא של Groq (ai.js) לעיון, אם רוצים להחזיר:
// ------------------------------------------------------------------
// const GROQ_SYSTEM = `אתה עוזר לפתור תשבצים וחידות מילים בעברית.
// עליך לענות תמיד בעברית בלבד. אל תכתוב אנגלית.
// אל תסרב לענות — תמיד הצע את הניחושים הטובים ביותר גם אם אינך בטוח.
// חשוב על מגוון רחב של מילים: מילים נרדפות, מילים יידישאיות
// (כמו פוזמק, קישקע, חלטורה), מילות סלנג, מילים ארכאיות,
// שמות עצם, פעלים, שמות תואר — כל מה שמתאים לרמז ולתבנית.
// חשוב מאוד: אל תחזיר את מילת הרמז עצמה כתשובה —
// התשובה חייבת להיות מילה אחרת שמתאימה לרמז, לא הרמז עצמו.
// כתוב בכתיב חסר כפי שמקובל בתשבצים עבריים —
// הסר רק ו' או י' שנוספו כאמות קריאה בלבד, לא אותיות השייכות לשורש
// (למשל: "עתון" ולא "עיתון", אך "סיעה" נכתבת עם י' כי זה השורש).
// ספור את האותיות בכתיב החסר הנכון.`;
// ------------------------------------------------------------------

const OPENAI_URL   = 'https://api.openai.com/v1/responses';
const OPENAI_MODEL = 'gpt-4.1-nano';

let _key = null;

export function getOpenAIKey() {
  if (_key) return _key;
  _key = localStorage.getItem('openai_api_key');
  return _key;
}
export function saveOpenAIKey(key) {
  _key = key;
  localStorage.setItem('openai_api_key', key);
}
export function clearOpenAIKey() {
  _key = null;
  localStorage.removeItem('openai_api_key');
}

// System prompt קצר וקבוע (מאוחסן במטמון OpenAI)
// לעומת ~200 טוקנים ב-Groq — חיסכון של ~160 טוקנים בכל בקשה
const SYSTEM = `תשבץ עברי. קלט: קטגוריה|תבנית|אורך|רמז. _ = אות לא ידועה. אורך כ-Nאות = ספור והחזר מילה בדיוק N אותיות. ענה עד 3 מילים עבריות בלבד, אחת בשורה, ללא ספרות, ללא הסברים. כתיב חסר. אל תחזיר את מילת הרמז. קיצורים: g=עיר/מדינה, p=אישיות, a=חיה, h=היסטוריה, w=מילה.`;

// מיפוי קטגוריות לקיצורים (חיסכון בטוקנים)
const CAT = {
  all: '', words: 'w', personality: 'p', geography: 'g',
  places: 'g', politics: 'p', animals: 'a', science: 'sc',
  history: 'h', concepts: 'c'
};

// בניית קלט קומפקטי — שדות ריקים לא נשלחים בכלל
// דוגמאות: "g|פ__נ__ט|7אות" / "__|3אות|צבע" / "בן תשחורת"
function buildInput(pattern, hint, category, wordLengths, tolerance) {
  const cat = CAT[category] ?? '';

  let pat = pattern || '';
  if (!pat && wordLengths.length > 0) {
    pat = wordLengths.map(l => '_'.repeat(l)).join(' ');
  }

  let lenStr = '';
  if (wordLengths.length > 0) {
    lenStr = tolerance > 0
      ? wordLengths.map(l => `${l - tolerance}-${l + tolerance}אות`).join(',')
      : wordLengths.map(l => `${l}אות`).join(',');
  } else if (pat) {
    lenStr = pat.split(' ').map(w => `${[...w].length}אות`).join(',');
  }

  // שדות ריקים לא נכנסים — מונע בלבול ובזבוז טוקנים
  const parts = [];
  if (cat)    parts.push(cat);
  if (pat)    parts.push(pat);
  if (lenStr) parts.push(lenStr);
  if (hint)   parts.push(hint);
  return parts.join('|');
}

// פרסור תגובה — מילים בשורות נפרדות
function parseResponse(text, hintSet) {
  const results = [];
  for (const line of text.split('\n')) {
    const trimmed = line.replace(/^\d+[.)]\s*/, '').replace(/^[•\-*]\s+/, '').trim();
    if (!trimmed || trimmed.length < 2) continue;
    const dashIdx = trimmed.indexOf(' - ');
    const answer  = (dashIdx > -1 ? trimmed.slice(0, dashIdx) : trimmed).trim();
    if (!answer || answer.length < 2) continue;
    // דחה מטא-טקסט: תשובה חייבת להכיל עברית בלבד (לא ספרות, לא אנגלית)
    if (/\d/.test(answer)) continue;
    if (/[a-zA-Z]/.test(answer)) continue;
    if (!/[\u05D0-\u05EA]/.test(answer)) continue;
    if (hintSet.has(answer.toLowerCase())) continue;
    results.push({ answer, explanation: '', source: 'gpt' });
  }
  return results;
}

// API זהה לחתימה של askGemini ב-ai.js
export async function askOpenAI(pattern, hint, category, wordLengths = [], tolerance = 0) {
  const key = getOpenAIKey();
  if (!key) throw new Error('NO_OPENAI_KEY');

  const input   = buildInput(pattern, hint, category, wordLengths, tolerance);
  const hintSet = hint
    ? new Set(hint.trim().toLowerCase().split(/\s+/).filter(w => w.length > 1))
    : new Set();

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions: SYSTEM,
      input,
      max_output_tokens: 30    // מספיק ל-1-3 מילים קצרות
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err.error?.message || '';
    if (response.status === 401) throw new Error('INVALID_OPENAI_KEY');
    if (response.status === 429) throw new Error('QUOTA_OPENAI: ' + msg);
    throw new Error(msg || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const text  = data.output
    ?.find(o => o.type === 'message')
    ?.content?.find(c => c.type === 'output_text')
    ?.text || '';

  return parseResponse(text, hintSet);
}
