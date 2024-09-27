import React, { useState, useRef, useEffect, useCallback } from 'react';
import './BattleMap.css';

interface Token {
  id: string;
  name: string;
  movement: number;
  remainingMovement: number;
  x: number;
  y: number;
  color: string;
  image?: string;
}

const BattleMap: React.FC = () => {
  const [image, setImage] = useState<string | ArrayBuffer | null>(null);
  const [gridSize, setGridSize] = useState(25); // Tamanho inicial do grid
  const [tokens, setTokens] = useState<Token[]>([]);
  const [currentTurn, setCurrentTurn] = useState<number>(0); // Indica o token atual no turno
  const [, setCreateTokenPopupOpen] = useState(false); // Estado para controlar popup
  const [showCreateTokenPopup, setShowCreateTokenPopup] = useState(false);
  const [showManageTokensPopup, setShowManageTokensPopup] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const toggleCreateTokenPopup = () => {
    setShowCreateTokenPopup(!showCreateTokenPopup);
  };

  const toggleManageTokensPopup = () => {
    setShowManageTokensPopup(!showManageTokensPopup);
  }

  // Função para fechar o popup de criação de token
  const closeCreateTokenPopup = () => {
    setCreateTokenPopupOpen(false);
  };

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
    const maxWidth = window.innerWidth * 0.7; // Ajuste de 70% da largura da janela
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
      name: name,
      movement: movement,
      remainingMovement: movement,
      x: x * gridSize,
      y: y * gridSize,
      color: getRandomColor(),
    };
    setTokens((prev) => [...prev, token]);
    closeCreateTokenPopup(); // Fechar o popup após a criação do token
  };  

  const handleMoveToken = useCallback(
    (tokenId: string, direction: string) => {
      setTokens((prevTokens) =>
        prevTokens.map((token, idx) => {
          if (token.id === tokenId && idx === currentTurn && token.remainingMovement > 0) {
            let newX = token.x;
            let newY = token.y;
  
            // Movimentação baseada na direção
            switch (direction) {
              case 'up':
                newY = Math.max(token.y - gridSize, 0);
                break;
              case 'down':
                newY = Math.min(token.y + gridSize, canvasRef.current?.height || 0);
                break;
              case 'left':
                newX = Math.max(token.x - gridSize, 0);
                break;
              case 'right':
                newX = Math.min(token.x + gridSize, canvasRef.current?.width || 0);
                break;
              case 'up-left':
                newX = Math.max(token.x - gridSize, 0);
                newY = Math.max(token.y - gridSize, 0);
                break;
              case 'up-right':
                newX = Math.min(token.x + gridSize, canvasRef.current?.width || 0);
                newY = Math.max(token.y - gridSize, 0);
                break;
              case 'down-left':
                newX = Math.max(token.x - gridSize, 0);
                newY = Math.min(token.y + gridSize, canvasRef.current?.height || 0);
                break;
              case 'down-right':
                newX = Math.min(token.x + gridSize, canvasRef.current?.width || 0);
                newY = Math.min(token.y + gridSize, canvasRef.current?.height || 0);
                break;
              default:
                break;
            }
  
            // Atualiza o movimento restante do token
            return { ...token, x: newX, y: newY, remainingMovement: token.remainingMovement - 1 };
          }
          return token;
        })
      );
    },
    [gridSize, currentTurn]
  );
      
  // Função para excluir um token
  const handleDeleteToken = (tokenId: string) => {
    setTokens((prevTokens) => prevTokens.filter((token) => token.id !== tokenId));
  };

  const nextTurn = () => {
    setCurrentTurn((prevTurn) => {
      const newTurn = (prevTurn + 1) % tokens.length;
      
      setTokens((prevTokens) =>
        prevTokens.map((token, idx) => {
          if (idx === newTurn) {
            return { ...token, remainingMovement: token.movement }; // Reseta o movimento do token da vez
          }
          return token;
        })
      );
      
      return newTurn;
    });
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
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      for (let x = 0; x <= canvas.width; x += gridSize) {
        for (let y = 0; y <= canvas.height; y += gridSize) {
          // Desenha o quadrado do grid
          ctx.strokeRect(x, y, gridSize, gridSize);
        }
      }
  
      // Desenhar as coordenadas fora dos quadrados
      ctx.fillStyle = 'white';
      ctx.font = '8px Arial';
  
      // Eixo X (coordenadas horizontais)
      for (let x = 0; x <= canvas.width; x += gridSize) {
        ctx.fillText(`${x / gridSize}`, x + gridSize / 2, 10); // Coordenadas X acima do grid
      }
  
      // Eixo Y (coordenadas verticais)
      for (let y = 0; y <= canvas.height; y += gridSize) {
        ctx.fillText(`${y / gridSize}`, 5, y + gridSize / 2); // Coordenadas Y à esquerda do grid
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
        ctx.font = 'bold 9px Arial';
        const tokenInicials = token.name.slice(0, 2);
        ctx.fillText(tokenInicials, token.x + gridSize / 2 - 5, token.y + gridSize / 2 + 5);
        
        // Indicar o token que está com o turno atual
        if (index === currentTurn) {
          ctx.strokeStyle = 'red';
          ctx.lineWidth = 2;
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
    <div className="battle-map-container">
      <h1>Mapa de Batalha</h1>


      <div className="load-map">
      <h3>Carregar o Mapa de Batalha</h3>
        <label>Carregar Mapa: </label>
        <input className="load-map-button" type="file" onChange={handleImageUpload} />

        <label>Grid Size: </label>
        <input className="grid-size"
          type="number"
          value={gridSize}
          onChange={(e) => setGridSize(Number(e.target.value))}
        />
      </div>

      <div className="grid-container">
        <canvas ref={canvasRef}></canvas>
        <div className="tokens-panel">
          <button onClick={toggleCreateTokenPopup}>Inserir personagem</button>

          {showCreateTokenPopup && (
            <div className="create-token-popup">
              <div className="create-token-content">
                <h3>Insira as informações do personagem</h3>
                <div className="token-creation">
                  <input type="text" placeholder="Nome" id="tokenName" />
                  <input type="number" placeholder="Quantidade de Movimento" id="tokenMovement" />
                  <input type="number" placeholder="Posição X" id="tokenX" />
                  <input type="number" placeholder="Posição Y" id="tokenY" />
                  <button
                    onClick={() => {
                      handleCreateToken(
                        (document.getElementById('tokenName') as HTMLInputElement).value,
                        Number((document.getElementById('tokenMovement') as HTMLInputElement).value),
                        Number((document.getElementById('tokenX') as HTMLInputElement).value),
                        Number((document.getElementById('tokenY') as HTMLInputElement).value)
                      );
                      toggleCreateTokenPopup(); // Fecha o pop-up
                    }}
                  >
                    Inserir ao combate
                  </button>

                  <button onClick={toggleCreateTokenPopup}>Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {tokens.length > 0 && (
            <div>
              <button onClick={nextTurn}>Encerrar o turno</button>
              <div>
                <p>Turno atual: {tokens[currentTurn]?.name}</p>
                <p>Quantidade de movimento: {tokens[currentTurn]?.remainingMovement}</p>
                <div className="movement-buttons">
                  <div className="movement-row">
                    <button onClick={() => handleMoveToken(tokens[currentTurn].id, 'up-left')}>🡴</button>
                    <button onClick={() => handleMoveToken(tokens[currentTurn].id, 'up')}>🡱</button>
                    <button onClick={() => handleMoveToken(tokens[currentTurn].id, 'up-right')}>🡵</button>
                  </div>
                  <div className="movement-row">
                    <button onClick={() => handleMoveToken(tokens[currentTurn].id, 'left')}>🡰</button>
                    <button disabled>⭯</button>
                    <button onClick={() => handleMoveToken(tokens[currentTurn].id, 'right')}>🡲</button>  
                  </div>
                  <div className="movement-row">
                    <button onClick={() => handleMoveToken(tokens[currentTurn].id, 'down-left')}>🡷</button>
                    <button onClick={() => handleMoveToken(tokens[currentTurn].id, 'down')}>🡳</button>
                    <button onClick={() => handleMoveToken(tokens[currentTurn].id, 'down-right')}>🡶</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <button onClick={toggleManageTokensPopup}>Gerenciar Tokens</button>

          {showManageTokensPopup && (
            <div className="manage-tokens-popup">
              <div className="manage-tokens-content">
                <h3>Gerenciar Tokens</h3>
                {tokens.length === 0 ? (
                  <p>Nenhum token para gerenciar</p>
                ) : (	
                  <ul>
                    {tokens.map((token) => (
                      <li key={token.id}>
                        {token.name}{' '}
                        <button onClick={() => handleDeleteToken(token.id)}>Excluir</button>
                        <button onClick={() => moveTokenInTurnOrder(token.id, 'up')}>⬆</button>
                        <button onClick={() => moveTokenInTurnOrder(token.id, 'down')}>⬇</button>
                      </li>
                    ))}
                  </ul>
                )}
                <button onClick={toggleManageTokensPopup}>Fechar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BattleMap;
