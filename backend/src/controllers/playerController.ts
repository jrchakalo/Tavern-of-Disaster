import { Request, Response } from 'express';
import { PrismaClient } from '../../node_modules/.prisma/client';

const prisma = new PrismaClient();

// Função para criar a ficha de personagem
export const createCharacterSheet = async (req: Request, res: Response) => {
  const { tableCode } = req.params;
  const userId = (req as any).userId;
  const characterName = req.body.characterName;
  const characterClass = req.body.characterClass;
  const characterSpecie = req.body.characterSpecie;
  const characterSubSpecie = req.body.characterSubSpecie; 
  const characterLevel = req.body.characterLevel;
  const characterBackground = req.body.characterBackground;
  const characterAlignment = req.body.characterAlignment;
  const characterExperience = req.body.characterExperience;
  const characterStrength = req.body.characterStrength;
  const characterDexterity = req.body.characterDexterity;
  const characterConstitution = req.body.characterConstitution;
  const characterIntelligence = req.body.characterIntelligence;
  const characterWisdom = req.body.characterWisdom;
  const characterCharisma = req.body.characterCharisma;
  const characterArmorClass = req.body.characterArmorClass;
  const characterWalkSpeed = req.body.characterWalkSpeed;
  const characterProficiencies = req.body.characterProficiencies; 
  const characterTraits = req.body.characterTraits; 
  const characterHP = req.body.characterHP; 

  try {
    // Verificar se o usuário é parte da mesa
    const player = await prisma.player.findFirst({
      where: { userId, table: { code: tableCode } },
    });

    if (!player) {
      return res.status(403).json({ message: 'Você não faz parte dessa mesa.' });
    }

    // Salva dados no banco de dados
    await prisma.characterSheet.create({
      data: {
        playerId: player.id,
        name: characterName,
        class: characterClass,
        level: characterLevel,
        exp: characterExperience,
        species: characterSpecie,
        subSpecies: characterSubSpecie,
        background: characterBackground,
        alignment: characterAlignment,
        str: characterStrength,
        dex: characterDexterity,
        con: characterConstitution,
        inte: characterIntelligence,
        wis: characterWisdom,
        char: characterCharisma,
        ac: characterArmorClass,
        walk: characterWalkSpeed,
        prof: characterProficiencies,
        traits: characterTraits,
        hp: characterHP
      },
    });

    res.status(200).json({ message: 'Ficha criada com sucesso.' });
  } catch (error) {
    console.error('Erro ao criar ficha:', error);
    res.status(500).json({ message: 'Erro no servidor.' });
  }
};

export const getCharacterSheet = async (req: Request, res: Response) => {
  const { tableCode } = req.params;
  const userId = (req as any).userId; // ID do jogador logado

  try {
    // Verificar se o usuário faz parte da mesa
    const player = await prisma.player.findFirst({
      where: { userId, table: { code: tableCode } },
    });

    if (!player) {
      return res.status(403).json({ message: 'Você não faz parte dessa mesa.' });
    }

    // Busca a ficha do personagem
    const sheet = await prisma.characterSheet.findFirst({
      where: { playerId: player.id },
    });

    
    if (!sheet) {
      return res.status(404).json({ message: 'Ficha não encontrada.' });
    }

    res.status(200).json(sheet);
  } catch (error) {
    console.error('Erro ao buscar ficha:', error);
    res.status(500).json({ message: 'Erro no servidor.' });
  }
};

export const transferDM = async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const { tableId, newDmId } = req.body;
  
    try {
      // Verifica se o usuário atual é o DM da mesa
      const dm = await prisma.player.findFirst({
        where: { userId, tableId, role: 'DM' },
      });
  
      if (!dm) {
        return res.status(403).json({ message: 'Apenas o DM atual pode transferir o papel de DM.' });
      }
  
      // Verifica se o novo DM faz parte da mesa
      const newDm = await prisma.player.findFirst({
        where: { userId: newDmId, tableId },
      });
  
      if (!newDm) {
        return res.status(404).json({ message: 'O jogador selecionado não faz parte da mesa.' });
      }
  
      // Atualiza o papel do novo DM
      await prisma.player.update({
        where: { id: newDm.id },
        data: { role: 'DM' },
      });
  
      // Atualiza o papel do DM anterior para jogador
      await prisma.player.update({
        where: { id: dm.id },
        data: { role: 'PLAYER' },
      });
  
      res.status(200).json({ message: 'Papel de DM transferido com sucesso.' });
    } catch (error) {
      console.error('Erro ao transferir DM:', error);
      res.status(500).json({ message: 'Erro no servidor.' });
    }
};

export const removePlayer = async (req: Request, res: Response) => {
    const { tableId, playerId } = req.body;
    const userId = (req as any).userId;
  
    try {
      // Verifica se o usuário é DM da mesa
      const dm = await prisma.player.findFirst({
        where: { userId, tableId, role: 'DM' },
      });
  
      if (!dm) {
        return res.status(403).json({ message: 'Apenas o DM pode remover jogadores.' });
      }
  
      // Remove o jogador da mesa
      await prisma.player.delete({
        where: { id: playerId },
      });
  
      res.status(200).json({ message: 'Jogador removido com sucesso.' });
    } catch (error) {
      console.error('Erro ao remover jogador:', error);
      res.status(500).json({ message: 'Erro no servidor.' });
    }
};