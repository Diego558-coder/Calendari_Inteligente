import assert from 'node:assert/strict';
import { runScheduleChat, extractScheduleFromImage } from '@/lib/ai/schedule-ai';
import { ScheduleEvent } from '@/types/schedule';

type Handler = (url: string, init: any) => { status: number; body: any };
const calls: { url: string; body: any }[] = [];
let handler: Handler;

(globalThis as any).fetch = async (url: string, init: any = {}) => {
  const body = init.body ? JSON.parse(init.body) : undefined;
  calls.push({ url, body });
  const r = handler(url, init);
  return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status });
};

const events: ScheduleEvent[] = [
  { id: 'uuid-calculo', title: 'Cálculo', type: 'university', dayOfWeek: 'lunes', startTime: '07:00', endTime: '09:00' },
  { id: 'uuid-ingles', title: 'Inglés', type: 'personal', dayOfWeek: 'sabado', startTime: '14:00', endTime: '15:00' },
  { id: 'uuid-turno', title: 'Turno tienda', type: 'work', dayOfWeek: 'viernes', startTime: '14:00', endTime: '18:00' },
];

const groqModels = { data: [{ id: 'openai/gpt-oss-120b', active: true }, { id: 'openai/gpt-oss-20b', active: true }, { id: 'whisper-large-v3', active: true }, { id: 'qwen/qwen3.8-27b', active: true }] };

async function main() {
  // 1. Chat con Groq: agregar en dos días, mover (conservando duración), borrar, y una ref inventada
  handler = (url) => {
    if (url.endsWith('/models')) return { status: 200, body: groqModels };
    return {
      status: 200,
      body: {
        choices: [{ message: { content: JSON.stringify({
          reply: 'Listo: agendé gimnasio, moví inglés y borré el turno.',
          actions: [
            { type: 'add', eventId: null, event: { title: 'Gimnasio', type: 'personal', dayOfWeek: 'lunes', startTime: '6 pm', endTime: null, location: null, teacher: null, notes: null } },
            { type: 'add', eventId: null, event: { title: 'Gimnasio', type: 'personal', dayOfWeek: 'miércoles', startTime: '18:00', endTime: '19:30', location: null, teacher: null, notes: null } },
            { type: 'update', eventId: 'e2', event: { title: null, type: null, dayOfWeek: null, startTime: '15:00', endTime: null, location: null, teacher: null, notes: null } },
            { type: 'delete', eventId: 'e3', event: { title: null, type: null, dayOfWeek: null, startTime: null, endTime: null, location: null, teacher: null, notes: null } },
            { type: 'delete', eventId: 'e99', event: null },
            { type: 'delete', eventId: '', event: null },
          ],
        }) } }],
      },
    };
  };
  let chat = await runScheduleChat({ message: 'agenda gimnasio...', history: [{ role: 'user', text: 'hola' }, { role: 'assistant', text: 'hola!' }], events, timezone: 'America/Bogota', keys: { groq: 'gsk_' + 'a'.repeat(40) } });
  assert.equal(chat.provider, 'groq');
  assert.equal(chat.model, 'openai/gpt-oss-120b');
  assert.deepEqual(chat.actions, [
    { type: 'add', event: { title: 'Gimnasio', type: 'personal', dayOfWeek: 'lunes', startTime: '18:00', endTime: '19:00', location: undefined, teacher: undefined, notes: undefined } },
    { type: 'add', event: { title: 'Gimnasio', type: 'personal', dayOfWeek: 'miercoles', startTime: '18:00', endTime: '19:30', location: undefined, teacher: undefined, notes: undefined } },
    { type: 'update', eventId: 'uuid-ingles', event: { startTime: '15:00', endTime: '16:00' } },
    { type: 'delete', eventId: 'uuid-turno' },
  ]);
  const sent = calls.find((c) => c.url.endsWith('/chat/completions'))!.body;
  assert.equal(sent.response_format.type, 'json_schema');
  assert.equal(sent.reasoning_effort, 'low');
  assert.equal(sent.messages.length, 4, 'system + 2 historial + usuario');
  assert.match(sent.messages[0].content, /e1 \| Cálculo \| university \| lunes \| 07:00-09:00/);
  console.log('✓ chat Groq: acciones resueltas, refs inventadas/vacías descartadas (no borra todo)');

  // 2. Si la IA solo devuelve acciones inválidas, se pide aclaración en vez de afirmar éxito
  calls.length = 0;
  handler = (url) => url.endsWith('/models')
    ? { status: 200, body: groqModels }
    : { status: 200, body: { choices: [{ message: { content: '{"reply":"Listo, borré la clase.","actions":[{"type":"delete","eventId":"Matemáticas","event":null}]}' } }] } };
  chat = await runScheduleChat({ message: 'borra matemáticas', history: [], events, keys: { groq: 'gsk_' + 'a'.repeat(40) } });
  assert.equal(chat.actions.length, 0);
  assert.match(chat.reply, /No pude identificar/);
  console.log('✓ chat: acciones irreconocibles → pide aclaración');

  // 3. Si el esquema estricto da 400, reintenta el mismo modelo en modo JSON simple
  calls.length = 0;
  let attempt = 0;
  handler = (url) => {
    if (url.endsWith('/models')) return { status: 200, body: groqModels };
    attempt++;
    if (attempt === 1) return { status: 400, body: { error: { message: 'json_schema not supported' } } };
    return { status: 200, body: { choices: [{ message: { content: '```json\n{"reply":"Mañana (martes) no tienes actividades.","actions":[]}\n```' } }] } };
  };
  chat = await runScheduleChat({ message: '¿qué tengo mañana?', history: [], events, keys: { groq: 'gsk_' + 'a'.repeat(40) } });
  assert.equal(chat.reply, 'Mañana (martes) no tienes actividades.');
  const completions = calls.filter((c) => c.url.endsWith('/chat/completions'));
  assert.equal(completions[1].body.response_format.type, 'json_object');
  assert.equal(completions[1].body.model, completions[0].body.model);
  console.log('✓ chat: reintento sin esquema cuando el modelo lo rechaza');

  // 4. Foto: Gemini sin cuota (429 en todos sus modelos) → respaldo automático con Groq (visión)
  calls.length = 0;
  handler = (url) => {
    if (url.includes('generativelanguage') && url.includes('/models?')) {
      return { status: 200, body: { models: [
        { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.1-flash-tts-preview', supportedGenerationMethods: ['generateContent'] },
      ] } };
    }
    if (url.includes('generativelanguage')) return { status: 429, body: { error: { status: 'RESOURCE_EXHAUSTED' } } };
    if (url.endsWith('/models')) return { status: 200, body: groqModels };
    return {
      status: 200,
      body: { choices: [{ message: { content: JSON.stringify({ warning: null, items: [
        { title: 'FÍSICA MECÁNICA', dayOfWeek: 'Lunes', startTime: '7:00', endTime: '9:00 am', location: 'Lab B', teacher: null, notes: null },
        { title: 'FÍSICA MECÁNICA', dayOfWeek: 'Lunes', startTime: '7:00', endTime: '9:00 am', location: 'Lab B', teacher: null, notes: null },
        { title: 'Química', dayOfWeek: 'X', startTime: '2pm', endTime: '4pm', location: null, teacher: 'Dra. Ruiz', notes: null },
        { title: '', dayOfWeek: 'lunes', startTime: '8:00', endTime: '9:00', location: null, teacher: null, notes: null },
      ] }) } }] },
    };
  };
  const scan = await extractScheduleFromImage({ imageBase64: 'AAAA', mimeType: 'image/jpeg', scheduleType: 'university', keys: { gemini: 'AIzaSy' + 'b'.repeat(33), groq: 'gsk_' + 'a'.repeat(40) } });
  assert.equal(scan.provider, 'groq');
  assert.equal(scan.model, 'qwen/qwen3.8-27b');
  assert.equal(scan.events.length, 2, 'duplicado y sin título descartados');
  assert.deepEqual(scan.events.map((e) => [e.title, e.dayOfWeek, e.startTime, e.endTime, e.type]), [
    ['FÍSICA MECÁNICA', 'lunes', '07:00', '09:00', 'university'],
    ['Química', 'miercoles', '14:00', '16:00', 'university'],
  ]);
  assert.ok(scan.warnings[0].includes('Google Gemini'), 'avisa que se usó el respaldo');
  const geminiCalls = calls.filter((c) => c.url.includes(':generateContent'));
  assert.deepEqual(geminiCalls.map((c) => c.url.split('/models/')[1].split(':')[0]), ['gemini-3.8-flash', 'gemini-3.5-flash-lite'], 'no prueba modelos TTS');
  const visionCall = calls.find((c) => c.url.endsWith('/chat/completions'))!.body;
  assert.equal(visionCall.messages[1].content[1].image_url.url, 'data:image/jpeg;base64,AAAA');
  console.log('✓ foto: Gemini sin cuota → Groq visión; duplicados y basura filtrados');

  // 5. Gemini funciona directo con esquema y datos inline
  calls.length = 0;
  handler = (url) => {
    if (url.includes('/models?')) return { status: 200, body: { models: [{ name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] }] } };
    return { status: 200, body: { candidates: [{ content: { parts: [{ text: 'pensando', thought: true }, { text: '{"items":[{"title":"Turno mañana","dayOfWeek":"sabado","startTime":"06:00","endTime":"14:00"}],"warning":null}' }] } }] } };
  };
  const scan2 = await extractScheduleFromImage({ imageBase64: 'BBBB', mimeType: 'image/png', scheduleType: 'work', keys: { gemini: 'AIzaSy' + 'c'.repeat(33) } });
  assert.equal(scan2.model, 'gemini-flash-latest');
  assert.equal(scan2.events[0].type, 'work');
  const req = calls.find((c) => c.url.includes(':generateContent'))!.body;
  assert.equal(req.contents[0].parts[1].inlineData.mimeType, 'image/png');
  assert.ok(req.generationConfig.responseSchema);
  console.log('✓ foto: Gemini directo (ignora partes de "pensamiento")');

  // 6. Horario de trabajo tipo plataforma: bloques verdes "Disponible" + clases asignadas en azul
  calls.length = 0;
  handler = (url) => {
    if (url.includes('/models?')) return { status: 200, body: { models: [{ name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] }] } };
    const items = [
      { title: 'Disponible', dayOfWeek: 'lunes', startTime: '06:00', endTime: '20:00' },
      { title: 'M4L14', dayOfWeek: 'lunes', startTime: '20:00', endTime: '21:30', notes: 'COL13241_LU-20' },
      { title: '05:00-18:00 Disponible', dayOfWeek: 'martes', startTime: '05:00', endTime: '18:00' },
      { title: 'M1L3', dayOfWeek: 'martes', startTime: '18:00', endTime: '19:00', notes: 'PRM_COL14394_MA-18' },
      { title: 'DISPONIBLE', dayOfWeek: 'miercoles', startTime: '05:00', endTime: '18:00' },
    ];
    return { status: 200, body: { candidates: [{ content: { parts: [{ text: JSON.stringify({ items, warning: null }) }] } }] } };
  };
  const work = await extractScheduleFromImage({ imageBase64: 'DDDD', mimeType: 'image/jpeg', scheduleType: 'work', keys: { gemini: 'AIzaSy' + 'e'.repeat(33) } });
  assert.deepEqual(work.events.map((e) => [e.title, e.dayOfWeek, e.startTime, e.endTime, e.notes]), [
    ['M4L14', 'lunes', '20:00', '21:30', 'COL13241_LU-20'],
    ['M1L3', 'martes', '18:00', '19:00', 'PRM_COL14394_MA-18'],
  ]);
  assert.match(work.warnings.join(' '), /ignoraron 3 bloques de "Disponible"/);
  const prompt = calls.find((c) => c.url.includes(':generateContent'))!.body.systemInstruction.parts[0].text;
  assert.match(prompt, /DISPONIBILIDAD NO son actividades/);
  console.log('✓ foto: bloques "Disponible" descartados, solo quedan las clases asignadas');

  // 7. Modelos Flash saturados (503 "high demand") → pasa a un Flash-Lite libre, con razonamiento bajo
  calls.length = 0;
  handler = (url) => {
    if (url.includes('/models?')) {
      return { status: 200, body: { models: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite'].map((m) => ({ name: `models/${m}`, supportedGenerationMethods: ['generateContent'] })) } };
    }
    if (url.includes('flash-lite')) {
      return { status: 200, body: { candidates: [{ content: { parts: [{ text: '{"items":[{"title":"M4L14","dayOfWeek":"lunes","startTime":"20:00","endTime":"21:30"}],"warning":null}' }] } }] } };
    }
    return { status: 503, body: { error: { code: 503, message: 'This model is currently experiencing high demand.', status: 'UNAVAILABLE' } } };
  };
  const busy = await extractScheduleFromImage({ imageBase64: 'EEEE', mimeType: 'image/jpeg', scheduleType: 'work', keys: { gemini: 'AIzaSy' + 'f'.repeat(33) } });
  assert.equal(busy.model, 'gemini-3.5-flash-lite');
  const liteRequest = calls.filter((c) => c.url.includes(':generateContent')).at(-1)!.body;
  assert.deepEqual(liteRequest.generationConfig.thinkingConfig, { thinkingLevel: 'low' });
  console.log('✓ foto: Flash saturados (503) → Flash-Lite, con razonamiento bajo');

  // Todos saturados → mensaje claro de saturación (no "sin modelo")
  calls.length = 0;
  handler = (url) => url.includes('/models?')
    ? { status: 200, body: { models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }] } }
    : { status: 503, body: { error: { status: 'UNAVAILABLE' } } };
  await assert.rejects(
    extractScheduleFromImage({ imageBase64: 'FFFF', mimeType: 'image/jpeg', scheduleType: 'work', keys: { gemini: 'AIzaSy' + 'g'.repeat(33) } }),
    (err: any) => err.code === 'OVERLOADED' && /saturados/.test(err.message) && /503/.test(err.detail)
  );
  console.log('✓ todos saturados → error OVERLOADED con detalle');

  // 8. Clave inválida de Gemini: se detiene enseguida (no prueba 5 modelos)
  calls.length = 0;
  handler = () => ({ status: 400, body: { error: { message: 'API key not valid. Please pass a valid API key.', details: [{ reason: 'API_KEY_INVALID' }] } } });
  await assert.rejects(
    extractScheduleFromImage({ imageBase64: 'CCCC', mimeType: 'image/jpeg', scheduleType: 'university', keys: { gemini: 'AIzaSy' + 'd'.repeat(33) } }),
    (err: any) => err.code === 'INVALID_KEY'
  );
  assert.equal(calls.length, 1);
  console.log('✓ clave inválida: corta en la primera llamada');

  console.log('\nPruebas del flujo de IA OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
