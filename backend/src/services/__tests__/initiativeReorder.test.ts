import { buildReorderedInitiative } from '../initiativeService';
import { ServiceError } from '../serviceErrors';

function objectId(value: string) {
  return { toString: () => value };
}

function buildScene(initiative: any[]) {
  return { initiative } as any;
}

const scene = buildScene([
  {
    _id: objectId('e1'),
    characterName: 'A',
    tokenId: objectId('t1'),
    isCurrentTurn: true,
  },
  {
    _id: objectId('e2'),
    characterName: 'B',
    isCurrentTurn: false,
  },
]);

describe('initiativeService.buildReorderedInitiative', () => {
  it('reconstrói entradas do servidor preservando nome e token', () => {
    const result = buildReorderedInitiative(scene, [
      { _id: 'e2', characterName: 'NOME FORJADO', isCurrentTurn: true },
      { _id: 'e1', tokenId: 't1', isCurrentTurn: false },
    ]);

    expect(result.map((entry) => entry._id?.toString())).toEqual(['e2', 'e1']);
    expect(result[0].characterName).toBe('B');
    expect(result[1].characterName).toBe('A');
    expect(result[1].tokenId?.toString()).toBe('t1');
    expect(result.filter((entry) => entry.isCurrentTurn)).toHaveLength(1);
    expect(result[0].isCurrentTurn).toBe(true);
  });

  it('rejeita entrada desconhecida', () => {
    expect(() =>
      buildReorderedInitiative(scene, [{ _id: 'e1' }, { _id: 'unknown' }])
    ).toThrow(ServiceError);
  });

  it('rejeita token de outra mesa/cena na entrada', () => {
    expect(() =>
      buildReorderedInitiative(scene, [{ _id: 'e1', tokenId: 'token-de-outra-mesa' }, { _id: 'e2' }])
    ).toThrow('Ordem de iniciativa inválida: token não pertence à entrada.');
  });

  it('rejeita personagem divergente', () => {
    expect(() =>
      buildReorderedInitiative(scene, [{ _id: 'e1', characterId: 'outro' }, { _id: 'e2' }])
    ).toThrow(ServiceError);
  });

  it('rejeita ids duplicados e quantidade divergente', () => {
    expect(() => buildReorderedInitiative(scene, [{ _id: 'e1' }, { _id: 'e1' }])).toThrow(ServiceError);
    expect(() => buildReorderedInitiative(scene, [{ _id: 'e1' }])).toThrow(ServiceError);
  });

  it('rejeita entrada sem identificador', () => {
    expect(() => buildReorderedInitiative(scene, [{}, { _id: 'e1' }])).toThrow(ServiceError);
  });

  it('rejeita mais de uma entrada atual', () => {
    expect(() =>
      buildReorderedInitiative(scene, [
        { _id: 'e1', isCurrentTurn: true },
        { _id: 'e2', isCurrentTurn: true },
      ])
    ).toThrow(ServiceError);
  });
});
