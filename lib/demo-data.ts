import { ScheduleEvent } from '@/types/schedule';

export const DEMO_EVENTS: ScheduleEvent[] = [
  // Lunes
  {
    id: 'demo-1',
    title: 'Cálculo Diferencial',
    type: 'university',
    dayOfWeek: 'lunes',
    startTime: '07:00',
    endTime: '09:00',
    location: 'Edificio 3 - Aula 204',
    teacher: 'Ing. Carlos Mendoza',
    notes: 'Traer calculadora científica',
  },
  {
    id: 'demo-2',
    title: 'Física Mecánica',
    type: 'university',
    dayOfWeek: 'lunes',
    startTime: '10:00',
    endTime: '12:00',
    location: 'Laboratorio de Física B',
    teacher: 'Dra. Elena Rojas',
  },
  {
    id: 'demo-3',
    title: 'Turno en Atención al Cliente',
    type: 'work',
    dayOfWeek: 'lunes',
    startTime: '14:00',
    endTime: '18:00',
    location: 'Oficina Central / Remoto',
    teacher: 'Supervisor: Martín Gómez',
  },

  // Martes
  {
    id: 'demo-4',
    title: 'Programación Orientada a Objetos',
    type: 'university',
    dayOfWeek: 'martes',
    startTime: '08:00',
    endTime: '11:00',
    location: 'Sala de Cómputo 4',
    teacher: 'Prof. Andrés Silva',
  },
  {
    id: 'demo-5',
    title: 'Turno Soporte Técnico',
    type: 'work',
    dayOfWeek: 'martes',
    startTime: '13:00',
    endTime: '17:00',
    location: 'Sede Norte',
  },

  // Miércoles
  {
    id: 'demo-6',
    title: 'Cálculo Diferencial',
    type: 'university',
    dayOfWeek: 'miercoles',
    startTime: '07:00',
    endTime: '09:00',
    location: 'Edificio 3 - Aula 204',
    teacher: 'Ing. Carlos Mendoza',
  },
  {
    id: 'demo-7',
    title: 'Álgebra Lineal',
    type: 'university',
    dayOfWeek: 'miercoles',
    startTime: '11:00',
    endTime: '13:00',
    location: 'Aula Magna 1',
  },
  {
    id: 'demo-8',
    title: 'Turno en Atención al Cliente',
    type: 'work',
    dayOfWeek: 'miercoles',
    startTime: '15:00',
    endTime: '19:00',
  },

  // Jueves
  {
    id: 'demo-9',
    title: 'Estructuras de Datos',
    type: 'university',
    dayOfWeek: 'jueves',
    startTime: '09:00',
    endTime: '12:00',
    location: 'Laboratorio 2',
  },
  {
    id: 'demo-10',
    title: 'Turno Soporte Técnico',
    type: 'work',
    dayOfWeek: 'jueves',
    startTime: '14:00',
    endTime: '18:00',
  },

  // Viernes
  {
    id: 'demo-11',
    title: 'Física Mecánica (Taller)',
    type: 'university',
    dayOfWeek: 'viernes',
    startTime: '08:00',
    endTime: '10:00',
    location: 'Aula 105',
  },
  {
    id: 'demo-12',
    title: 'Álgebra Lineal',
    type: 'university',
    dayOfWeek: 'viernes',
    startTime: '10:30',
    endTime: '12:30',
    location: 'Aula Magna 1',
  },
  {
    id: 'demo-13',
    title: 'Turno Laboral de Cierre',
    type: 'work',
    dayOfWeek: 'viernes',
    startTime: '14:00',
    endTime: '18:00',
  },

  // Sábado
  {
    id: 'demo-14',
    title: 'Inglés Técnico Avanzado',
    type: 'university',
    dayOfWeek: 'sabado',
    startTime: '09:00',
    endTime: '12:00',
    location: 'Centro de Idiomas',
  },
];

