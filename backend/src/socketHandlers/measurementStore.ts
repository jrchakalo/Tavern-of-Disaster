import { InMemoryMeasurementStore } from './measurementStore.inmemory';
import {
	AuraPayload,
	MeasurementPayload,
	PersistentMeasurementPayload,
} from './measurementStore.types';

const legacyStore = new InMemoryMeasurementStore();

export function setMeasurement(tableId: string, userId: string, measurement: MeasurementPayload) {
	legacyStore.setMeasurement(tableId, userId, measurement);
}

export function getMeasurementsForTable(tableId: string) {
	return legacyStore.getEphemeral(tableId);
}

export function removeMeasurement(tableId: string, userId: string) {
	legacyStore.removeMeasurement(tableId, userId);
}

export function clearMeasurementsForTable(tableId: string) {
	legacyStore.clearMeasurementsForTable(tableId);
}

export function clearAllForUser(userId: string) {
	legacyStore.clearAllForUser(userId);
}

export function clearMeasurementsForScene(tableId: string, sceneId: string) {
	legacyStore.clearMeasurementsForScene(tableId, sceneId);
}

export function getTablesForUser(userId: string) {
	return legacyStore.getTablesForUser(userId);
}

export type Measurement = MeasurementPayload;
export type PersistentMeasurement = PersistentMeasurementPayload;
export type Aura = AuraPayload;

export function addPersistent(tableId: string, sceneId: string, measurement: PersistentMeasurementPayload) {
	legacyStore.addPersistent(tableId, sceneId, measurement);
}

export function removePersistent(tableId: string, sceneId: string, id: string) {
	legacyStore.removePersistent(tableId, sceneId, id);
}

export function listPersistents(tableId: string, sceneId: string) {
	return legacyStore.listPersistents(tableId, sceneId);
}

export function clearPersistentsForScene(tableId: string, sceneId: string) {
	legacyStore.clearPersistentsForScene(tableId, sceneId);
}

export function upsertAura(aura: AuraPayload) {
	legacyStore.upsertAura(aura);
}

export function removeAura(tableId: string, sceneId: string, tokenId: string) {
	legacyStore.removeAura(tableId, sceneId, tokenId);
}

export function listAuras(tableId: string, sceneId: string) {
	return legacyStore.listAuras(tableId, sceneId);
}

export function clearAurasForScene(tableId: string, sceneId: string) {
	legacyStore.clearAurasForScene(tableId, sceneId);
}

export function clearAllForTable(tableId: string) {
	legacyStore.clearAllForTable(tableId);
}

export function cleanupInactiveTables(maxIdleMs: number) {
	legacyStore.cleanupInactiveTables?.(maxIdleMs);
}

export { InMemoryMeasurementStore } from './measurementStore.inmemory';
export { RedisMeasurementStore, createRedisMeasurementStore } from './measurementStore.redis';
export * from './measurementStore.types';
