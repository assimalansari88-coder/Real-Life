import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const limitByIp = new Map();
let globalDay = new Date().toISOString().slice(0, 10);
let globalDailyCount = 0;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml' };

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 80_000) throw Object.assign(new Error('حجم الرسالة كبير.'), { status: 413 });
  }
  try { return JSON.parse(raw || '{}'); }
  catch { throw Object.assign(new Error('الطلب غير صالح.'), { status: 400 }); }
}

function allowed(ip) {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  if (today !== globalDay) { globalDay = today; globalDailyCount = 0; limitByIp.clear(); }
  const record = limitByIp.get(ip) || { minute: [], day: 0 };
  record.minute = record.minute.filter(time => now - time < 60_000);
  if (record.minute.length >= Number(process.env.MAX_PER_MINUTE || 10) || record.day >= Number(process.env.MAX_DAILY_PER_IP || 60) || globalDailyCount >= Number(process.env.MAX_DAILY_REQUESTS || 500)) return false;
  record.minute.push(now);
  record.day++;
  globalDailyCount++;
  limitByIp.set(ip, record);
  return true;
}

async function chat(req, res) {
  if (!process.env.ANTHROPIC_API_KEY) return json(res, 503, { error: 'أضف مفتاح ANTHROPIC_API_KEY في إعدادات الخادم لتفعيل الذكاء الاصطناعي.' });
  const ip = req.socket.remoteAddress || 'unknown';
  if (!allowed(ip)) return json(res, 429, { error: 'وصلت للحد المؤقت. انتظر دقيقة وحاول مرة ثانية.' });
  const input = await readJson(req);
  if (!Array.isArray(input.messages) || !input.messages.length || input.messages.length > 24) return json(res, 400, { error: 'أرسل من رسالة إلى 24 رسالة.' });
  const messages = [];
  for (const message of input.messages) {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim() || message.content.length > 12_000)
      return json(res, 400, { error: 'تأكد من صيغة الرسائل (حد الرسالة 12,000 حرف).' });
    messages.push({ role: message.role, content: message.content.trim() });
  }
  if (messages.at(-1).role !== 'user') return json(res, 400, { error: 'آخر رسالة لازم تكون منك.' });

  let upstream;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 1400, stream: true,
        system: 'أنت شوق، مساعد ذكي ودود وواضح. أجب بلغة المستخدم، ويفضل العربية الخليجية البسيطة إذا كتب بالعربية. كن صريحًا إذا لم تعرف، ونسّق الردود الطويلة بعناوين وقوائم قصيرة.',
        messages })
    });
  } catch {
    return json(res, 502, { error: 'تعذر الاتصال بمزوّد الذكاء الاصطناعي. حاول مرة أخرى.' });
  }
  if (!upstream.ok) {
    const errorText = await upstream.text().catch(() => '');
    console.error('AI provider returned', upstream.status, errorText.slice(0, 500));
    return json(res, 502, { error: upstream.status === 401 ? 'مفتاح الذكاء الاصطناعي غير صالح.' : 'تعذر إكمال الرد الآن. حاول مرة أخرى.' });
  }

  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Content-Type-Options': 'nosniff' });
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const events = pending.split('\n\n');
      pending = events.pop() || '';
      for (const event of events) {
        const line = event.split('\n').find(part => part.startsWith('data: '));
        if (!line) continue;
        let data;
        try { data = JSON.parse(line.slice(6)); } catch { continue; }
        if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') res.write(`data: ${JSON.stringify({ text: data.delta.text })}\n\n`);
        if (data.type === 'message_stop') res.write('data: [DONE]\n\n');
        if (data.type === 'error') res.write(`data: ${JSON.stringify({ error: 'انقطع الرد. حاول مرة أخرى.' })}\n\n`);
      }
    }
    res.end();
  } catch (error) {
    if (!res.destroyed) { res.write(`data: ${JSON.stringify({ error: 'انقطع الاتصال أثناء الرد.' })}\n\n`); res.end(); }
  }
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/health' && req.method === 'GET') return json(res, 200, { ok: true, aiReady: Boolean(process.env.ANTHROPIC_API_KEY), model });
  if (url.pathname === '/api/chat' && req.method === 'POST') return chat(req, res);
  if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'المسار غير موجود.' });
  const name = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  if (name.includes('..') || name.includes('\\')) return json(res, 400, { error: 'الطلب غير صالح.' });
  try {
    const content = await readFile(resolve(root, name));
    res.writeHead(200, { 'Content-Type': types[extname(name)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Cache-Control': name === 'index.html' ? 'no-cache' : 'public, max-age=3600' });
    res.end(content);
  } catch { json(res, 404, { error: 'الصفحة غير موجودة.' }); }
}

createServer((req, res) => handle(req, res).catch(error => {
  console.error(error);
  if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : 'حدث خطأ في الخادم.' });
  else res.end();
})).listen(port, '0.0.0.0', () => console.log(`شوق يستمع على المنفذ ${port}`));

