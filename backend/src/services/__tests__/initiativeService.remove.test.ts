import { removeInitiativeEntry } from '../initiativeService';
import Scene from '../../models/Scene.model';
import Token from '../../models/Token.model';

jest.mock('../../models/Scene.model', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

jest.mock('../../models/Token.model', () => ({
  __esModule: true,
  default: {
    findByIdAndDelete: jest.fn(),
  },
}));

function buildScene(initiative: any[]) {
  const scene = {
    _id: 'scene-1',
    turnVersion: 3,
    initiative,
    save: jest.fn().mockResolvedValue(undefined),
  };
  (Scene.findById as jest.Mock).mockResolvedValue(scene);
  return scene;
}

describe('initiativeService.removeInitiativeEntry', () => {
  it('remove apenas a entrada e preserva o token por padrão', async () => {
    const scene = buildScene([
      { _id: 'entry-1', characterName: 'A', tokenId: 'token-1', isCurrentTurn: false },
      { _id: 'entry-2', characterName: 'B', isCurrentTurn: true },
    ]);

    const result = await removeInitiativeEntry('scene-1', 'entry-1');

    expect(result.initiative.map((entry) => entry._id?.toString())).toEqual(['entry-2']);
    expect(result.removedTokenId).toBeUndefined();
    expect(Token.findByIdAndDelete).not.toHaveBeenCalled();
    expect(scene.save).toHaveBeenCalledTimes(1);
    expect(scene.turnVersion).toBe(4);
  });

  it('com deleteToken=true apaga o token vinculado e devolve o id removido', async () => {
    const scene = buildScene([
      { _id: 'entry-1', characterName: 'A', tokenId: 'token-1', isCurrentTurn: false },
    ]);

    const result = await removeInitiativeEntry('scene-1', 'entry-1', true);

    expect(result.initiative).toEqual([]);
    expect(result.removedTokenId).toBe('token-1');
    expect(Token.findByIdAndDelete).toHaveBeenCalledWith('token-1');
    expect(scene.save).toHaveBeenCalledTimes(1);
  });

  it('com deleteToken=true não tenta apagar token quando a entrada não tem vínculo', async () => {
    buildScene([{ _id: 'entry-1', characterName: 'A', isCurrentTurn: false }]);

    const result = await removeInitiativeEntry('scene-1', 'entry-1', true);

    expect(result.removedTokenId).toBeUndefined();
    expect(Token.findByIdAndDelete).not.toHaveBeenCalled();
  });
});
