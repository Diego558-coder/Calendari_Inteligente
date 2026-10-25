import assert from 'node:assert/strict';
import { normalizeTime, parseDay, sanitizeEvent, generateICS, detectConflicts, isSameActivity, layoutOverlaps } from '@/lib/schedule-utils';
import { isAvailabilityBlock } from '@/lib/ai/schedule-ai';
import { getZonedNow, addDaysISO } from '@/lib/timezone';
import { dueReminders, reminderPayload, formatMinutesUntil } from '@/lib/push';
import { encodeStaticToken, decodeStaticToken, describeCalendarClient } from '@/lib/profile';
import { extractJson } from '@/lib/ai/errors';
import { rankGeminiModels } from '@/lib/ai/gemini';
import { ScheduleEvent } from '@/types/schedule';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log('✓', name);
}

test('normalizeTime', () => {
  assert.equal(normalizeTime('8am'), '08:00');
  assert.equal(normalizeTime('2 pm'), '14:00');
  assert.equal(normalizeTime('2:30 p. m.'), '14:30');
  assert.equal(normalizeTime('14:30'), '14:30');
  assert.equal(normalizeTime('7.30'), '07:30');
  assert.equal(normalizeTime('7h30'), '07:30');
  assert.equal(normalizeTime('0730'), '07:30');
  assert.equal(normalizeTime('12 am'), '00:00');
  assert.equal(normalizeTime('12pm'), '12:00');
  assert.equal(normalizeTime('7 de la noche'), '19:00');
  assert.equal(normalizeTime('24:00'), '23:59');
  assert.equal(normalizeTime('25:00'), null);
  assert.equal(normalizeTime('hola'), null);
  assert.equal(normalizeTime(null), null);
});

test('parseDay', () => {
  assert.equal(parseDay('Miércoles'), 'miercoles');
  assert.equal(parseDay('MIE.'), 'miercoles');
  assert.equal(parseDay('X'), 'miercoles');
  assert.equal(parseDay('M'), 'martes');
  assert.equal(parseDay('martes'), 'martes');
  assert.equal(parseDay('Sábado'), 'sabado');
  assert.equal(parseDay('sunday'), 'domingo');
  assert.equal(parseDay('Thursday'), 'jueves');
  assert.equal(parseDay('???'), null);
});

test('sanitizeEvent valida y corrige', () => {
  assert.equal(sanitizeEvent({ title: '', dayOfWeek: 'lunes', startTime: '8' }), null);
  const noEnd = sanitizeEvent({ title: 'Inglés', dayOfWeek: 'sábado', startTime: '2pm' })!;
  assert.equal(noEnd.endTime, '15:00');
  assert.equal(noEnd.dayOfWeek, 'sabado');
  assert.equal(noEnd.type, 'personal');
  const night = sanitizeEvent({ title: 'Turno noche', dayOfWeek: 'viernes', startTime: '22:00', endTime: '06:00', type: 'work' })!;
  assert.equal(night.endTime, '23:59');
  assert.match(night.notes!, /06:00 del día siguiente/);
  assert.equal(sanitizeEvent({ title: 'X', dayOfWeek: 'lunes', startTime: '8', location: 'null' })!.location, undefined);
});

test('generateICS es válido y respeta RFC 5545', () => {
  const events: ScheduleEvent[] = [
    { id: 'a1', title: 'Cálculo, Grupo 2; aula', type: 'university', dayOfWeek: 'lunes', startTime: '07:00', endTime: '09:00', location: 'Edificio 3, Aula 204' },
    { id: 'b2', title: 'Turno', type: 'work', dayOfWeek: 'domingo', startTime: '14:00', endTime: '18:00', notes: 'Una nota muy larga '.repeat(10) },
  ];
  const ics = generateICS(events, { alarmMinutes: 30, timezone: 'America/Bogota', now: new Date('2026-10-25T15:00:00Z') });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('SUMMARY:🎓 Cálculo\\, Grupo 2\\; aula'));
  assert.ok(ics.includes('LOCATION:Edificio 3\\, Aula 204'));
  assert.ok(ics.includes('TRIGGER;RELATED=START:-PT30M'));
  assert.ok(ics.includes('X-WR-TIMEZONE:America/Bogota'));
  // 25 oct 2026 es domingo en Bogotá → lunes de esa semana = 19 oct
  assert.ok(ics.includes('DTSTART:20261019T070000'), 'lunes de la semana actual');
  assert.ok(ics.includes('DTSTART:20261025T140000'), 'domingo de la semana actual');
  const encoder = new TextEncoder();
  for (const line of ics.split('\r\n')) assert.ok(encoder.encode(line).length <= 75, `línea demasiado larga: ${line}`);
});

test('zona horaria', () => {
  // 2026-10-26 03:30 UTC = domingo 25 a las 22:30 en Bogotá (UTC-5)
  const z = getZonedNow('America/Bogota', new Date('2026-10-26T03:30:00Z'));
  assert.deepEqual(z, { dayIndex: 6, minutes: 22 * 60 + 30, dateISO: '2026-10-25' });
  assert.equal(addDaysISO('2026-12-31', 1), '2027-01-01');
  assert.equal(getZonedNow('Zona/Invalida', new Date('2026-10-26T03:30:00Z')).dateISO, '2026-10-25');
});

test('dueReminders: ventana de aviso y cruce de medianoche', () => {
  const events: ScheduleEvent[] = [
    { id: 'c1', title: 'Cálculo', type: 'university', dayOfWeek: 'lunes', startTime: '07:00', endTime: '09:00' },
    { id: 'c2', title: 'Física', type: 'university', dayOfWeek: 'lunes', startTime: '10:00', endTime: '12:00' },
    { id: 'c3', title: 'Madrugada', type: 'work', dayOfWeek: 'martes', startTime: '00:30', endTime: '06:00' },
  ];
  const profile = { events, timezone: 'America/Bogota', alarmMinutes: 60 };
  // Lunes 26 oct 06:05 en Bogotá = 11:05 UTC → Cálculo en 55 min
  let due = dueReminders(profile, new Date('2026-10-26T11:05:00Z'));
  assert.deepEqual(due.map((d) => [d.event.id, d.minutesUntil, d.date]), [['c1', 55, '2026-10-26']]);
  // Lunes 05:59 → aún no (61 min)
  assert.equal(dueReminders(profile, new Date('2026-10-26T10:59:00Z')).length, 0);
  // Lunes 23:45 → Madrugada del martes en 45 min (fecha del martes)
  due = dueReminders(profile, new Date('2026-10-27T04:45:00Z'));
  assert.deepEqual(due.map((d) => [d.event.id, d.minutesUntil, d.date]), [['c3', 45, '2026-10-27']]);
  // Ya empezó: no avisar
  assert.equal(dueReminders(profile, new Date('2026-10-26T12:00:00Z')).length, 0);
  assert.equal(dueReminders({ ...profile, alarmMinutes: 0 }, new Date('2026-10-26T11:05:00Z')).length, 0);
  const payload = reminderPayload({ event: events[0], minutesUntil: 55, date: '2026-10-26' });
  assert.equal(payload.title, '🎓 Cálculo en 55 min');
  assert.equal(formatMinutesUntil(90), '1 hora y 30 min');
});

test('token estático ida y vuelta', () => {
  const events: ScheduleEvent[] = Array.from({ length: 40 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    title: `Materia número ${i} con nombre largo`,
    type: i % 3 === 0 ? 'work' : 'university',
    dayOfWeek: (['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const)[i % 7],
    startTime: '08:00',
    endTime: '10:00',
    location: `Aula ${i}`,
  }));
  const token = encodeStaticToken(events, 'America/Lima', 30);
  console.log(`   (40 eventos → token de ${token.length} caracteres)`);
  assert.ok(token.length < 4000);
  const decoded = decodeStaticToken(token)!;
  assert.equal(decoded.events.length, 40);
  assert.equal(decoded.timezone, 'America/Lima');
  assert.equal(decoded.alarmMinutes, 30);
  assert.equal(decoded.events[3].title, 'Materia número 3 con nombre largo');
  assert.equal(decodeStaticToken('s_basura!!'), null);
});

test('describeCalendarClient', () => {
  assert.equal(describeCalendarClient('iOS/18.1 (22B83) dataaccessd/1.0'), 'Apple Calendar (iPhone / Mac)');
  assert.equal(describeCalendarClient('Google-Calendar-Importer'), 'Google Calendar');
  assert.equal(describeCalendarClient('Mozilla/5.0 (Windows NT 10.0) Chrome/130'), null);
});

test('extractJson tolera texto extra', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('```json\n{"a":2}\n```'), { a: 2 });
  assert.deepEqual(extractJson('<think>razono…</think>Aquí está: {"a":3} listo'), { a: 3 });
  assert.throws(() => extractJson('sin json'));
});

test('rankGeminiModels prioriza Flash estable y descarta variantes', () => {
  const ranked = rankGeminiModels([
    'gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3-flash-preview', 'gemini-3.1-flash-tts-preview',
    'gemini-3.8-live', 'gemini-4-argon', 'gemini-flash-latest', 'gemini-2.5-flash-image', 'gemini-3.6-flash', 'gemma-4-27b-it',
  ]);
  assert.deepEqual(ranked, ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-3.5-flash-lite']);
});

test('conflictos e isSameActivity', () => {
  const a = { id: '1', title: 'A', type: 'university' as const, dayOfWeek: 'lunes' as const, startTime: '10:00', endTime: '12:00' };
  const b = { ...a, id: '2', title: 'B', startTime: '11:00', endTime: '15:00' };
  assert.equal(detectConflicts([a, b])[0].overlapMinutes, 60);
  assert.ok(isSameActivity(a, { ...b, startTime: '10:00', title: ' a ' }));
});

test('isAvailabilityBlock reconoce bloques de disponibilidad', () => {
  for (const title of ['Disponible', 'DISPONIBLE', '05:00-18:00 Disponible', 'Available', 'Libre', 'Sin asignar', 'No disponible', 'disponibilidad']) {
    assert.ok(isAvailabilityBlock(title), title);
  }
  for (const title of ['M4L14', 'Cálculo Diferencial', 'Turno disponible para cubrir', 'Inglés libre conversación']) {
    assert.ok(!isAvailabilityBlock(title), title);
  }
});

test('layoutOverlaps pone lado a lado los eventos que se cruzan', () => {
  const ev = (id: string, startTime: string, endTime: string): ScheduleEvent => ({ id, title: id, type: 'work', dayOfWeek: 'lunes', startTime, endTime });
  const lanes = layoutOverlaps([ev('a', '07:00', '09:00'), ev('b', '08:00', '10:00'), ev('c', '09:00', '11:00'), ev('d', '12:00', '13:00')]);
  // a y b se cruzan; c reutiliza la columna de a (que ya terminó); d va sola
  assert.deepEqual(lanes.get('a'), { column: 0, columns: 2 });
  assert.deepEqual(lanes.get('b'), { column: 1, columns: 2 });
  assert.deepEqual(lanes.get('c'), { column: 0, columns: 2 });
  assert.deepEqual(lanes.get('d'), { column: 0, columns: 1 });
  // Un bloque largo (como "Disponible" 06:00-20:00) con tres clases encima
  const big = layoutOverlaps([ev('x', '06:00', '20:00'), ev('y', '07:00', '09:00'), ev('z', '10:00', '12:00')]);
  assert.equal(big.get('x')!.columns, 2);
  assert.equal(big.get('y')!.column, 1);
  assert.equal(big.get('z')!.column, 1);
});

console.log(`\n${passed} grupos de pruebas pasaron`);
