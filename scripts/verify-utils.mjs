import assert from 'node:assert';

// Import tests for schedule utility logic
function timeToMinutes(timeStr) {
  const parts = timeStr.trim().split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function minutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function detectConflicts(events) {
  const conflicts = [];
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];
      if (a.dayOfWeek !== b.dayOfWeek) continue;
      const sA = timeToMinutes(a.startTime);
      const eA = timeToMinutes(a.endTime);
      const sB = timeToMinutes(b.startTime);
      const eB = timeToMinutes(b.endTime);
      if (sA < eB && sB < eA) {
        conflicts.push({ a: a.title, b: b.title, overlap: Math.min(eA, eB) - Math.max(sA, sB) });
      }
    }
  }
  return conflicts;
}

console.log('--- Probando funciones de cálculo de horarios ---');

// 1. Time conversion
assert.strictEqual(timeToMinutes('08:30'), 510);
assert.strictEqual(timeToMinutes('14:00'), 840);
assert.strictEqual(minutesToTime(510), '08:30');
assert.strictEqual(minutesToTime(840), '14:00');
console.log('✓ Conversión de tiempo aprobada');

// 2. Conflict detection
const testEvents = [
  { id: '1', title: 'Clase Física', dayOfWeek: 'lunes', startTime: '10:00', endTime: '12:00' },
  { id: '2', title: 'Turno Trabajo', dayOfWeek: 'lunes', startTime: '11:00', endTime: '15:00' },
  { id: '3', title: 'Cálculo', dayOfWeek: 'martes', startTime: '08:00', endTime: '10:00' },
];
const conflicts = detectConflicts(testEvents);
assert.strictEqual(conflicts.length, 1);
assert.strictEqual(conflicts[0].overlap, 60);
console.log('✓ Detección de solapamientos aprobada (conflicto de 60 min detectado)');

console.log('--- Todas las pruebas del motor de horarios pasaron con éxito ---');

