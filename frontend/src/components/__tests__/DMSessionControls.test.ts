import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import DMSessionControls from '../DMSessionControls.vue';
import BaseDialog from '../ui/BaseDialog.vue';

function mountControls(props: Record<string, unknown> = {}) {
  return mount(DMSessionControls, {
    attachTo: document.body,
    props: {
      sessionStatus: 'LIVE',
      pauseInput: 5,
      pauseRemaining: 0,
      isCollapsed: false,
      ...props,
    },
    global: { stubs: { teleport: true } },
  });
}

function findButton(wrapper: ReturnType<typeof mountControls>, label: string) {
  return wrapper.findAll('button').find((button) => button.text() === label);
}

describe('DMSessionControls', () => {
  it('Preparando mostra “Iniciar sessão” e emite start-session', async () => {
    const wrapper = mountControls({ sessionStatus: 'PREPARING' });
    expect(wrapper.text()).toContain('Preparando');
    const start = findButton(wrapper, 'Iniciar sessão');
    expect(start).toBeTruthy();
    await start!.trigger('click');
    expect(wrapper.emitted('start-session')).toHaveLength(1);
    wrapper.unmount();
  });

  it('Ao vivo mostra Pausar e Encerrar; encerrar exige confirmação', async () => {
    const wrapper = mountControls({ sessionStatus: 'LIVE' });
    expect(findButton(wrapper, 'Pausar sessão')).toBeTruthy();

    await findButton(wrapper, 'Encerrar sessão')!.trigger('click');
    await nextTick();

    expect(wrapper.emitted('update-status')).toBeUndefined();
    const dialog = wrapper
      .findAllComponents(BaseDialog)
      .find((entry) => entry.props('title') === 'Encerrar sessão?');
    expect(dialog?.props('open')).toBe(true);
    expect(dialog?.text()).toContain('Jogadores e TV verão a tela final');

    const confirm = wrapper
      .findAll('button')
      .filter((button) => button.text() === 'Encerrar sessão')
      .at(-1);
    await confirm!.trigger('click');
    expect(wrapper.emitted('update-status')?.[0]).toEqual(['ENDED']);
    wrapper.unmount();
  });

  it('Pausado mostra Retomar e o tempo restante', async () => {
    const wrapper = mountControls({ sessionStatus: 'PAUSED', pauseRemaining: 125 });
    expect(findButton(wrapper, 'Retomar sessão')).toBeTruthy();
    expect(wrapper.get('[data-testid="pause-countdown"]').text()).toContain('Retomando em 2:05');

    await findButton(wrapper, 'Retomar sessão')!.trigger('click');
    expect(wrapper.emitted('update-status')?.[0]).toEqual(['LIVE']);
    wrapper.unmount();
  });

  it('Encerrado oferece Reabrir e explica que volta para Preparando', async () => {
    const wrapper = mountControls({ sessionStatus: 'ENDED' });
    expect(wrapper.text()).toContain('Encerrado');
    expect(wrapper.text()).toContain('volta para a preparação');
    await findButton(wrapper, 'Reabrir sessão')!.trigger('click');
    expect(wrapper.emitted('update-status')?.[0]).toEqual(['PREPARING']);
    wrapper.unmount();
  });

  it('clampa a duração da pausa entre 1 e 120 minutos', async () => {
    const wrapper = mountControls({ sessionStatus: 'LIVE', pauseInput: 5 });
    const input = wrapper.get('#session-pause-minutes');

    await input.setValue(999);
    expect(wrapper.emitted('update:pauseInput')?.at(-1)).toEqual([120]);

    await input.setValue(0);
    expect(wrapper.emitted('update:pauseInput')?.at(-1)).toEqual([1]);
    wrapper.unmount();
  });
});
