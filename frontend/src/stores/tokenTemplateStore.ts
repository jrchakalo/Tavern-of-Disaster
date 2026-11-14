import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { TokenTemplateDTO } from '../types';
import type { TokenTemplatePayload } from '../services/tokenTemplateService';
import {
  getMyTokenTemplates,
  createTokenTemplate,
  updateTokenTemplate,
  deleteTokenTemplate,
} from '../services/tokenTemplateService';

const GLOBAL_KEY = 'global';
const ALL_KEY = '__all__';

type TemplateMap = Record<string, TokenTemplateDTO[]>;

function systemKey(systemId?: string | null) {
  return systemId && systemId.length > 0 ? systemId : GLOBAL_KEY;
}

function indexBySystem(list: TokenTemplateDTO[]): TemplateMap {
  return list.reduce<TemplateMap>((acc, template) => {
    const key = systemKey(template.systemId);
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(template);
    return acc;
  }, {});
}

export const useTokenTemplateStore = defineStore('tokenTemplateStore', () => {
  const userTemplates = ref<TokenTemplateDTO[]>([]);
  const templatesBySystem = ref<TemplateMap>({});
  const lastFetched = ref<Record<string, number>>({});
  const isLoading = ref(false);

  function hasCache(key: string, systemId?: string) {
    if (key === ALL_KEY) {
      return userTemplates.value.length > 0;
    }
    const mappedKey = systemKey(systemId);
    return Array.isArray(templatesBySystem.value[mappedKey]);
  }

  async function fetchMyTemplates(options: { systemId?: string; force?: boolean } = {}) {
    const { systemId, force } = options;
    const cacheKey = systemId ?? ALL_KEY;
    if (!force && hasCache(cacheKey, systemId)) {
      return systemId ? templatesBySystem.value[systemKey(systemId)] : userTemplates.value;
    }
    isLoading.value = true;
    try {
      const data = await getMyTokenTemplates({ systemId });
      if (systemId) {
        const key = systemKey(systemId);
        templatesBySystem.value = { ...templatesBySystem.value, [key]: [...data] };
      } else {
        userTemplates.value = [...data];
        const indexed = indexBySystem(data);
        templatesBySystem.value = { ...templatesBySystem.value, ...indexed };
      }
      lastFetched.value = { ...lastFetched.value, [cacheKey]: Date.now() };
      return data;
    } finally {
      isLoading.value = false;
    }
  }

  function upsertTemplateInCache(template: TokenTemplateDTO) {
    const key = systemKey(template.systemId);
    const scoped = templatesBySystem.value[key] ? [...templatesBySystem.value[key]] : [];
    const idx = scoped.findIndex((item) => item._id === template._id);
    if (idx >= 0) {
      scoped[idx] = template;
    } else {
      scoped.unshift(template);
    }
    templatesBySystem.value = { ...templatesBySystem.value, [key]: scoped };

    if (userTemplates.value.length > 0) {
      const clone = [...userTemplates.value];
      const existingIdx = clone.findIndex((item) => item._id === template._id);
      if (existingIdx >= 0) {
        clone[existingIdx] = template;
      } else {
        clone.unshift(template);
      }
      userTemplates.value = clone;
    }
  }

  function removeTemplateFromCache(templateId: string) {
    if (userTemplates.value.length > 0) {
      userTemplates.value = userTemplates.value.filter((item) => item._id !== templateId);
    }
    const updatedEntries = Object.entries(templatesBySystem.value).reduce<TemplateMap>((acc, [key, list]) => {
      acc[key] = list.filter((item) => item._id !== templateId);
      return acc;
    }, {});
    templatesBySystem.value = updatedEntries;
  }

  async function createTemplate(payload: TokenTemplatePayload) {
    const template = await createTokenTemplate(payload);
    upsertTemplateInCache(template);
    return template;
  }

  async function updateTemplate(templateId: string, payload: Partial<TokenTemplatePayload>) {
    const template = await updateTokenTemplate(templateId, payload);
    upsertTemplateInCache(template);
    return template;
  }

  async function deleteTemplate(templateId: string) {
    await deleteTokenTemplate(templateId);
    removeTemplateFromCache(templateId);
  }

  function getTemplatesForSystem(systemId?: string | null) {
    const globals = templatesBySystem.value[GLOBAL_KEY] || [];
    const seen = new Set<string>();
    if (!systemId) {
      const baseList = userTemplates.value.length > 0
        ? [...userTemplates.value]
        : Object.values(templatesBySystem.value).flat();
      return baseList.filter((template) => {
        if (seen.has(template._id)) return false;
        seen.add(template._id);
        return true;
      });
    }
    const scoped = templatesBySystem.value[systemKey(systemId)] || [];
    const merged = [...scoped, ...globals];
    return merged.filter((template) => {
      if (seen.has(template._id)) return false;
      seen.add(template._id);
      return true;
    });
  }

  const totalTemplates = computed(() => {
    return userTemplates.value.length || Object.values(templatesBySystem.value).reduce((sum, list) => sum + list.length, 0);
  });

  return {
    userTemplates,
    templatesBySystem,
    isLoading,
    totalTemplates,
    fetchMyTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    getTemplatesForSystem,
  };
});
