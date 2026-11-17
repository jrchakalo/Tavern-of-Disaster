import { updateScene } from '../sceneService';
import Scene from '../../models/Scene.model';

jest.mock('../../models/Scene.model', () => ({
  __esModule: true,
  default: {
    findByIdAndUpdate: jest.fn(),
  },
}));

const findByIdAndUpdate = Scene.findByIdAndUpdate as jest.Mock;

describe('sceneService.updateScene', () => {
  beforeEach(() => {
    findByIdAndUpdate.mockReset();
    findByIdAndUpdate.mockResolvedValue({ _id: 'scene-1', name: 'Cripta' });
  });

  it('atualiza nome, tipo, grade e escala em uma chamada', async () => {
    await updateScene('scene-1', {
      name: '  Cripta  ',
      type: 'image',
      gridWidth: 12,
      gridHeight: 8,
      metersPerSquare: 1.5,
    });

    expect(findByIdAndUpdate).toHaveBeenCalledWith(
      'scene-1',
      {
        name: 'Cripta',
        type: 'image',
        gridWidth: 12,
        gridHeight: 8,
        metersPerSquare: 1.5,
      },
      { new: true },
    );
  });

  it('recusa patch vazio e valores inválidos', async () => {
    await expect(updateScene('scene-1', {})).rejects.toMatchObject({ status: 400 });
    await expect(updateScene('scene-1', { gridWidth: 0 })).rejects.toMatchObject({ status: 400 });
    await expect(updateScene('scene-1', { metersPerSquare: 0 })).rejects.toMatchObject({ status: 400 });
  });

  it('retorna 404 quando a cena não existe', async () => {
    findByIdAndUpdate.mockResolvedValue(null);
    await expect(updateScene('missing', { type: 'battlemap' })).rejects.toMatchObject({ status: 404 });
  });
});
