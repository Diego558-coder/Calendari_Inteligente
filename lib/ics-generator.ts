import { ScheduleEvent } from '@/types/schedule';

function generateICSEvents(events: ScheduleEvent[], alarmMinutesBefore: number): string {
  const dayCodeMap: Record<string, string> = {
    lunes: 'MO',
    martes: 'TU',
    miercoles: 'WE',
    jueves: 'TH',
    viernes: 'FR',
    sabado: 'SA',
    domingo: 'SU',
  };

  const now = new Date();
  const currentDay = now.getDay();
  const daysUntilNextMonday = (8 - currentDay) % 7 || 7;
  const baseMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilNextMonday);

  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Calendario Dinamico IA//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Horario Universidad y Trabajo',
    'X-WR-TIMEZONE:America/Bogota',
  ];

  events.forEach((ev) => {
    const dayOffset = (({ lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 0 } as Record<string, number>)[ev.dayOfWeek] - 1 + 7) % 7;
    const eventDate = new Date(baseMonday);
    eventDate.setDate(eventDate.getDate() + dayOffset);

    const [startH, startM] = ev.startTime.split(':').map(Number);
    const [endH, endM] = ev.endTime.split(':').map(Number);

    const start = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), startH, startM);
    const end = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), endH, endM);

    const pad = (n: number) => n.toString().padStart(2, '0');
    const formatICSDate = (d: Date) =>
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

    const dtStart = formatICSDate(start);
    const dtEnd = formatICSDate(end);
    const dtStamp = formatICSDate(new Date()) + 'Z';
    const rrule = `RRULE:FREQ=WEEKLY;BYDAY=${dayCodeMap[ev.dayOfWeek]}`;

    const typeLabel = ev.type === 'university' ? '🎓 Universidad' : ev.type === 'work' ? '💼 Trabajo' : '📌 Actividad';
    const description = `${typeLabel}: ${ev.title}${ev.teacher ? `\\nProfesor/Jefe: ${ev.teacher}` : ''}${ev.notes ? `\\nNotas: ${ev.notes}` : ''}`;

    ics.push(
      'BEGIN:VEVENT',
      `UID:${ev.id}@calendario-ia.local`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      rrule,
      `SUMMARY:[${typeLabel}] ${ev.title}`,
      `DESCRIPTION:${description}`,
      ev.location ? `LOCATION:${ev.location}` : 'LOCATION:',
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      `TRIGGER:-PT${alarmMinutesBefore}M`,
      'ACTION:DISPLAY',
      `DESCRIPTION:Recordatorio: ${ev.title} comienza en ${alarmMinutesBefore} minutos`,
      'END:VALARM',
      'END:VEVENT'
    );
  });

  ics.push('END:VCALENDAR');
  return ics.join('\r\n');
}

export { generateICSEvents };