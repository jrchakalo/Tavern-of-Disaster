import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const qrMock = vi.hoisted(() => ({
  toDataURL: vi.fn(async () => 'data:image/png;base64,QRCODE'),
}));
vi.mock('qrcode', () => qrMock);

const accessMock = vi.hoisted(() => ({
  createDisplayToken: vi.fn(),
  revokeDisplayToken: vi.fn(),
  joinTableByInvite: vi.fn(),
}));
vi.mock('../../services/tableAccessService', () => accessMock);

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock('../../services/toast', () => ({ toast: toastMock }));

import TableSharePanel from '../table/TableSharePanel.vue';

const clipboardWrite = vi.fn(async () => {});

function mountPanel(props: Partial<{ tableId: string; inviteCode: string; displayConnected: boolean }> = {}) {
  return mount(TableSharePanel, {
    props: {
      tableId: 'table-1',
      inviteCode: 'INV-42',
      displayConnected: false,
      ...props,
    },
  });
}

const playerUrl = `${window.location.origin}/play/table-1?invite=INV-42`;

beforeEach(() => {
  qrMock.toDataURL.mockClear();
  qrMock.toDataURL.mockResolvedValue('data:image/png;base64,QRCODE');
  accessMock.createDisplayToken.mockClear();
  accessMock.revokeDisplayToken.mockClear();
  Object.values(toastMock).forEach((fn) => fn.mockClear());
  clipboardWrite.mockClear();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: clipboardWrite },
  });
});

describe('TableSharePanel', () => {
  it('renders the player QR and link built from the invite code', async () => {
    const wrapper = mountPanel();
    await flushPromises();

    expect(qrMock.toDataURL).toHaveBeenCalledWith(playerUrl, expect.anything());

    const img = wrapper.get('.share-block__qr img');
    expect(img.attributes('src')).toBe('data:image/png;base64,QRCODE');
    expect(img.attributes('alt')).toContain(playerUrl);

    expect(wrapper.get('a.share-block__link').attributes('href')).toBe(playerUrl);
    expect(wrapper.text()).toContain(playerUrl);
    wrapper.unmount();
  });

  it('copies the player link to the clipboard', async () => {
    const wrapper = mountPanel();
    await flushPromises();

    const copy = wrapper
      .findAll('button')
      .find((btn) => btn.text() === 'Copiar link' && btn.attributes('disabled') === undefined);
    expect(copy).toBeTruthy();
    await copy!.trigger('click');
    await flushPromises();

    expect(clipboardWrite).toHaveBeenCalledWith(playerUrl);
    expect(toastMock.success).toHaveBeenCalledWith('Link copiado.');
    wrapper.unmount();
  });

  it('generates the TV token, shows its QR and can copy the display URL', async () => {
    const displayUrl = `${window.location.origin}/display/table-1#token=secreto`;
    accessMock.createDisplayToken.mockResolvedValue({ token: 'secreto', displayUrl });

    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).not.toContain(displayUrl);
    await wrapper
      .findAll('button')
      .find((btn) => btn.text() === 'Gerar token da TV')!
      .trigger('click');
    await flushPromises();

    expect(accessMock.createDisplayToken).toHaveBeenCalledWith('table-1');
    expect(wrapper.text()).toContain(displayUrl);
    const img = wrapper.findAll('.share-block__qr img')[1];
    expect(img.attributes('alt')).toContain(displayUrl);
    expect(toastMock.success).toHaveBeenCalledWith('Token da TV gerado.');
    wrapper.unmount();
  });

  it('asks for confirmation before rotating the token', async () => {
    const displayUrl = `${window.location.origin}/display/table-1#token=secreto`;
    accessMock.createDisplayToken.mockResolvedValue({ token: 'secreto', displayUrl });

    const wrapper = mountPanel();
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((btn) => btn.text() === 'Gerar token da TV')!
      .trigger('click');
    await flushPromises();

    accessMock.createDisplayToken.mockClear();
    await wrapper
      .findAll('button')
      .find((btn) => btn.text() === 'Rotacionar token')!
      .trigger('click');
    await flushPromises();

    // ainda não rotacionou: só mostra a confirmação
    expect(accessMock.createDisplayToken).not.toHaveBeenCalled();
    expect(wrapper.find('.share-confirm').exists()).toBe(true);

    await wrapper
      .findAll('button')
      .find((btn) => btn.text() === 'Confirmar')!
      .trigger('click');
    await flushPromises();

    expect(accessMock.createDisplayToken).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('asks for confirmation before revoking the token', async () => {
    const displayUrl = `${window.location.origin}/display/table-1#token=secreto`;
    accessMock.createDisplayToken.mockResolvedValue({ token: 'secreto', displayUrl });
    accessMock.revokeDisplayToken.mockResolvedValue(undefined);

    const wrapper = mountPanel();
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((btn) => btn.text() === 'Gerar token da TV')!
      .trigger('click');
    await flushPromises();

    await wrapper
      .findAll('button')
      .find((btn) => btn.text() === 'Revogar token')!
      .trigger('click');
    await flushPromises();
    expect(accessMock.revokeDisplayToken).not.toHaveBeenCalled();

    await wrapper
      .findAll('button')
      .find((btn) => btn.text() === 'Confirmar')!
      .trigger('click');
    await flushPromises();

    expect(accessMock.revokeDisplayToken).toHaveBeenCalledWith('table-1');
    expect(wrapper.text()).not.toContain(displayUrl);
    expect(wrapper.findAll('button').some((btn) => btn.text() === 'Gerar token da TV')).toBe(true);
    wrapper.unmount();
  });

  it('shows the TV connected badge when a display socket is present', async () => {
    const wrapper = mountPanel({ displayConnected: true });
    await flushPromises();

    expect(wrapper.text()).toContain('TV conectada');
    wrapper.unmount();
  });

  it('surfaces token generation errors instead of failing silently', async () => {
    accessMock.createDisplayToken.mockRejectedValue(new Error('Apenas o Mestre pode gerar o token.'));

    const wrapper = mountPanel();
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((btn) => btn.text() === 'Gerar token da TV')!
      .trigger('click');
    await flushPromises();

    expect(wrapper.find('.share-error').text()).toContain('Apenas o Mestre pode gerar o token.');
    expect(toastMock.error).toHaveBeenCalled();
    wrapper.unmount();
  });
});
