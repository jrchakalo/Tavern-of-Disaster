import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ITable, SystemDTO } from '../types';
import { getSystems } from '../services/systemService';

export const useSystemStore = defineStore('systemStore', () => {
  const systems = ref<SystemDTO[]>([]);
  const systemsById = ref<Record<string, SystemDTO>>({});
  const systemsByKey = ref<Record<string, SystemDTO>>({});
  const isLoaded = ref(false);
  const isLoading = ref(false);
  let inflightPromise: Promise<SystemDTO[]> | null = null;

  function indexSystems(list: SystemDTO[]) {
    const byId: Record<string, SystemDTO> = {};
    const byKey: Record<string, SystemDTO> = {};
    list.forEach((system) => {
      byId[system._id] = system;
      byKey[system.key] = system;
    });
    systemsById.value = byId;
    systemsByKey.value = byKey;
  }

  async function fetchAll(options: { force?: boolean } = {}) {
    if (isLoaded.value && !options.force) {
      return systems.value;
    }
    if (isLoading.value && inflightPromise) {
      return inflightPromise;
    }
    isLoading.value = true;
    inflightPromise = getSystems()
      .then((list) => {
        systems.value = list;
        indexSystems(list);
        isLoaded.value = true;
        return list;
      })
      .finally(() => {
        isLoading.value = false;
        inflightPromise = null;
      });
    return inflightPromise;
  }

  function getById(id?: string | null) {
    if (!id) return null;
    return systemsById.value[id] ?? null;
  }

  function getByKey(key?: string | null) {
    if (!key) return null;
    return systemsByKey.value[key] ?? null;
  }

  function currentSystemForTable(table: ITable | null, preferredKey?: string | null) {
    if (!table) {
      return preferredKey ? getByKey(preferredKey) : null;
    }
    return (
      getById(table.systemId ?? null) ||
      getByKey(table.systemKey ?? null) ||
      (preferredKey ? getByKey(preferredKey) : null)
    );
  }

  const hasData = computed(() => isLoaded.value && systems.value.length > 0);

  return {
    systems,
    systemsById,
    systemsByKey,
    isLoaded,
    isLoading,
    hasData,
    fetchAll,
    getById,
    getByKey,
    currentSystemForTable,
  };
});
