import { InMemoryMeasurementStore } from './measurementStore.inmemory';
import { MongoMeasurementStore } from './measurementStore.mongo';
import {
	AuraPayload,
	MeasurementPayload,
	PersistentMeasurementPayload,
} from './measurementStore.types';

// Efêmeras: continuam em memória (não são estado de cena).
const ephemeralStore = new InMemoryMeasurementStore();
// Persistentes e auras: Mongo é a fonte da verdade.
const overlayStore = new MongoMeasurementStore();

export function setMeasurement(tableId: string, userId: string, measurement: MeasurementPayload) {
	ephemeralStore.setMeasurement(tableId, userId, measurement);
}

export function getMeasurementsForTable(tableId: string) {
	return ephemeralStore.getEphemeral(tableId);
}

export function removeMeasurement(tableId: string, userId: string) {
	ephemeralStore.removeMeasurement(tableId, userId);
}

export function clearMeasurementsForTable(tableId: string) {
	ephemeralStore.clearMeasurementsForTable(tableId);
}

export function clearAllForUser(userId: string) {
	ephemeralStore.clearAllForUser(userId);
}

export function clearMeasurementsForScene(tableId: string, sceneId: string) {
	ephemeralStore.clearMeasurementsForScene(tableId, sceneId);
}

export function getTablesForUser(userId: string) {
	return ephemeralStore.getTablesForUser(userId);
}

export type Measurement = MeasurementPayload;
export type PersistentMeasurement = PersistentMeasurementPayload;
export type Aura = AuraPayload;

export async function addPersistent(
	tableId: string,
	sceneId: string,
	measurement: PersistentMeasurementPayload
) {
	await overlayStore.addPersistent(tableId, sceneId, measurement);
}

export async function removePersistent(tableId: string, sceneId: string, id: string) {
	await overlayStore.removePersistent(tableId, sceneId, id);
}

export async function listPersistents(tableId: string, sceneId: string) {
	return overlayStore.listPersistents(tableId, sceneId);
}

export async function clearPersistentsForScene(tableId: string, sceneId: string) {
	await overlayStore.clearPersistentsForScene(tableId, sceneId);
}

export async function upsertAura(aura: AuraPayload) {
	await overlayStore.upsertAura(aura);
}

export async function removeAura(tableId: string, sceneId: string, tokenId: string) {
	await overlayStore.removeAura(tableId, sceneId, tokenId);
}

export async function listAuras(tableId: string, sceneId: string) {
	return overlayStore.listAuras(tableId, sceneId);
}

export async function clearAurasForScene(tableId: string, sceneId: string) {
	await overlayStore.clearAurasForScene(tableId, sceneId);
}

/**
 * Limpa o estado efêmero em memória e todos os overlays persistidos da mesa.
 * Usado na exclusão da mesa.
 */
export async function clearAllForTable(tableId: string) {
	ephemeralStore.clearAllForTable(tableId);
	await overlayStore.clearAllForTable(tableId);
}

/**
 * Limpeza periódica: só faz sentido para as efêmeras em memória. Overlays
 * persistentes em Mongo não expiram por inatividade (devem sobreviver a restart).
 */
export function cleanupInactiveTables(maxIdleMs: number) {
	ephemeralStore.cleanupInactiveTables?.(maxIdleMs);
}

export { InMemoryMeasurementStore } from './measurementStore.inmemory';
export { MongoMeasurementStore, createMongoMeasurementStore } from './measurementStore.mongo';
export { RedisMeasurementStore, createRedisMeasurementStore } from './measurementStore.redis';
export * from './measurementStore.types';
