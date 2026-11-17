import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import AuraDialog from '../AuraDialog.vue';

const mounted: Array<{ unmount: () => void }> = [];

function mountAura(props: Record<string, unknown> = {}) {
  const wrapper = mount(AuraDialog, {
    attachTo: document.body,
    props: { open: true, tokenId: 'token-1', isDM: true, ...props },
    global: { stubs: { teleport: true } },
  });
  mounted.push(wrapper);
  return wrapper;
}

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe('AuraDialog', () => {
  it('renders as a real modal with labelled fields', () => {
    const wrapper = mountAura();
    expect(wrapper.get('dialog').exists()).toBe(true);
    expect(wrapper.get('label[for="aura-name"]').text()).toBe('Nome');
    expect(wrapper.get('#aura-name').element).toHaveProperty('value', 'Aura');
    expect(wrapper.get('label[for="aura-radius"]').text()).toBe('Raio (m)');
  });

  it('emits the trimmed payload on submit', async () => {
    const wrapper = mountAura({ defaultName: '  Sussurros  ', defaultRadiusMeters: 1.5 });
    await wrapper.get('#aura-name').setValue('  Sussurros  ');
    await wrapper.get('#aura-radius').setValue(3);
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('save')?.at(-1)).toEqual([
      { name: 'Sussurros', color: '#ffd166', radiusMeters: 3 },
    ]);
  });

  it('offers remove only to the DM or owner and emits close', async () => {
    const player = mountAura({ isDM: false, isOwner: false });
    expect(player.text()).not.toContain('Remover aura');

    const owner = mountAura({ isDM: false, isOwner: true });
    expect(owner.text()).toContain('Remover aura');

    const remove = owner.findAll('button').find((button) => button.text() === 'Remover aura');
    await remove!.trigger('click');
    expect(owner.emitted('remove')).toHaveLength(1);

    const close = owner.findAll('button').find((button) => button.text() === 'Fechar');
    await close!.trigger('click');
    expect(owner.emitted('close')).toHaveLength(1);
  });
});
