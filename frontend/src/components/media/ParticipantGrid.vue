<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import { useMediaStore } from '../../stores/mediaStore';
import type { MediaConnectionQuality, MediaState } from '../../types';

withDefaults(defineProps<{ floating?: boolean; compact?: boolean }>(), {
  floating: false,
  compact: false,
});

const store = useMediaStore();

interface ParticipantTile {
  key: string;
  local: boolean;
  username: string;
  stream: MediaStream | null;
  mediaState: MediaState;
  quality: MediaConnectionQuality;
}

const tiles = computed<ParticipantTile[]>(() => {
  const localState: MediaState = {
    mic: store.mic,
    deafened: store.deafened,
    camera: store.camera,
    screen: store.screen,
    speaking: store.speaking,
  };
  const all: ParticipantTile[] = [
    {
      key: 'local',
      local: true,
      username: store.localUsername || 'Você',
      stream: store.localStream,
      mediaState: localState,
      quality: 'good',
    },
    ...store.peers.map((peer) => ({
      key: peer.peerId,
      local: false,
      username: peer.username || 'Participante',
      stream: peer.stream,
      mediaState: peer.mediaState,
      quality: peer.quality,
    })),
  ];
  // Tela compartilhada ganha o tile grande, sem perder os demais.
  return all.sort((a, b) => Number(b.mediaState.screen) - Number(a.mediaState.screen));
});

const videoEls = new Map<string, HTMLVideoElement>();
const audioEls = new Map<string, HTMLAudioElement>();

function hasVideo(tile: ParticipantTile): boolean {
  if (!tile.stream) return false;
  const tracks = tile.stream.getVideoTracks?.() ?? [];
  return tracks.length > 0 && (tile.mediaState.camera === 'on' || tile.mediaState.screen);
}

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return trimmed.slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function isVideoElement(el: unknown): el is HTMLVideoElement {
  return typeof HTMLVideoElement !== 'undefined' && el instanceof HTMLVideoElement;
}

function isAudioElement(el: unknown): el is HTMLAudioElement {
  return typeof HTMLAudioElement !== 'undefined' && el instanceof HTMLAudioElement;
}

function playSafely(el: HTMLMediaElement): void {
  try {
    void el.play?.().catch(() => undefined);
  } catch {
    // Autoplay bloqueado até o primeiro gesto: o próximo clique retoma.
  }
}

function setVideoRef(el: unknown, key: string, stream: MediaStream | null): void {
  if (!isVideoElement(el)) {
    videoEls.delete(key);
    return;
  }
  videoEls.set(key, el);
  if (el.srcObject !== stream) el.srcObject = stream;
  // Vídeo nunca toca áudio: cada peer tem um `<audio>` próprio (deafen).
  el.muted = true;
  playSafely(el);
}

function applySink(el: HTMLAudioElement): void {
  const sinkId = store.selectedDevices.audiooutput;
  const candidate = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
  if (sinkId && typeof candidate.setSinkId === 'function') {
    void candidate.setSinkId(sinkId).catch(() => undefined);
  }
}

function setAudioRef(el: unknown, key: string, stream: MediaStream | null): void {
  if (!isAudioElement(el)) {
    audioEls.delete(key);
    return;
  }
  audioEls.set(key, el);
  if (el.srcObject !== stream) el.srcObject = stream;
  el.muted = store.deafened;
  applySink(el);
  playSafely(el);
}

watch(
  [() => store.deafened, () => store.selectedDevices.audiooutput],
  () => {
    for (const el of audioEls.values()) {
      el.muted = store.deafened;
      applySink(el);
    }
  },
);

onBeforeUnmount(() => {
  for (const el of videoEls.values()) el.srcObject = null;
  for (const el of audioEls.values()) el.srcObject = null;
  videoEls.clear();
  audioEls.clear();
});

function connectionTitle(tile: ParticipantTile): string {
  if (tile.local) return 'Você';
  if (tile.quality === 'poor') return 'Conexão ruim';
  if (tile.quality === 'fair') return 'Conexão instável';
  return 'Conexão boa';
}
</script>

<template>
  <section
    v-if="store.joined"
    class="participant-grid"
    :class="{
      'participant-grid--floating': floating,
      'participant-grid--compact': compact,
    }"
    aria-label="Participantes da chamada"
  >
    <article
      v-for="tile in tiles"
      :key="tile.key"
      class="media-tile"
      :class="{
        'is-local': tile.local,
        'is-speaking': tile.mediaState.speaking,
        'is-screen': tile.mediaState.screen,
        'is-muted': tile.mediaState.mic === 'muted',
      }"
      :title="`${tile.username} — ${connectionTitle(tile)}`"
      :data-peer-id="tile.local ? 'local' : tile.key"
    >
      <video
        v-if="hasVideo(tile)"
        :ref="(el) => setVideoRef(el, tile.key, tile.stream)"
        class="media-tile__video"
        autoplay
        playsinline
        muted
      ></video>
      <div v-else class="media-tile__placeholder" aria-hidden="true">
        <span class="media-tile__initials">{{ initials(tile.username) }}</span>
        <span v-if="tile.local" class="media-tile__hint">Você</span>
        <span v-else class="media-tile__hint">Câmera desligada</span>
      </div>

      <audio
        v-if="!tile.local && tile.stream"
        :ref="(el) => setAudioRef(el, tile.key, tile.stream)"
        autoplay
        :muted="store.deafened"
      ></audio>

      <footer class="media-tile__footer">
        <span class="media-tile__name">{{ tile.username }}</span>
        <span class="media-tile__badges">
          <span
            v-if="tile.mediaState.mic === 'muted'"
            class="media-tile__badge"
            aria-label="Microfone mudo"
            title="Microfone mudo"
          >Mudo</span>
          <span
            v-if="tile.mediaState.camera !== 'on' && !tile.mediaState.screen"
            class="media-tile__badge media-tile__badge--muted"
            aria-label="Câmera desligada"
            title="Câmera desligada"
          >Câmera off</span>
          <span
            v-if="tile.mediaState.screen"
            class="media-tile__badge media-tile__badge--screen"
            aria-label="Compartilhando tela"
          >Tela</span>
          <span
            v-if="!tile.local && store.deafened"
            class="media-tile__badge media-tile__badge--muted"
            aria-label="Áudio silenciado por você"
            title="Áudio silenciado por você"
          >Silenciado</span>
        </span>
      </footer>
    </article>
  </section>
</template>

<style scoped>
.participant-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--color-border, #4b3a44);
  border-radius: 14px;
  background: rgba(24, 18, 22, 0.72);
  backdrop-filter: blur(4px);
}

.participant-grid--floating {
  position: fixed;
  left: 16px;
  bottom: 126px;
  z-index: 71;
  width: min(480px, calc(100vw - 32px));
  max-height: min(42vh, 360px);
  overflow-y: auto;
  box-sizing: border-box;
}

.participant-grid--compact {
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  max-height: 170px;
  overflow-y: auto;
}

.media-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 92px;
  overflow: hidden;
  border: 2px solid transparent;
  border-radius: 12px;
  background: #241b20;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.media-tile.is-screen {
  grid-column: 1 / -1;
  min-height: 180px;
}

.media-tile.is-speaking {
  border-color: var(--color-success, #2ecc71);
  box-shadow: 0 0 0 2px rgba(46, 204, 113, 0.25);
}

.media-tile.is-local {
  border-color: rgba(200, 162, 200, 0.4);
}

.media-tile__video {
  width: 100%;
  height: 100%;
  min-height: 92px;
  object-fit: cover;
  background: #171015;
  transform: scaleX(-1);
}

.media-tile.is-screen .media-tile__video {
  transform: none;
  object-fit: contain;
}

.media-tile__placeholder {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 92px;
  padding: 8px;
  background: radial-gradient(circle at 50% 30%, #42313a, #221920 75%);
  text-align: center;
}

.media-tile__initials {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.media-tile__hint {
  font-size: 0.66rem;
  color: var(--color-text-muted, #b7aab1);
}

.media-tile__footer {
  position: absolute;
  inset: auto 0 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 4px;
  padding: 14px 6px 5px;
  background: linear-gradient(180deg, transparent, rgba(10, 7, 9, 0.88));
  pointer-events: none;
}

.media-tile__name {
  max-width: 70%;
  overflow: hidden;
  color: #f5eef2;
  font-size: 0.7rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-tile__badges {
  display: inline-flex;
  gap: 3px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.media-tile__badge {
  padding: 1px 5px;
  border-radius: 999px;
  background: rgba(229, 57, 53, 0.8);
  color: #fff;
  font-size: 0.58rem;
  font-weight: 700;
  white-space: nowrap;
}

.media-tile__badge--muted {
  background: rgba(90, 70, 82, 0.9);
}

.media-tile__badge--screen {
  background: rgba(46, 125, 200, 0.9);
}

@media (max-width: 900px) {
  .participant-grid--floating {
    left: 8px;
    right: 8px;
    bottom: calc(214px + env(safe-area-inset-bottom, 0px));
    width: auto;
    max-height: 34vh;
  }
}

@media (prefers-reduced-motion: reduce) {
  .media-tile { transition: none; }
}
</style>
