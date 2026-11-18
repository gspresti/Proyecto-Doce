/**
 * DOCE — Auditoría de seguridad: puede FALLAR con la versión PRE ETAPA 3.
 * Su objetivo es documentar vulnerabilidades, NO aprobarlas.
 * NUNCA ejecutar contra un sitio público ni una base real.
 * Ejecutar: node --test tests/seguridad.auditoria.test.mjs
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarServidor, solicitud, iniciarSesion } from './_servidor-pruebas.mjs';
let servidor;
before(async () => { servidor = await iniciarServidor(); });
after(async () => { if (servidor) await servidor.detener(); });

test('SEG-01: dashboard Tutorías requiere autenticación (esperado 401)', async () => {
  const respuesta = await solicitud(servidor.url, '/api/tutor/dashboard');
  assert.equal(respuesta.status, 401, 'Hallazgo: el dashboard de Tutorías queda accesible sin sesión');
});

test('SEG-02: estudiante no puede consultar dashboard Tutorías (esperado 403)', async () => {
  const token = await iniciarSesion(servidor.url, 'L-94192');
  const respuesta = await solicitud(servidor.url, '/api/tutor/dashboard', { token });
  assert.equal(respuesta.status, 403, 'Hallazgo: endpoint no restringe el rol de estudiante');
});

test('SEG-03: no se permite login sin contraseña (esperado 401/400)', async () => {
  const respuesta = await solicitud(servidor.url, '/api/auth/login', {
    method: 'POST', body: { identificador: 'L-94192' },
  });
  assert.ok([400, 401].includes(respuesta.status), 'Hallazgo: login acepta cuenta sintética sin contraseña');
});

test('SEG-04: laboratorio requiere sesión autorizada', async () => {
  const vector = {
    horas_trabajo_semanal: 30, minutos_viaje: 30, personas_a_cargo: 0,
    nivel_estres_percibido: 3, ritmo_estudio: 'Regular', nota_promedio: 8,
    asistencia_promedio: 90, entregas_atrasadas_totales: 0, porcentaje_avance_carrera: 50,
  };
  const respuesta = await solicitud(servidor.url, '/api/lab/evaluate', {
    method: 'POST', body: { vector },
  });
  assert.equal(respuesta.status, 401, 'Hallazgo: laboratorio accesible sin sesión');
});

test('SEG-05: DOC no registra conversaciones de anónimos', async () => {
  const respuesta = await solicitud(servidor.url, '/api/gemini/chat', {
    method: 'POST', body: { mensaje: 'consulta sintética de prueba', estudiante_id: 'est-24192' },
  });
  assert.equal(respuesta.status, 401, 'Hallazgo: DOC permite registrar mensajes sin validar sesión');
});

test('SEG-06: intervención de Tutorías anónima no puede mutar alertas', async () => {
  // La prueba ocurre en un proceso y carpeta temporales, con datos sintéticos.
  const dashboard = await solicitud(servidor.url, '/api/tutor/dashboard');
  const alertaId = dashboard.body.alertas?.[0]?.id_alerta;
  assert.ok(alertaId, 'El prototipo de prueba no contiene alerta semilla');
  const respuesta = await solicitud(servidor.url, '/api/tutor/intervenciones', {
    method: 'POST', body: { alerta_id: alertaId, tipo_intervencion: 'Prueba de permisos' },
  });
  assert.equal(respuesta.status, 401, 'Hallazgo: intervención puede registrarse anónimamente');
});
