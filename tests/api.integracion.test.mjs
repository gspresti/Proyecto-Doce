/**
 * DOCE — Pruebas HTTP reproducibles.
 * Ejecutar: node --test tests/api.integracion.test.mjs
 * Inicia su propio servidor, con carpeta de perfiles temporal y Gemini desactivado.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { iniciarServidor, solicitud, iniciarSesion } from './_servidor-pruebas.mjs';
let servidor;
before(async () => { servidor = await iniciarServidor(); });
after(async () => { if (servidor) await servidor.detener(); });

const perfilValido = {
  horas_trabajo_semanal: 36,
  minutos_viaje: 48,
  personas_a_cargo: 2,
  nivel_estres_percibido: 5,
  ritmo_estudio: 'Regular',
};

test('API-01: GET perfil sin iniciar sesión responde 401', async () => {
  const r = await solicitud(servidor.url, '/api/estudiante/perfil');
  assert.equal(r.status, 401);
});

test('API-02: login y GET /api/auth/me con token funcionan', async () => {
  const token = await iniciarSesion(servidor.url, 'L-94192');
  const r = await solicitud(servidor.url, '/api/auth/me', { token });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.rol, 'estudiante');
  assert.equal(r.body.user.estudiante_id, 'est-24192');
});

test('API-03: estudiante no puede consultar ni modificar perfil ajeno', async () => {
  const token = await iniciarSesion(servidor.url, 'L-94192');
  const consulta = await solicitud(servidor.url, '/api/estudiante/perfil?id=est-alex-12', { token });
  const cambio = await solicitud(servidor.url, '/api/estudiante/perfil', {
    method: 'PUT', token, body: { ...perfilValido, id_estudiante: 'est-alex-12' },
  });
  assert.equal(consulta.status, 403);
  assert.equal(cambio.status, 403);
});

test('API-04: Tutoría no puede leer ni editar perfiles estudiantiles', async () => {
  const token = await iniciarSesion(servidor.url, 'DOC-1240');
  const get = await solicitud(servidor.url, '/api/estudiante/perfil?id=est-24192', { token });
  const put = await solicitud(servidor.url, '/api/estudiante/perfil', { token, method: 'PUT', body: perfilValido });
  assert.equal(get.status, 403);
  assert.equal(put.status, 403);
});

test('API-05: validación rechaza 200 horas de trabajo sin modificar el perfil', async () => {
  const token = await iniciarSesion(servidor.url, 'L-94192');
  const antes = await solicitud(servidor.url, '/api/estudiante/perfil', { token });
  const r = await solicitud(servidor.url, '/api/estudiante/perfil', {
    method: 'PUT', token, body: { ...perfilValido, horas_trabajo_semanal: 200 },
  });
  const despues = await solicitud(servidor.url, '/api/estudiante/perfil', { token });
  assert.equal(r.status, 400);
  assert.equal(despues.body.estudiante.perfilEstudio.horas_trabajo_semanal, antes.body.estudiante.perfilEstudio.horas_trabajo_semanal);
});

test('API-06: guardar Mi perfil y recuperarlo mediante GET', async () => {
  const token = await iniciarSesion(servidor.url, 'L-94192');
  const put = await solicitud(servidor.url, '/api/estudiante/perfil', { method: 'PUT', body: perfilValido, token });
  assert.equal(put.status, 200);
  assert.equal(put.body.perfilEstudio.horas_trabajo_semanal, 36);
  const get = await solicitud(servidor.url, '/api/estudiante/perfil', { token });
  assert.equal(get.status, 200);
  assert.equal(get.body.estudiante.perfilEstudio.personas_a_cargo, 2);
  assert.ok(fs.existsSync(path.join(servidor.datos, 'perfiles-estudio.json')));
});

test('API-07: guardar Mi perfil no genera alertas ni predicciones nuevas', async () => {
  // Endpoint de Tutorías usado aquí sólo dentro del servidor sintético local;
  // su falta de protección se evalúa en la suite independiente de seguridad.
  const tutor = await iniciarSesion(servidor.url, 'DOC-1240');
  const inicial = await solicitud(servidor.url, '/api/tutor/dashboard', { token: tutor });
  const token = await iniciarSesion(servidor.url, 'L-94192');
  const put = await solicitud(servidor.url, '/api/estudiante/perfil', {
    method: 'PUT', token, body: { ...perfilValido, horas_trabajo_semanal: 47 },
  });
  const final = await solicitud(servidor.url, '/api/tutor/dashboard', { token: tutor });
  assert.equal(put.status, 200);
  assert.equal(final.body.alertas.length, inicial.body.alertas.length);
  assert.ok(!Object.hasOwn(put.body, 'prediccion'));
  assert.ok(!Object.hasOwn(put.body, 'alerta'));
});

test('API-08: no permite descargar el JSON privado por HTTP', async () => {
  const paths = [
    '/.doce-data/perfiles-estudio.json',
    '/@fs/app/.doce-data/perfiles-estudio.json',
    '/perfiles-estudio.json',
  ];
  for (const p of paths) {
    const r = await solicitud(servidor.url, p);
    assert.equal(r.status, 403, `Ruta expuesta o respuesta inesperada: ${p}`);
    assert.ok(!JSON.stringify(r.body).includes('horas_trabajo_semanal'));
  }
});

test('API-09: DOC sin clave Gemini ofrece fallback identificado', async () => {
  const token = await iniciarSesion(servidor.url, 'L-94192');
  const r = await solicitud(servidor.url, '/api/gemini/chat', {
    method: 'POST', token,
    body: { mensaje: 'Estoy cansada por el trabajo y el viaje', modo: 'motivacion', estudiante_id: 'est-24192' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.es_fallback, true);
  assert.equal(typeof r.body.respuesta, 'string');
  assert.ok(r.body.respuesta.length > 15);
  assert.ok(r.body.palabras < 180);
});

test('API-10: DOC rechaza mensaje vacío', async () => {
  const r = await solicitud(servidor.url, '/api/gemini/chat', { method: 'POST', body: {} });
  assert.equal(r.status, 400);
});

test('API-11: desglose DOC sin Gemini devuelve plantilla de contingencia', async () => {
  const r = await solicitud(servidor.url, '/api/gemini/breakdown', {
    method: 'POST', body: { texto: 'La desviación estándar mide dispersión de una muestra.', materia: 'Estadística' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.es_fallback, true);
  assert.ok(r.body.palabras < 160);
});

test('API-12: cerrar sesión invalida el token', async () => {
  const token = await iniciarSesion(servidor.url, 'L-94192');
  const salir = await solicitud(servidor.url, '/api/auth/logout', { method: 'POST', token });
  const me = await solicitud(servidor.url, '/api/auth/me', { token });
  assert.equal(salir.status, 200);
  assert.equal(me.status, 401);
});

test('API-13: cambios persisten tras reiniciar un proceso Node de prueba', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doce-restart-tests-'));
  let instancia;
  try {
    instancia = await iniciarServidor({ dataDir: dir });
    const token = await iniciarSesion(instancia.url, 'L-25012');
    const r = await solicitud(instancia.url, '/api/estudiante/perfil', {
      method: 'PUT', token,
      body: { ...perfilValido, horas_trabajo_semanal: 19, minutos_viaje: 23 },
    });
    assert.equal(r.status, 200);
    await instancia.detener();
    instancia = await iniciarServidor({ dataDir: dir });
    const token2 = await iniciarSesion(instancia.url, 'L-25012');
    const get = await solicitud(instancia.url, '/api/estudiante/perfil', { token: token2 });
    assert.equal(get.status, 200);
    assert.equal(get.body.estudiante.perfilEstudio.horas_trabajo_semanal, 19);
  } finally {
    if (instancia) await instancia.detener();
    fs.rmSync(dir, { force: true, recursive: true });
  }
});
