import React, { useState, useRef, useEffect, useCallback } from 'react';
import './BattleMap.css';
import Header from '../components/Header';
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000');

interface Token {
  id: string;
  name: string;
  size: 'Minusculo' | 'Pequeno' | 'Normal' | 'Grande' | 'Enorme' | 'Descomunal' | 'Colossal';
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
  const [mapLoaded, setMapLoaded] = useState(false);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [currentTurn, setCurrentTurn] = useState<number>(0); // Indica o token atual no turno
  const [, setCreateTokenPopupOpen] = useState(false); // Estado para controlar popup
  const [showCreateTokenPopup, setShowCreateTokenPopup] = useState(false);
  const [showManageTokensPopup, setShowManageTokensPopup] = useState(false);
  const [showEditTokenPopup, setShowEditTokenPopup] = useState(false); // Controle do popup de edição
  const [editingToken, setEditingToken] = useState<Token | null>(null); // Token em edição
  const [movementHistory, setMovementHistory] = useState<Token[][]>([]);
  const [zoomLevel, setZoomLevel] = useState(1);

  const handleZoomIn = () => {
    setZoomLevel((prevZoom) => {
        const newZoom = Math.min(prevZoom + 0.1, 3); // Limite máximo de zoom
        setGridSize((prevGridSize) => prevGridSize * (newZoom / prevZoom)); // Update grid size
        setTokens((prevTokens) => 
            prevTokens.map(token => ({
                ...token,
                x: token.x * (newZoom / prevZoom),
                y: token.y * (newZoom / prevZoom)
            }))
        ); // Update token positions
        return newZoom;
    });
  };

  const handleZoomOut = () => {
    setZoomLevel((prevZoom) => {
        const newZoom = Math.max(prevZoom - 0.1, 0.5); // Limite mínimo de zoom
        setGridSize((prevGridSize) => prevGridSize * (newZoom / prevZoom)); // Update grid size
        setTokens((prevTokens) => 
            prevTokens.map(token => ({
                ...token,
                x: token.x * (newZoom / prevZoom),
                y: token.y * (newZoom / prevZoom)
            }))
        ); // Update token positions
        return newZoom;
    });
  };

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

  const handleEditToken = (token: Token) => {
    setEditingToken(token);
    setShowEditTokenPopup(true);
  };

  const handleSaveToken = () => {
    if (editingToken) {
      setTokens((prevTokens) =>
        prevTokens.map((token) =>
          token.id === editingToken.id ? editingToken : token
        )
      );
    }
    setShowEditTokenPopup(false); // Fechar popup após salvar
  };

  // Função para carregar a imagem do mapa
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setImage(reader.result);
        setMapLoaded(true);

        socket.emit('load_battle_map', reader.result);
      }
      reader.readAsDataURL(file);
    }
  };

  // Redimensionar a imagem do mapa para caber na tela
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resizeImageToFitScreen = (img: HTMLImageElement, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const maxWidth = window.innerWidth * 0.7;
    const maxHeight = window.innerHeight * 0.7; 

    const ratio = Math.min(maxWidth / img.width, maxHeight / img.height) * zoomLevel;

    canvas.width = img.width * ratio;
    canvas.height = img.height * ratio;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };

  // Função para criar um token com posição inicial
  const handleCreateToken = (name: string, size: 'Minusculo' | 'Pequeno' | 'Normal' | 'Grande' | 'Enorme' | 'Descomunal' | 'Colossal', movement: number, x: number, y: number) => {
    const token: Token = {
      id: Math.random().toString(36).substr(2, 9),
      name: name,
      size: size,
      movement: movement,
      remainingMovement: Math.floor(movement / 1.5),
      x: x * gridSize,
      y: y * gridSize,
      color: getRandomColor(),
    };

    // Emite a criação do token para o servidor
    socket.emit('create_token', token);

    setTokens((prev) => [...prev, token]);
    closeCreateTokenPopup(); // Fechar o popup após a criação do token
  };  

  const handleMoveToken = useCallback(
    (tokenId: string, direction: string) => {
      setTokens((prevTokens) => {
          const newHistory = [...movementHistory, prevTokens];
          setMovementHistory(newHistory);

          return prevTokens.map((token, idx) => {
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
            const updateToken = { ...token, x: newX, y: newY, remainingMovement: token.remainingMovement - 1 };
            
            // Emite o evento de movimentação para o servidor
            socket.emit('move_token', updateToken);

            return updateToken;
          }
          return token;
        });
      });
    },
    [gridSize, currentTurn, movementHistory]
  );

  // Função para desfazer o último movimento
  const undoLastMove = () => {
    if (movementHistory.length > 0) {
      const previousState = movementHistory[movementHistory.length - 1]; // Recupera o último estado salvo
      setTokens(previousState); // Reverte o estado dos tokens

      socket.emit('undo_move', previousState);

      setMovementHistory((prevHistory) => prevHistory.slice(0, -1)); // Remove o último estado do histórico
    }
  };
      
  // Função para excluir um token
  const handleDeleteToken = (tokenId: string) => {
    setTokens((prevTokens) => {
      const deleteToken = prevTokens.filter((token) => token.id !== tokenId);

      // Emitir para o servidor para que a exclusão seja propagada
      socket.emit('delete_token', tokenId);

      return deleteToken;
    });
  };

  const nextTurn = () => {
    setCurrentTurn((prevTurn) => {
      const newTurn = (prevTurn + 1) % tokens.length;
      
      setTokens((prevTokens) =>
        prevTokens.map((token, idx) => {
          if (idx === newTurn) {
            return { ...token, remainingMovement: (token.movement / 1.5) }; // Reseta o movimento do token da vez
          }
          return token;
        })
      );
      
      socket.emit('next_turn', newTurn);
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

    // Emitir a nova ordem de tokens para o servidor
    socket.emit('move_token_in_turn_order', newTokens);
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
        ctx.fillText(`${Math.round(x / gridSize)}`, x + gridSize / 2, 10); // Coordenadas X acima do grid
      }
  
      // Eixo Y (coordenadas verticais)
      for (let y = 0; y <= canvas.height; y += gridSize) {
        ctx.fillText(`${Math.round(y / gridSize)}`, 5, y + gridSize / 2); // Coordenadas Y à esquerda do grid
      }

      // Tamanhos dos tokens
      const tokenSizes = {
        "Minusculo": 1,   // 1x1 quadrado
        "Pequeno": 1,     // 1x1 quadrado
        "Normal": 1,      // 1x1 quadrado
        "Grande": 2,      // 2x2 quadrados
        "Enorme": 3,      // 3x3 quadrados
        "Descomunal": 4,  // 4x4 quadrados
        "Colossal": 6     // 6x6 quadrados
      };
  
      // Desenha os tokens
      tokens.forEach((token, index) => {
        // Pegue o tamanho do token em quadrados
        const tokenSize = tokenSizes[token.size as keyof typeof tokenSizes];
        const sizeInPixels = tokenSize * gridSize; // Tamanho total em pixels
        
        // Calcular o centro do token
        const tokenCenterX = token.x + (sizeInPixels / 2);
        const tokenCenterY = token.y + (sizeInPixels / 2);
        
        // Desenhar o token como um círculo (ou quadrado, dependendo da necessidade)
        ctx.fillStyle = token.color;
        ctx.beginPath();
        ctx.arc(
          tokenCenterX,            // Posição X do centro do token
          tokenCenterY,            // Posição Y do centro do token
          (sizeInPixels / 2),      // Raio ajustado ao tamanho do token
          0,
          2 * Math.PI
        );
        ctx.fill();
        
        // Definir estilo para o texto (iniciais do token)
        ctx.fillStyle = '#000';
        ctx.font = `${Math.max(7 * tokenSize, 7)}px Arial`;  // Aumenta o tamanho da fonte com base no token
        ctx.textAlign = 'center';
        
        // Pegar as 3 primeiras letras do nome do token
        const tokenInicials = token.name.slice(0, 3);
        
        // Posicionar o texto centralizado dentro do token
        ctx.fillText(
          tokenInicials, 
          tokenCenterX,            // Posição X central
          tokenCenterY + 3         // Posição Y (ajustado levemente para baixo)
        );

        // Indicar o token que está com o turno atual
        if (index === currentTurn) {
          ctx.strokeStyle = 'red';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });
    };
  }, [image, gridSize, tokens, currentTurn, resizeImageToFitScreen]);

  useEffect(() => {
    drawMap();
  }, [zoomLevel, drawMap]);

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Conectado:', socket.id);
    });

    // Escutando o evento de carregamento de mapa vindo do servidor
    socket.on('battle_map_loaded', (imageData) => {
      setImage(imageData);
      setMapLoaded(true);
    });

    // Escutando o evento de criação de token vindo do servidor
    socket.on('token_created', (token) => {
      setTokens((prev) => {
        // Verifica se o token já existe antes de adicionar
        if (!prev.some(t => t.id === token.id)) {
          return [...prev, token];
        }
        return prev;
      });
    });

    // Escutando o evento de movimentação de token vindo do servidor
    socket.on('token_moved', (updatedToken) => {
      setTokens((prevTokens) =>
        prevTokens.map((token) =>
          token.id === updatedToken.id
            ? { ...token, x: updatedToken.x, y: updatedToken.y, remainingMovement: updatedToken.remainingMovement }
            : token
        )
      );
    });

    socket.on('turn_changed', (newTurn) => {
      setCurrentTurn(newTurn);
      setTokens((prevTokens) =>
        prevTokens.map((token, idx) => {
          if (idx === newTurn) {
            return { ...token, remainingMovement: (token.movement / 1.5) }; // Reseta o movimento do token da vez
          }
          return token;
        })
      );
    });

    // Escutando o evento de desfazer o movimento
    socket.on('tokens_updated', (updatedTokens) => {
      setTokens(updatedTokens); // Atualiza os tokens para o estado revertido
    });

    // Escutando o evento de exclusão de token
    socket.on('token_deleted', (tokenId) => {
      setTokens((prevTokens) => prevTokens.filter((token) => token.id !== tokenId)); // Remove o token excluído
    });

    // Escutando o evento de atualização da ordem dos tokens
    socket.on('tokens_order_updated', (newTokens) => {
      setTokens(newTokens); // Atualiza a ordem dos tokens
    });
  
    socket.on('disconnect', () => {
      console.log('Desconectado do servidor');
    });

    /*return () => {
      socket.off('battle_map_loaded');
      socket.disconnect();
    };*/
  }, []);

  const getRandomColor = () => {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  };

  return (
    <div className="battle-map-page">
      <Header />
      <div className="battle-map-container">
        {mapLoaded ? (
          <>
            <div className="grid-container">
              <canvas ref={canvasRef}></canvas>
            </div>
            <div className="tokens-panel">
              <div className='grid-configure'>
                <label>Tamanho do Grid:</label>
                  <input className="grid-size"
                    type="number"
                    min = "10"
                    max = "50"
                    value={gridSize}
                    onChange={(e) => setGridSize(Number(e.target.value))}
                />
              </div>
              <div className="controls">
                <button onClick={handleZoomIn}>🔎</button>
                <button onClick={handleZoomOut}>🔍</button>
              </div>
              <button onClick={toggleCreateTokenPopup}>Inserir personagem</button>
              
              {showCreateTokenPopup && (
                <div className="create-token-popup">
                  <div className="create-token-content">
                    <h3>Insira as informações do personagem</h3>
                    <div className="token-creation">
                      <input type="text" placeholder="Nome" id="tokenName" />
                      <label>Tamanho da criatura:</label>
                        <select id="tokenSize" defaultValue="Normal">
                        <option value="Minusculo">Minusculo</option>
                        <option value="Pequeno">Pequeno</option>
                        <option value="Normal">Normal</option>
                        <option value="Grande">Grande</option>
                        <option value="Enorme">Enorme</option>
                        <option value="Descomunal">Descomunal</option>
                        <option value="Colossal">Colossal</option>
                        </select>
                      <input type="number" placeholder="Quantidade de Movimento" id="tokenMovement" />
                      <input type="number" placeholder="Posição X" id="tokenX" />
                      <input type="number" placeholder="Posição Y" id="tokenY" />
                      <button
                        onClick={() => {
                          handleCreateToken(
                            (document.getElementById('tokenName') as HTMLInputElement).value,
                            (document.getElementById('tokenSize') as HTMLSelectElement).value as 'Minusculo' | 'Pequeno' | 'Normal' | 'Grande' | 'Enorme' | 'Descomunal' | 'Colossal',
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
                    <p>Quantidade de movimento: {tokens[currentTurn]?.movement}</p>
                    <p>Quantidade de quadrados: {tokens[currentTurn]?.remainingMovement}</p>
                    <div className="movement-buttons">
                      <div className="movement-row">
                        <button onClick={() => handleMoveToken(tokens[currentTurn].id, 'up-left')}>🡴</button>
                        <button onClick={() => handleMoveToken(tokens[currentTurn].id, 'up')}>🡱</button>
                        <button onClick={() => handleMoveToken(tokens[currentTurn].id, 'up-right')}>🡵</button>
                      </div>
                      <div className="movement-row">
                        <button onClick={() => handleMoveToken(tokens[currentTurn].id, 'left')}>🡰</button>
                        <button
                          onClick={undoLastMove}
                          disabled={movementHistory.length === 0} // Desabilitar quando não houver movimentos no histórico
                        >
                          ⭯
                        </button>
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

              <button onClick={toggleManageTokensPopup}>Gerenciar Turnos</button>

              {showManageTokensPopup && (
                <div className="manage-tokens-popup">
                  <div className="manage-tokens-content">
                    <h3>Gerenciar Turnos</h3>
                    {tokens.length === 0 ? (
                      <p>Nenhum token para gerenciar</p>
                    ) : (	
                      <ul>
                        {tokens.map((token) => (
                          <li key={token.id}>
                            {token.name}{' '}
                            <button onClick={() => moveTokenInTurnOrder(token.id, 'up')}>⬆️</button>
                            <button onClick={() => moveTokenInTurnOrder(token.id, 'down')}>⬇️</button>
                            <button onClick={() => handleEditToken(token)}>✏️</button>
                            <button onClick={() => handleDeleteToken(token.id)}>🗑️</button> 
                          </li>
                        ))}
                      </ul>
                    )}
                    <button className="close-menage-button" onClick={toggleManageTokensPopup}>Fechar</button>
                  </div>
                </div>
              )}

              {showEditTokenPopup && editingToken && (
                  <div className="create-token-popup">
                    <div className="create-token-content">
                      <h3>Editar informações do personagem</h3>
                      <label>Nome: </label>
                      <input
                        type="text"
                        value={editingToken.name}
                        onChange={(e) =>
                          setEditingToken({ ...editingToken, name: e.target.value })
                        }
                        placeholder="Nome"
                      />
                      <label>Movimento: </label>
                      <input
                        type="number"
                        value={editingToken.movement}
                        onChange={(e) =>
                          setEditingToken({
                            ...editingToken,
                            movement: Number(e.target.value),
                            remainingMovement: Number(e.target.value),
                          })
                        }
                        placeholder="Movimento"
                      />
                      <label>Posição X: </label>
                      <input
                        type="number"
                        value={editingToken.x / gridSize}
                        onChange={(e) =>
                          setEditingToken({
                            ...editingToken,
                            x: Number(e.target.value) * gridSize,
                          })
                        }
                        placeholder="Posição X"
                      />
                      <label>Posição Y: </label>
                      <input
                        type="number"
                        value={editingToken.y / gridSize}
                        onChange={(e) =>
                          setEditingToken({
                            ...editingToken,
                            y: Number(e.target.value) * gridSize,
                          })
                        }
                        placeholder="Posição Y"
                      />
                      <button onClick={handleSaveToken}>Salvar</button>
                      <button onClick={() => setShowEditTokenPopup(false)}>Cancelar</button>
                    </div>
                  </div>
                )}
                <button className="load-another-button" onClick={() => setMapLoaded(false)}>Carregar novo mapa</button>
            </div>
            
          </>
        ) : (
          <div className="load-map">
            <h1>Mapa de Batalha</h1>
            <h3>Carregue seu Mapa de Batalha!</h3>
            <input className="load-map-button" type="file" accept='image/*' onChange={handleImageUpload} />
          </div>
        )}
      </div>
    </div>
  );
};

export default BattleMap;
