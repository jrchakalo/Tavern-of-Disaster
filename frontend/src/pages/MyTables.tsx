/* eslint-disable @typescript-eslint/no-explicit-any */
import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import io from 'socket.io-client';
import api from '../api'; // seu arquivo de API

const socket = io('http://localhost:5000'); // Altere para a URL do seu servidor

const randomColor = () => '#' + Math.floor(Math.random() * 16777215).toString(16);

const TableDetails = () => {
  const { tableCode } = useParams<{ tableCode: string }>();
  const [table, setTable] = useState<any>(null);
  const [error, setError] = useState('');

  const [buttonColors, setButtonColors] = useState([randomColor(), randomColor()]);
  const [activeButton, setActiveButton] = useState<number>(0);
  const [turnEnded, setTurnEnded] = useState(false);
  const [buttonAssignments, setButtonAssignments] = useState<{ [key: number]: string | null }>({
    0: null,
    1: null,
  });

  useEffect(() => {
    const fetchTableDetails = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await api.get(`/table/${tableCode}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setTable(response.data);
      } catch (err) {
        console.error('Erro:', (err as any).response ? (err as any).response.data : (err as any).message);
        setError((err as any).response ? (err as any).response.data.message : 'Erro ao carregar os detalhes da mesa.');
      }
    };

    fetchTableDetails();

    // Ouvir eventos de mudança de cor
    socket.on('colorChanged', ({ index, color }) => {
      setButtonColors((prevColors) => {
        const newColors = [...prevColors];
        newColors[index] = color;
        return newColors;
      });
    });

    // Ouvir eventos de mudança de turno
    socket.on('turnEnded', ({ newActiveButton }) => {
      setActiveButton(newActiveButton);
      setTurnEnded(false);
    });

    // Ouvir eventos de atribuição de botão
    socket.on('buttonAssigned', ({ buttonIndex, player }) => {
      setButtonAssignments((prev) => ({ ...prev, [buttonIndex]: player }));
    });

    // Ouvir eventos de remoção de botão
    socket.on('buttonRemoved', ({ buttonIndex }) => {
      setButtonAssignments((prev) => ({ ...prev, [buttonIndex]: null }));
    });

    return () => {
      // Limpar os eventos do socket quando o componente for desmontado
      socket.off('colorChanged');
      socket.off('turnEnded');
      socket.off('buttonAssigned');
      socket.off('buttonRemoved');
    };
  }, [tableCode]);

  const changeButtonColor = (index: number) => {
    const newColor = randomColor();
    setButtonColors((prevColors) => {
      const newColors = [...prevColors];
      newColors[index] = newColor;
      return newColors;
    });

    // Enviar a mudança de cor para o servidor
    socket.emit('changeColor', { index, color: newColor });
  };

  const endTurn = () => {
    const newActiveButton = activeButton === 0 ? 1 : 0;
    setActiveButton(newActiveButton);
    setTurnEnded(false);

    // Enviar o novo turno para o servidor
    socket.emit('endTurn', { newActiveButton });
  };

  const assignButtonToPlayer = (buttonIndex: number, player: string) => {
    if (table.isDm) {
      setButtonAssignments((prev) => ({ ...prev, [buttonIndex]: player }));

      // Enviar a atribuição para o servidor
      socket.emit('assignButton', { buttonIndex, player });
    }
  };

  const removeButtonFromPlayer = (buttonIndex: number) => {
    if (table.isDm) {
      setButtonAssignments((prev) => ({ ...prev, [buttonIndex]: null }));

      // Enviar a remoção para o servidor
      socket.emit('removeButton', { buttonIndex });
    }
  };

  const canClickButton = (index: number) => {
    if (table.isDm) return true; // DM sempre pode clicar
    const assignedPlayer = buttonAssignments[index];
    const currentUser = 'currentUser'; // Aqui você colocaria o nome do jogador logado
    return assignedPlayer === currentUser; // Apenas o jogador nomeado pode clicar
  };

  if (error) return <p>{error}</p>;

  if (!table) return <p>Carregando...</p>;

  return (
    <div>
      <h1>{table.name}</h1>
      <p><strong>Descrição:</strong> {table.description}</p>
      <p><strong>Status:</strong> {table.status}</p>

      {table.isDm ? (
        <div>
          <p><strong>Código da Mesa:</strong> {table.code}</p>
          <h2>Jogadores</h2>
          {table.players.length > 0 ? (
            <ul>
              {table.players.map((player: any) => (
                <li key={player.id}>
                  {player.name} - <strong>{player.role}</strong>
                  {buttonAssignments[0] === player.name ? (
                    <span> (Botão 1)</span>
                  ) : buttonAssignments[1] === player.name ? (
                    <span> (Botão 2)</span>
                  ) : (
                    <>
                      <button onClick={() => assignButtonToPlayer(0, player.name)}>Atribuir ao Botão 1</button>
                      <button onClick={() => assignButtonToPlayer(1, player.name)}>Atribuir ao Botão 2</button>
                    </>
                  )}
                  {buttonAssignments[0] === player.name && (
                    <button onClick={() => removeButtonFromPlayer(0)}>Remover botão de "{player.name}"</button>
                  )}
                  {buttonAssignments[1] === player.name && (
                    <button onClick={() => removeButtonFromPlayer(1)}>Remover botão de "{player.name}"</button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhum jogador na mesa ainda.</p>
          )}
        </div>
      ) : (
        <div>
          <p><strong>Você não é o Mestre da Mesa.</strong></p>
          <h2>Jogadores na Mesa</h2>
          {table.players.length > 0 ? (
            <ul>
              {table.players.map((player: any) => (
                <li key={player.id}>
                  {player.name}
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhum jogador na mesa ainda.</p>
          )}
        </div>
      )}

      <h2>Interatividade dos Botões</h2>
      <div>
        {buttonColors.map((color, index) => (
          <button
            key={index}
            style={{ backgroundColor: color, padding: '20px', margin: '10px' }}
            onClick={() => {
              if (canClickButton(index) && activeButton === index) {
                changeButtonColor(index);
                setTurnEnded(true);
              }
            }}
            disabled={turnEnded && activeButton !== index}
          >
            Botão {index + 1}
          </button>
        ))}
      </div>

      {turnEnded && (
        <button onClick={endTurn}>Encerrar Turno</button>
      )}
    </div>
  );
};

export default TableDetails;