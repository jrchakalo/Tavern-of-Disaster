import React, { useState, useRef, useEffect, useCallback } from 'react';
import 'BattleMap.css';

interface Token {
  id: string;
  name: string;
  movement: number;
  x: number;
  y: number;
  color: string;
  image?: string;
}

const BattleMap: React.FC = () => {
  const [image, setImage] = useState<string | ArrayBuffer | null>(null);
  const [gridSize, setGridSize] = useState(20); // Tamanho inicial do grid
  const [tokens, setTokens] = useState<Token[]>([]);
  const [movementLeft, setMovementLeft] = useState<number>(0);
  const [currentTurn, setCurrentTurn] = useState<number>(0); // Indica o token atual no turno

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Função para carregar a imagem do mapa
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  // Redimensionar a imagem do mapa para caber na tela
  const resizeImageToFitScreen = (img: HTMLImageElement, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const maxWidth = window.innerWidth * 0.9; // Ajuste de 90% da largura da janela
    const maxHeight = window.innerHeight * 0.8; // Ajuste de 80% da altura da janela

    const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);

    canvas.width = img.width * ratio;
    canvas.height = img.height * ratio;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };

  // Função para criar um token com posição inicial
  const handleCreateToken = (name: string, movement: number, x: number, y: number) => {
    const token: Token = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      movement,
      x: x * gridSize,
      y: y * gridSize,
      color: getRandomColor(),
    };
    setTokens((prev) => [...prev, token]);
  };

  // Função para movimentar um token
  const handleMoveToken = (tokenId: string, direction: string) => {
    setTokens((prevTokens) =>
      prevTokens.map((token, idx) => {
        if (token.id === tokenId && movementLeft > 0 && idx === currentTurn) {
          switch (direction) {
            case 'up':
              token.y = Math.max(token.y - gridSize, 0);
              break;
            case 'down':
              token.y = Math.min(token.y + gridSize, canvasRef.current?.height || 0);
              break;
            case 'left':
              token.x = Math.max(token.x - gridSize, 0);
              break;
            case 'right':
              token.x = Math.min(token.x + gridSize, canvasRef.current?.width || 0);
              break;
            default:
              break;
          }
          setMovementLeft(movementLeft - 1);
        }
        return token;
      })
    );
  };

  // Função para excluir um token
  const handleDeleteToken = (tokenId: string) => {
    setTokens((prevTokens) => prevTokens.filter((token) => token.id !== tokenId));
  };

  // Função para passar o turno para o próximo token
  const nextTurn = () => {
    setCurrentTurn((prevTurn) => (prevTurn + 1) % tokens.length);
    setMovementLeft(tokens[(currentTurn + 1) % tokens.length]?.movement || 0);
  };

  // Função para alterar a ordem dos tokens no turno
  const moveTokenInTurnOrder = (tokenId: string, direction: 'up' | 'down') => {
    const index = tokens.findIndex((t) => t.id === tokenId);
    if (index === -1) return;

    const newTokens = [...tokens];
    if (direction === 'up' && index > 0) {
      [newTokens[index], newTokens[index - 1]] = [newTokens[index - 1], newTokens[index]];
    } else if (direction === 'down' && index < tokens.length - 1) {
      [newTokens[index], newTokens[index + 1]] = [newTokens[index + 1], newTokens[index]];
    }
    setTokens(newTokens);
  };

  // Função para desenhar o grid e os tokens no canvas
  const drawMap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mapImage = new Image();
    mapImage.src = image as string;
    mapImage.onload = () => {
      resizeImageToFitScreen(mapImage, ctx, canvas);

      // Desenha o grid
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      for (let x = 0; x < canvas.width; x += gridSize) {
        for (let y = 0; y < canvas.height; y += gridSize) {
          ctx.strokeRect(x, y, gridSize, gridSize);
        }
      }

      // Desenha os tokens
      tokens.forEach((token, index) => {
        ctx.fillStyle = token.color;
        ctx.beginPath();
        ctx.arc(
          token.x + gridSize / 2,
          token.y + gridSize / 2,
          gridSize / 2,
          0,
          2 * Math.PI
        );
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.fillText(token.name[0].toUpperCase(), token.x + gridSize / 2 - 5, token.y + gridSize / 2 + 5);
        // Indicar o token que está com o turno atual
        if (index === currentTurn) {
          ctx.strokeStyle = 'red';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      });
    };
  }, [image, gridSize, tokens, currentTurn]);

  useEffect(() => {
    drawMap();
  }, [drawMap]);

  const getRandomColor = () => {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  };

  return (
    <div>
      <h1>Battle Map</h1>
      <input type="file" onChange={handleImageUpload} />
      <div>
        <label>Grid Size: </label>
        <input
          type="number"
          value={gridSize}
          onChange={(e) => setGridSize(Number(e.target.value))}
        />
      </div>
      <canvas ref={canvasRef}></canvas>
      <div>
        <h3>Create Token</h3>
        <input type="text" placeholder="Token Name" id="tokenName" />
        <input type="number" placeholder="Movement" id="tokenMovement" />
        <input type="number" placeholder="Initial X Position" id="tokenX" />
        <input type="number" placeholder="Initial Y Position" id="tokenY" />
        <button
          onClick={() =>
            handleCreateToken(
              (document.getElementById('tokenName') as HTMLInputElement).value,
              Number(
                (document.getElementById('tokenMovement') as HTMLInputElement)
                  .value
              ),
              Number(
                (document.getElementById('tokenX') as HTMLInputElement).value
              ),
              Number(
                (document.getElementById('tokenY') as HTMLInputElement).value
              )
            )
          }
        >
          Create Token
        </button>
      </div>
      {tokens.length > 0 && (
        <div>
          <h3>Move Token</h3>
          <button onClick={nextTurn}>Next Turn</button>
          <div>
            <p>Current Turn: {tokens[currentTurn]?.name}</p>
            <p>Movement Left: {movementLeft}</p>
            <button onClick={() => handleMoveToken(tokens[currentTurn].id, 'up')}>
              Up
            </button>
            <button onClick={() => handleMoveToken(tokens[currentTurn].id, 'down')}>
              Down
            </button>
            <button onClick={() => handleMoveToken(tokens[currentTurn].id, 'left')}>
              Left
            </button>
            <button onClick={() => handleMoveToken(tokens[currentTurn].id, 'right')}>
              Right
            </button>
          </div>
        </div>
      )}
      {tokens.length > 0 && (
        <div>
          <h3>Tokens</h3>
          <ul>
            {tokens.map((token, index) => (
              <li key={token.id}>
                {token.name} - Movement: {token.movement} - Position: ({token.x / gridSize}, {token.y / gridSize})
                <button onClick={() => handleDeleteToken(token.id)}>Delete</button>
                {index > 0 && (
                  <button onClick={() => moveTokenInTurnOrder(token.id, 'up')}>
                    Move Up
                  </button>
                )}
                {index < tokens.length - 1 && (
                  <button onClick={() => moveTokenInTurnOrder(token.id, 'down')}>
                    Move Down
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default BattleMap;
