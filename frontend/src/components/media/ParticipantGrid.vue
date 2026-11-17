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
/* Superfície de ficha: painel sólido, sem vidro. */
.participant-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--s-2);
  padding: var(--s-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--panel);
}

.participant-grid--floating {
  position: fixed;
  left: 16px;
  bottom: 176px;
  z-index: 71;
  display: flex;
  flex-wrap: wrap;
  width: max-content;
  max-width: min(560px, calc(100vw - 32px));
  max-height: min(42vh, 380px);
  overflow-y: auto;
  box-sizing: border-box;
  box-shadow: none;
}

.participant-grid--floating .media-tile {
  flex: 0 0 176px;
  width: 176px;
}

/* Compartilhamento de tela ocupa a linha inteira também na barra flutuante. */
.participant-grid--floating .media-tile.is-screen {
  flex: 0 0 100%;
  width: auto;
}

.participant-grid--compact {
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  max-height: 220px;
  overflow-y: auto;
}

.media-tile {
  position: relative;
  display: block;
  aspect-ratio: 16 / 9;
  min-height: 0;
  overflow: hidden;
  border: 2px solid transparent;
  border-radius: var(--radius-md);
  background: var(--ink-0);
  transition: border-color var(--dur-hover) var(--ease-out);
}

.media-tile.is-screen {
  grid-column: 1 / -1;
}

.media-tile.is-local {
  border-color: var(--line-strong);
}

/* Anel de fala: 2 px de sucesso, independente de seleção. */
.media-tile.is-speaking {
  border-color: var(--success-ink);
}

.media-tile__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: var(--ink-0);
  transform: scaleX(-1);
}

.media-tile.is-screen .media-tile__video {
  transform: none;
  object-fit: contain;
}

.media-tile__placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--s-1);
  padding: var(--s-2) var(--s-2) var(--s-6);
  background: var(--raised);
  text-align: center;
}

.media-tile__initials {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  background: var(--raised-2);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.participant-grid--compact .media-tile__initials {
  width: 28px;
  height: 28px;
}

.media-tile__hint {
  color: var(--text-muted);
  font-size: var(--text-2xs);
  line-height: 1.3;
}

.media-tile__footer {
  position: absolute;
  inset: auto 0 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-2);
  padding: 2px var(--s-2);
  border-top: 1px solid var(--line);
  background: var(--ink-0);
  pointer-events: none;
}

.media-tile__name {
  min-width: 0;
  max-width: 45%;
  overflow: hidden;
  color: var(--text);
  font-size: var(--text-xs);
  font-weight: 500;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-tile__badges {
  display: inline-flex;
  flex-wrap: nowrap;
  gap: 2px;
  justify-content: flex-end;
}

.media-tile__badge {
  padding: 0 var(--s-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: var(--raised);
  color: var(--text-muted);
  font-size: var(--text-2xs);
  font-weight: 500;
  line-height: 1.5;
  white-space: nowrap;
}

.media-tile__badge--muted {
  background: var(--raised);
  color: var(--text-muted);
}

.media-tile__badge--screen {
  border-color: rgb(47 108 132 / 0.55);
  background: rgb(47 108 132 / 0.16);
  color: var(--accent-ink);
}

@media (max-width: 900px) {
  .participant-grid--floating {
    left: 8px;
    right: auto;
    bottom: calc(214px + env(safe-area-inset-bottom, 0px));
    width: max-content;
    max-width: calc(100vw - 16px);
    max-height: 34vh;
  }
}

@media (prefers-reduced-motion: reduce) {
  .media-tile {
    transition: none;
  }
}
</style>
