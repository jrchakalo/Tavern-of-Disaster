import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { ref } from 'vue';

vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia');
  const hasRefs = (store: unknown): store is { __refs: Record<string, unknown> } =>
    Boolean(store && typeof store === 'object' && '__refs' in (store as Record<string, unknown>));
  return {
    ...actual,
    storeToRefs: (store: unknown) =>
      hasRefs(store) ? store.__refs : actual.storeToRefs(store as never),
  };
});

const routerMock = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('vue-router', () => ({
  useRouter: () => routerMock,
  onBeforeRouteLeave: vi.fn(),
}));

const userStoreStub = {
  __refs: {
    profile: ref<unknown>(null),
    isLoading: ref(false),
  },
  fetchProfile: vi.fn(() => Promise.resolve(null)),
  updateProfile: vi.fn(),
  clear: vi.fn(),
};
vi.mock('../../stores/userStore', () => ({ useUserStore: () => userStoreStub }));

const systemStoreStub = {
  __refs: {
    systems: ref<unknown[]>([]),
    isLoading: ref(false),
    isLoaded: ref(true),
  },
  fetchAll: vi.fn(() => Promise.resolve()),
};
vi.mock('../../stores/systemStore', () => ({ useSystemStore: () => systemStoreStub }));

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('../../services/toast', () => ({ toast: toastMock }));

vi.mock('../../services/authService', () => ({ clearAuthToken: vi.fn() }));
vi.mock('../../services/storageService', () => ({ uploadAvatar: vi.fn() }));

import ProfileView from '../ProfileView.vue';

const profileFixture = {
  _id: 'u-1',
  username: 'ana',
  email: 'ana@example.com',
  displayName: 'Ana, a Ladina',
  avatarUrl: null,
  bio: null,
  preferredSystemId: null,
  measurementColor: null,
};

function mountProfile() {
  return shallowMount(ProfileView, {
    global: { stubs: { teleport: true, Transition: false } },
  });
}

describe('ProfileView loading and save bar', () => {
  beforeEach(() => {
    userStoreStub.__refs.profile.value = null;
    userStoreStub.__refs.isLoading.value = true;
    userStoreStub.fetchProfile.mockClear();
    routerMock.push.mockClear();
  });

  it('shows a skeleton instead of the empty form while the profile is loading', async () => {
    const wrapper = mountProfile();
    await flushPromises();

    expect(wrapper.find('.profile-skeleton').exists()).toBe(true);
    expect(wrapper.find('.profile-skeleton').attributes('aria-busy')).toBe('true');
    expect(wrapper.text()).toContain('Carregando perfil');
    expect(wrapper.text()).not.toContain('Não informado pela API');
    // O "?" do avatar vazio não pode piscar antes do perfil.
    expect(wrapper.find('.avatar-preview').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('?');
    expect(wrapper.find('.save-bar').exists()).toBe(false);

    wrapper.unmount();
  });

  it('renders the form and keeps save/discard disabled with a clean profile', async () => {
    userStoreStub.__refs.profile.value = profileFixture;
    userStoreStub.__refs.isLoading.value = false;

    const wrapper = mountProfile();
    await flushPromises();

    expect(wrapper.find('.profile-skeleton').exists()).toBe(false);
    expect(wrapper.find('.avatar-preview').exists()).toBe(true);
    expect(wrapper.find('#profile-display-name').exists()).toBe(true);
    expect(wrapper.text()).toContain('ana@example.com');

    const saveBar = wrapper.find('.save-bar');
    expect(saveBar.exists()).toBe(true);
    expect(saveBar.text()).toContain('Tudo salvo');
    const buttons = saveBar.findAll('button');
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.attributes('disabled') !== undefined)).toBe(true);

    wrapper.unmount();
  });
});
