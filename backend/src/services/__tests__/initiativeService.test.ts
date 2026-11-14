import { advanceTurn } from '../initiativeService';
import { resetMovementForScene } from '../tokenService';

jest.mock('../tokenService', () => ({
  resetMovementForScene: jest.fn(),
}));

describe('initiativeService.advanceTurn', () => {
  beforeEach(() => {
    (resetMovementForScene as jest.Mock).mockClear();
  });

  const buildTable = (dmId: string) => ({
    dm: { toString: () => dmId },
  });

  const buildScene = (initiative: any[]) => ({
    initiative,
    _id: { toString: () => 'scene-1' },
    save: jest.fn().mockResolvedValue(undefined),
  });

  it('moves the turn marker forward and does not start a new round until wrapping', async () => {
    const table = buildTable('dm');
    const scene = buildScene([
      { characterName: 'A', isCurrentTurn: true },
      { characterName: 'B', isCurrentTurn: false },
    ]);

    const result = await advanceTurn(table as any, scene as any, 'dm');

    expect(scene.initiative[0].isCurrentTurn).toBe(false);
    expect(scene.initiative[1].isCurrentTurn).toBe(true);
    expect(result.newRound).toBe(false);
    expect(resetMovementForScene).not.toHaveBeenCalled();
  });

  it('resets movement when a new round begins', async () => {
    const table = buildTable('dm');
    const scene = buildScene([
      { characterName: 'A', isCurrentTurn: false },
      { characterName: 'B', isCurrentTurn: true, tokenId: 'tok-b' },
    ]);

    const result = await advanceTurn(table as any, scene as any, 'dm');

    expect(result.newRound).toBe(true);
    expect(resetMovementForScene).toHaveBeenCalledWith('scene-1');
    expect(scene.initiative[0].isCurrentTurn).toBe(true);
    expect(scene.initiative[1].isCurrentTurn).toBe(false);
  });
});
