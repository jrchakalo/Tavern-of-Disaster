import { Request, Response } from 'express';
import { PrismaClient } from '../../node_modules/.prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const pdfDirectory = path.join(__dirname, '../../uploads/characters');

if (!fs.existsSync(pdfDirectory)) {
    fs.mkdirSync(pdfDirectory, { recursive: true });
}

// Função para salvar a ficha de personagem
export const saveCharacterSheet = async (req: Request, res: Response) => {
  const { tableCode } = req.params;
  const userId = (req as any).userId;

  try {
    // Verificar se o usuário é parte da mesa
    const player = await prisma.player.findFirst({
      where: { userId, table: { code: tableCode } },
    });

    if (!player) {
      return res.status(403).json({ message: 'Você não faz parte dessa mesa.' });
    }

    // Verificar se o arquivo foi enviado
    if (!req.file) {
      return res.status(400).json({ message: 'Nenhum arquivo enviado.' });
    }

    // Nome do arquivo no formato "ficha-*codigo da mesa*-*nome do personagem*.pdf"
    const filename = `ficha-${tableCode}-${userId}.pdf`;
    const filePath = path.join(pdfDirectory, filename);

    // Salva o arquivo no servidor
    fs.writeFileSync(filePath, req.file.buffer);

    // Salva o caminho do arquivo no banco de dados (opcional)
    await prisma.characterSheet.create({
      data: {
        filePath,
        playerId: player.id,
      },
    });

    res.status(200).json({ message: 'Ficha salva com sucesso.' });
  } catch (error) {
    console.error('Erro ao salvar ficha:', error);
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

    // Nome do arquivo no formato "ficha-*codigo da mesa*-*id do jogador*.pdf"
    const filename = `ficha-${tableCode}-${userId}.pdf`;
    const filePath = path.join(pdfDirectory, filename);

    // Verificar se o arquivo existe
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Ficha não encontrada.' });
    }

    // Ler o arquivo PDF e enviá-lo como resposta
    const file = fs.readFileSync(filePath);
    
    // Definir o tipo de conteúdo como PDF e enviar o arquivo
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=${filename}`);
    res.send(file);
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