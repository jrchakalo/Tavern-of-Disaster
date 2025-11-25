<script setup lang="ts">
import { computed } from 'vue';
import draggable from 'vuedraggable';
import Icon from './Icon.vue';
import type { IScene } from '../types';

const props = defineProps<{
  scenes: IScene[];
  activeSceneId: string | null;
  isCollapsed: boolean;
  mapUrlInput: string;
  newSceneName: string;
  newSceneImageUrl: string;
  newSceneType: 'battlemap' | 'image';
}>();

const emit = defineEmits<{
  (e: 'toggle'): void;
  (e: 'set-active-scene', sceneId: string): void;
  (e: 'edit-scene', scene: IScene): void;
  (e: 'delete-scene', sceneId: string): void;
  (e: 'reorder', scenes: IScene[]): void;
  (e: 'set-map'): void;
  (e: 'create-scene'): void;
  (e: 'update:mapUrlInput', value: string): void;
  (e: 'update:newSceneName', value: string): void;
  (e: 'update:newSceneImageUrl', value: string): void;
  (e: 'update:newSceneType', value: 'battlemap' | 'image'): void;
}>();

const internalScenes = computed({
  get: () => props.scenes,
  set: (value: IScene[]) => emit('reorder', value),
});

function onDragEnd() {
  emit('reorder', internalScenes.value);
}
</script>

<template>
  <div class="panel-section scene-manager">
    <button class="subsection-toggle" @click="emit('toggle')">
      <h4>Cenas</h4>
      <span class="chevron"><Icon :name="isCollapsed ? 'plus' : 'minus'" size="16" /></span>
    </button>

    <div class="scenes-list-block" v-show="!isCollapsed">
      <draggable
        v-model="internalScenes"
        tag="ul"
        class="scene-list"
        item-key="_id"
        @end="onDragEnd"
        handle=".drag-handle"
      >
        <template #item="{ element: scene }">
          <li :class="{ 'active-scene': scene._id === activeSceneId }">
            <span class="drag-handle" title="Arrastar"><Icon name="drag" size="16" /></span>
            <span>{{ scene.name }}</span>
            <div class="scene-buttons">
              <button @click="emit('set-active-scene', scene._id)" :disabled="scene._id === activeSceneId">Ativar</button>
              <button @click="emit('edit-scene', scene)" class="icon-btn" title="Editar">
                <Icon name="edit" size="16" />
              </button>
              <button @click="emit('delete-scene', scene._id)" class="icon-btn delete-btn-small" title="Excluir">
                <Icon name="delete" size="16" />
              </button>
            </div>
          </li>
        </template>
      </draggable>
    </div>

    <div class="panel-section" v-show="!isCollapsed">
      <h4>Imagem da Cena Ativa</h4>
      <div class="map-controls">
        <div class="inline-fields" style="width:100%">
          <input
            id="map-url"
            class="input-sm"
            type="url"
            :value="mapUrlInput"
            placeholder="URL da imagem da cena"
            @input="emit('update:mapUrlInput', ($event.target as HTMLInputElement).value)"
          />
          <button @click="emit('set-map')" type="button" class="btn btn-xs btn-ghost">Definir</button>
        </div>
      </div>
    </div>

    <form @submit.prevent="emit('create-scene')" class="create-scene-form" v-show="!isCollapsed">
      <h4>Criar Nova Cena</h4>
      <div class="field-group">
        <input
          class="input-sm"
          :value="newSceneName"
          placeholder="Nome da Cena"
          required
          @input="emit('update:newSceneName', ($event.target as HTMLInputElement).value)"
        />
        <input
          class="input-sm"
          :value="newSceneImageUrl"
          placeholder="URL da Imagem (Opcional)"
          @input="emit('update:newSceneImageUrl', ($event.target as HTMLInputElement).value)"
        />
        <div class="inline-fields">
          <select
            class="input-sm"
            :value="newSceneType"
            @change="emit('update:newSceneType', ($event.target as HTMLSelectElement).value as 'battlemap' | 'image')"
          >
            <option value="battlemap">Battlemap</option>
            <option value="image">Imagem</option>
          </select>
          <button type="submit" class="btn btn-xs alt">Adicionar Cena</button>
        </div>
      </div>
    </form>
  </div>
</template>
