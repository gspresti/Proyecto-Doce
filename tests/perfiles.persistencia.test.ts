/**
 * DOCE — pruebas unitarias de persistencia de PerfilEstudio.
 * Cada caso crea su propio directorio temporal: jamás utiliza el JSON real del proyecto.
 * Ejecutar: npx tsx --test tests/perfiles.persistencia.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// El módulo crea un singleton al importarse: aislamos TAMBIÉN esa inicialización.
const datosSingleton = fs.mkdtempSync(path.join(os.tmpdir(), 'doce-test-singleton-'));
process.env.DOCE_DATA_DIR = datosSingleton;
const { BackendDatabase } = await import('../src/server/database.js');
process.on('exit', () => fs.rmSync(datosSingleton, { recursive: true, force: true }));

function entornoTemporal(t: { after: (callback: () => void) => void }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doce-tests-db-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, archivo: path.join(dir, 'perfiles-estudio.json') };
}

const datosCamila = {
  horas_trabajo_semanal: 37,
  minutos_viaje: 62,
  personas_a_cargo: 2,
  nivel_estres_percibido: 6,
  ritmo_estudio: 'Regular' as const,
};

test('DB-01: crea el archivo JSON al actualizar un perfil', async (t) => {
  const { archivo } = entornoTemporal(t);
  const db = new BackendDatabase({ profilesFilePath: archivo });
  const guardado = await db.actualizarPerfilEstudiantePersistente('est-24192', datosCamila);
  assert.equal(guardado.horas_trabajo_semanal, 37);
  assert.ok(fs.existsSync(archivo));
  const contenido = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  assert.equal(contenido.perfiles['est-24192'].personas_a_cargo, 2);
  assert.equal(contenido.version, 1);
  assert.ok(!Object.keys(contenido).some((clave) => /token|contrasena|sesion|interaccion|alerta/i.test(clave)));
});

test('DB-02: recupera el perfil después de reconstruir el servidor (id y fecha incluidos)', async (t) => {
  const { archivo } = entornoTemporal(t);
  const antes = new BackendDatabase({ profilesFilePath: archivo });
  const perfil = await antes.actualizarPerfilEstudiantePersistente('est-24192', datosCamila);
  const despues = new BackendDatabase({ profilesFilePath: archivo });
  const recuperado = despues.estudiantes.find((e) => e.id_usuario === 'est-24192')?.perfilEstudio;
  assert.equal(despues.persistenciaEstado, 'cargada');
  assert.ok(recuperado);
  assert.equal(recuperado.id_perfil, perfil.id_perfil);
  assert.equal(recuperado.fecha_actualizacion, perfil.fecha_actualizacion);
  assert.equal(recuperado.minutos_viaje, 62);
  assert.equal(recuperado.ritmo_estudio, 'Regular');
  assert.equal(typeof recuperado.actualizar_perfil, 'function');
});

test('DB-03: modificar un estudiante no cambia otro', async (t) => {
  const { archivo } = entornoTemporal(t);
  const db = new BackendDatabase({ profilesFilePath: archivo });
  const perfilAlexAntes = db.estudiantes.find((e) => e.id_usuario === 'est-alex-12')!.perfilEstudio!;
  const previo = { horas: perfilAlexAntes.horas_trabajo_semanal, fecha: perfilAlexAntes.fecha_actualizacion };
  await db.actualizarPerfilEstudiantePersistente('est-24192', datosCamila);
  const perfilAlexDespues = db.estudiantes.find((e) => e.id_usuario === 'est-alex-12')!.perfilEstudio!;
  assert.equal(perfilAlexDespues.horas_trabajo_semanal, previo.horas);
  assert.equal(perfilAlexDespues.fecha_actualizacion, previo.fecha);
});

test('DB-04: dos guardados simultáneos no pierden actualizaciones', async (t) => {
  const { archivo } = entornoTemporal(t);
  const db = new BackendDatabase({ profilesFilePath: archivo });
  await Promise.all([
    db.actualizarPerfilEstudiantePersistente('est-24192', datosCamila),
    db.actualizarPerfilEstudiantePersistente('est-alex-12', {
      horas_trabajo_semanal: 21, minutos_viaje: 14, personas_a_cargo: 0,
      nivel_estres_percibido: 3, ritmo_estudio: 'Intensivo',
    }),
  ]);
  const otroProceso = new BackendDatabase({ profilesFilePath: archivo });
  assert.equal(otroProceso.estudiantes.find((e) => e.id_usuario === 'est-24192')!.perfilEstudio!.horas_trabajo_semanal, 37);
  assert.equal(otroProceso.estudiantes.find((e) => e.id_usuario === 'est-alex-12')!.perfilEstudio!.horas_trabajo_semanal, 21);
});

test('DB-05: JSON corrupto se conserva y bloquea escrituras', async (t) => {
  const { archivo } = entornoTemporal(t);
  const contenidoCorrupto = '{esto-no-es-json';
  fs.writeFileSync(archivo, contenidoCorrupto);
  const db = new BackendDatabase({ profilesFilePath: archivo });
  assert.equal(db.persistenciaEstado, 'error_lectura_o_corrupto');
  await assert.rejects(db.actualizarPerfilEstudiantePersistente('est-24192', datosCamila), (err: unknown) => {
    return (err as { code?: string })?.code === 'PERSISTENCE_CORRUPT';
  });
  assert.equal(fs.readFileSync(archivo, 'utf8'), contenidoCorrupto);
});

test('DB-06: error de escritura produce rollback y no crea alertas nuevas', async (t) => {
  const { dir } = entornoTemporal(t);
  const padreBloqueado = path.join(dir, 'archivo-regular');
  fs.writeFileSync(padreBloqueado, 'no es un directorio');
  const db = new BackendDatabase({ profilesFilePath: path.join(padreBloqueado, 'perfiles.json') });
  const previo = db.estudiantes.find((e) => e.id_usuario === 'est-24192')!.perfilEstudio!;
  const copia = { horas: previo.horas_trabajo_semanal, fecha: previo.fecha_actualizacion };
  const cantidadAlertas = db.alertas.length;
  await assert.rejects(db.actualizarPerfilEstudiantePersistente('est-24192', datosCamila));
  const actual = db.estudiantes.find((e) => e.id_usuario === 'est-24192')!.perfilEstudio!;
  assert.equal(actual.horas_trabajo_semanal, copia.horas);
  assert.equal(actual.fecha_actualizacion, copia.fecha);
  assert.equal(db.alertas.length, cantidadAlertas);
});

test('DB-07: un estudiante sin perfil puede completar onboarding y persistirlo', async (t) => {
  const { archivo } = entornoTemporal(t);
  const db = new BackendDatabase({ profilesFilePath: archivo });
  const estudiante = db.estudiantes.find((e) => e.id_usuario === 'est-24192')!;
  estudiante.perfilEstudio = null; // Únicamente en instancia de test; NO toca las semillas del proyecto.
  const nuevo = await db.actualizarPerfilEstudiantePersistente('est-24192', datosCamila);
  assert.ok(nuevo.id_perfil);
  const recargado = new BackendDatabase({ profilesFilePath: archivo });
  assert.equal(recargado.estudiantes.find((e) => e.id_usuario === 'est-24192')!.perfilEstudio!.horas_trabajo_semanal, 37);
});

test('DB-08: privacidad del archivo mediante permisos POSIX', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Los permisos POSIX 0700/0600 no son aplicables en Windows');
    return;
  }
  const { archivo } = entornoTemporal(t);
  const db = new BackendDatabase({ profilesFilePath: archivo });
  await db.actualizarPerfilEstudiantePersistente('est-24192', datosCamila);
  assert.equal(fs.statSync(path.dirname(archivo)).mode & 0o777, 0o700);
  assert.equal(fs.statSync(archivo).mode & 0o777, 0o600);
});
