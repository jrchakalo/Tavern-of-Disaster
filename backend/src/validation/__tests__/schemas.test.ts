import { zPlaceTokenPayload, zCreateTokenTemplate } from '../schemas';

const baseTokenPayload = {
  tableId: '6af838beedca4f72eb0a8672',
  sceneId: '6af838beedca4f72eb0a8673',
  squareId: 'sq-1',
  name: 'Herói',
  size: 'Pequeno/Médio' as const,
};

describe('schemas de URL opcional', () => {
  it('aceita token sem imagem (string vazia vira undefined)', () => {
    const parsed = zPlaceTokenPayload.parse({ ...baseTokenPayload, imageUrl: '' });
    expect(parsed.imageUrl).toBeUndefined();
  });

  it('aceita token sem o campo de imagem', () => {
    const parsed = zPlaceTokenPayload.parse(baseTokenPayload);
    expect(parsed.imageUrl).toBeUndefined();
  });

  it('mantém uma URL válida', () => {
    const parsed = zPlaceTokenPayload.parse({
      ...baseTokenPayload,
      imageUrl: 'https://example.com/token.webp',
    });
    expect(parsed.imageUrl).toBe('https://example.com/token.webp');
  });

  it('rejeita URL inválida', () => {
    expect(() =>
      zPlaceTokenPayload.parse({ ...baseTokenPayload, imageUrl: 'não-é-url' })
    ).toThrow();
  });

  it('aceita template de token sem imagem', () => {
    const parsed = zCreateTokenTemplate.parse({
      name: 'Goblin',
      systemId: '6af838beedca4f72eb0a8672',
      imageUrl: '',
    });
    expect(parsed.imageUrl).toBeUndefined();
  });
});
