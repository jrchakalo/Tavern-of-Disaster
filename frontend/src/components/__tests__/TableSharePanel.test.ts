import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

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
import BaseDialog from '../ui/BaseDialog.vue';

const clipboardWrite = vi.fn(async () => {});

function mountPanel(props: Partial<{ tableId: string; inviteCode: string; displayConnected: boolean }> = {}) {
  return mount(TableSharePanel, {
    attachTo: document.body,
    props: {
      tableId: 'table-1',
      inviteCode: 'INV-42',
      displayConnected: false,
      ...props,
    },
    global: { stubs: { teleport: true } },
  });
}

function dialogByTitle(wrapper: ReturnType<typeof mountPanel>, title: string) {
  return wrapper
    .findAllComponents(BaseDialog)
    .find((dialog) => dialog.props('title') === title);
}

function findButton(wrapper: ReturnType<typeof mountPanel>, label: string) {
  return wrapper.findAll('button').find((button) => button.text() === label);
}

const playerUrl = `${window.location.origin}/play/table-1?invite=INV-42`;
const displayUrl = `${window.location.origin}/display/table-1#token=secreto`;
const displayKey = 'tod:display-url:table-1';

beforeEach(() => {
  qrMock.toDataURL.mockClear();
  qrMock.toDataURL.mockResolvedValue('data:image/png;base64,QRCODE');
  accessMock.createDisplayToken.mockReset();
  accessMock.revokeDisplayToken.mockReset();
  Object.values(toastMock).forEach((fn) => fn.mockClear());
  clipboardWrite.mockClear();
  window.sessionStorage.clear();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: clipboardWrite },
  });
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: undefined,
  });
});

describe('TableSharePanel — convite de jogadores', () => {
  it('mostra QR de 140 px, link completo e código, com ampliação em diálogo', async () => {
    const wrapper = mountPanel();
    await flushPromises();

    expect(qrMock.toDataURL).toHaveBeenCalledWith(playerUrl, expect.anything());
    const img = wrapper.get('.invite-qr img');
    expect(img.attributes('src')).toBe('data:image/png;base64,QRCODE');
    expect(img.attributes('alt')).toBe('QR Code para entrar como jogador');
    expect(img.attributes('width')).toBe('140');

    expect(wrapper.get('a.share-block__link').attributes('href')).toBe(playerUrl);
    expect(wrapper.text()).toContain('INV-42');

    await findButton(wrapper, 'Ampliar')!.trigger('click');
    await flushPromises();
    const dialog = dialogByTitle(wrapper, 'Convite de jogadores');
    expect(dialog?.props('open')).toBe(true);
    expect(dialog?.find('.qr-dialog__image').exists()).toBe(true);
    wrapper.unmount();
  });

  it('copia link e código, e oferece Web Share quando disponível', async () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });

    const wrapper = mountPanel();
    await flushPromises();

    await findButton(wrapper, 'Copiar link')!.trigger('click');
    await flushPromises();
    expect(clipboardWrite).toHaveBeenCalledWith(playerUrl);
    expect(toastMock.success).toHaveBeenCalledWith('Link copiado.');

    await findButton(wrapper, 'Copiar código')!.trigger('click');
    await flushPromises();
    expect(clipboardWrite).toHaveBeenCalledWith('INV-42');

    await findButton(wrapper, 'Compartilhar')!.trigger('click');
    await flushPromises();
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: playerUrl }));
    wrapper.unmount();
  });

  it('expõe a prévia “Entrar como jogador” para a rota /play', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    const preview = wrapper.get('a.invite-preview');
    expect(preview.attributes('href')).toBe(playerUrl);
    expect(preview.attributes('target')).toBe('_blank');
    wrapper.unmount();
  });
});

describe('TableSharePanel — TV segura', () => {
  it('gera o link apenas quando não existe e guarda em sessionStorage por mesa', async () => {
    accessMock.createDisplayToken.mockResolvedValue({ token: 'secreto', displayUrl });

    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain('Abra o link da TV');
    expect(findButton(wrapper, 'Gerar link da TV')).toBeTruthy();

    await findButton(wrapper, 'Gerar link da TV')!.trigger('click');
    await flushPromises();

    expect(accessMock.createDisplayToken).toHaveBeenCalledWith('table-1');
    expect(window.sessionStorage.getItem(displayKey)).toBe(displayUrl);
    expect(window.localStorage.setItem).not.toHaveBeenCalledWith(displayKey, expect.anything());
    expect(wrapper.text()).toContain(displayUrl);
    expect(toastMock.success).toHaveBeenCalledWith('Link da TV gerado.');
    wrapper.unmount();
  });

  it('após reload mostra “TV configurada” e “Reexibir link” sem rotacionar', async () => {
    window.sessionStorage.setItem(displayKey, displayUrl);
    accessMock.createDisplayToken.mockResolvedValue({ token: 'novo', displayUrl });

    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain('TV configurada');
    expect(findButton(wrapper, 'Reexibir link')).toBeTruthy();
    expect(findButton(wrapper, 'Gerar link da TV')).toBeUndefined();
    expect(accessMock.createDisplayToken).not.toHaveBeenCalled();
    expect(wrapper.find('.share-display').exists()).toBe(false);

    await findButton(wrapper, 'Reexibir link')!.trigger('click');
    await flushPromises();
    expect(wrapper.find('.share-display').exists()).toBe(true);
    expect(wrapper.text()).toContain(displayUrl);
    expect(accessMock.createDisplayToken).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('rotacionar exige confirmação e avisa que desconecta a TV', async () => {
    window.sessionStorage.setItem(displayKey, displayUrl);
    accessMock.createDisplayToken.mockResolvedValue({
      token: 'novo',
      displayUrl: `${window.location.origin}/display/table-1#token=novo`,
    });

    const wrapper = mountPanel({ displayConnected: true });
    await flushPromises();

    await findButton(wrapper, 'Rotacionar link…')!.trigger('click');
    await flushPromises();

    expect(accessMock.createDisplayToken).not.toHaveBeenCalled();
    const dialog = dialogByTitle(wrapper, 'Rotacionar link da TV?');
    expect(dialog?.props('open')).toBe(true);
    expect(dialog?.text()).toContain('desconecta a TV');
    expect(dialog?.text()).toContain('TV conectada');

    await findButton(wrapper, 'Rotacionar e desconectar')!.trigger('click');
    await flushPromises();

    expect(accessMock.createDisplayToken).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(displayKey)).toContain('#token=novo');
    expect(toastMock.success).toHaveBeenCalledWith(
      'Link da TV rotacionado. A TV anterior foi desconectada.',
    );
    wrapper.unmount();
  });

  it('revogar pede confirmação e limpa o link guardado', async () => {
    window.sessionStorage.setItem(displayKey, displayUrl);
    accessMock.revokeDisplayToken.mockResolvedValue(undefined);

    const wrapper = mountPanel();
    await flushPromises();

    await findButton(wrapper, 'Revogar…')!.trigger('click');
    await flushPromises();
    expect(accessMock.revokeDisplayToken).not.toHaveBeenCalled();

    await findButton(wrapper, 'Revogar link')!.trigger('click');
    await flushPromises();

    expect(accessMock.revokeDisplayToken).toHaveBeenCalledWith('table-1');
    expect(window.sessionStorage.getItem(displayKey)).toBeNull();
    expect(wrapper.text()).not.toContain(displayUrl);
    expect(findButton(wrapper, 'Gerar link da TV')).toBeTruthy();
    wrapper.unmount();
  });

  it('não gera um link novo em cima de uma TV conectada sem confirmação', async () => {
    accessMock.createDisplayToken.mockResolvedValue({ token: 'novo', displayUrl });
    const wrapper = mountPanel({ displayConnected: true });
    await flushPromises();

    expect(wrapper.text()).toContain('Uma TV está conectada');
    await findButton(wrapper, 'Gerar novo link…')!.trigger('click');
    await flushPromises();

    expect(accessMock.createDisplayToken).not.toHaveBeenCalled();
    const dialog = dialogByTitle(wrapper, 'Gerar novo link da TV?');
    expect(dialog?.props('open')).toBe(true);
    expect(dialog?.text()).toContain('desconecta a TV');
    wrapper.unmount();
  });

  it('mostra o selo “TV conectada” quando há presença DISPLAY', async () => {
    const wrapper = mountPanel({ displayConnected: true });
    await flushPromises();
    expect(wrapper.text()).toContain('TV conectada');
    wrapper.unmount();
  });

  it('expõe erro de geração em vez de falhar em silêncio', async () => {
    accessMock.createDisplayToken.mockRejectedValue(new Error('Apenas o Mestre pode gerar o link.'));

    const wrapper = mountPanel();
    await flushPromises();
    await findButton(wrapper, 'Gerar link da TV')!.trigger('click');
    await flushPromises();

    expect(wrapper.get('.share-error').text()).toContain('Apenas o Mestre pode gerar o link.');
    expect(toastMock.error).toHaveBeenCalled();
    wrapper.unmount();
  });
});
