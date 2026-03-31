// ai.js - Groq API (FREE: 1,000 requests/day)
// Get key: https://console.groq.com/keys

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

let apiKey = null;

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

export async function askGemini(pattern, hint, category, wordLengths = [], tolerance = 0) {
  const key = getApiKey();
  if (!key) throw new Error('NO_API_KEY');

  const catLabel = CAT_LABEL[category] || CAT_LABEL.all;
  const lines = [`מצא עד 20 ${catLabel} שמתאים/ת לכל הנתונים הבאים:`];

  const lenRange = (n) => tolerance > 0 ? `בין ${n - tolerance} ל-${n + tolerance} אותיות` : `בדיוק ${n} אותיות`;

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
  const answerFormat = wordCount === 1 ? '[מילה אחת בעברית]' : Array.from({length: wordCount}, (_, i) => `[מילה ${i+1}]`).join(' ');

  lines.push('');
  lines.push('התחל את התשובה ישירות עם המספר 1 — ללא כותרת, ללא הקדמה, ללא "להלן":');
  lines.push(`1. ${answerFormat} - [הסבר קצר]`);
  lines.push(`2. ${answerFormat} - [הסבר קצר]`);
  lines.push('(המשך עד 20 ניחושים)');

  const prompt = lines.join('\n');

  const SYSTEM = `אתה עוזר לפתור תשבצים וחידות מילים בעברית. עליך לענות תמיד בעברית בלבד. אל תכתוב אנגלית. אל תסרב לענות — תמיד הצע את הניחושים הטובים ביותר גם אם אינך בטוח. חשוב על מגוון רחב של מילים: מילים נרדפות, מילים יידישאיות (כמו פוזמק, קישקע, חלטורה), מילות סלנג, מילים ארכאיות, שמות עצם, פעלים, שמות תואר — כל מה שמתאים לרמז ולתבנית. חשוב מאוד: אל תחזיר את מילת הרמז עצמה כתשובה — התשובה חייבת להיות מילה אחרת שמתאימה לרמז, לא הרמז עצמו. כתוב בכתיב חסר כפי שמקובל בתשבצים עבריים — הסר רק ו' או י' שנוספו כאמות קריאה בלבד, לא אותיות השייכות לשורש (למשל: "עתון" ולא "עיתון", אך "סיעה" נכתבת עם י' כי זה השורש). ספור את האותיות בכתיב החסר הנכון.`;

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user',   content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.4
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err.error?.message || '';
    if (response.status === 401)                                          throw new Error('INVALID_KEY');
    if (response.status === 404 || msg.toLowerCase().includes('model'))  throw new Error('MODEL_NOT_FOUND');
    if (response.status === 429 || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate')) throw new Error('QUOTA: ' + msg);
    throw new Error(msg || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';

  const META = /^(להלן|הניחושים|הנה|אלה|אלו|תוצאות|ניחוש|תשובה|שאלה|בהתאם|לפי)/;

  const results = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const numMatch    = trimmed.match(/^\d+[.)]\s*(.+)/);
    const bulletMatch = !numMatch && trimmed.match(/^[•\-*]\s+(.+)/);
    const content     = (numMatch?.[1] || bulletMatch?.[1] || '').trim();

    if (!content) continue;
    if (META.test(content)) continue;

    const dashIdx   = content.indexOf(' - ');
    const answer    = (dashIdx > -1 ? content.slice(0, dashIdx) : content).trim();
    let explanation = (dashIdx > -1 ? content.slice(dashIdx + 3) : '').trim();

    if (!answer || answer.length < 2) continue;
    // Skip results where the AI itself says it doesn't fit
    if (/לא מתאים|לא רלוונטי|לא קשור|אינו מתאים/.test(explanation)) continue;

    explanation = explanation
      .replace(/\([\d\+]+\)/g, '')
      .replace(/\d+\s*אותיות/g, '')
      .trim();

    results.push({ answer, explanation });
  }

  return results;
}
