/* eslint-disable @typescript-eslint/no-explicit-any */
import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import api from '../api'; // seu arquivo de API

// Função para gerar cores aleatórias
const randomColor = () => '#' + Math.floor(Math.random() * 16777215).toString(16);

const TableDetails = () => {
  const { tableCode } = useParams<{ tableCode: string }>(); // Pega o código da mesa da URL
  const [table, setTable] = useState<any>(null);
  const [error, setError] = useState('');

  // Estado para a interatividade dos botões
  const [buttonColors, setButtonColors] = useState([randomColor(), randomColor()]);
  const [activeButton, setActiveButton] = useState<number>(0); // Começa pelo botão 1
  const [turnEnded, setTurnEnded] = useState(false);
  const [buttonAssignments, setButtonAssignments] = useState<{ [key: number]: string | null }>({
    0: null, // Nenhum jogador atribuído ao botão 1
    1: null, // Nenhum jogador atribuído ao botão 2
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
  }, [tableCode]);

  // Função para mudar a cor de um botão
  const changeButtonColor = (index: number) => {
    const newColors = [...buttonColors];
    newColors[index] = randomColor(); // Gera uma nova cor aleatória
    setButtonColors(newColors);
  };

  // Função para encerrar o turno
  const endTurn = () => {
    setActiveButton((prev) => (prev === 0 ? 1 : 0)); // Alterna entre os botões
    setTurnEnded(false);   // Reinicia o estado do turno
  };

  // Função para determinar o botão para um jogador (apenas DM)
  const assignButtonToPlayer = (buttonIndex: number, player: string) => {
    if (table.isDm) {
      setButtonAssignments((prev) => ({ ...prev, [buttonIndex]: player }));
    }
  };

  // Função para remover o botão de um jogador (apenas DM)
  const removeButtonFromPlayer = (buttonIndex: number) => {
    if (table.isDm) {
      setButtonAssignments((prev) => ({ ...prev, [buttonIndex]: null }));
    }
  };

  // Verifica se o jogador pode clicar no botão
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

      {/* Exibe informações diferentes para o DM */}
      {table.isDm ? (
        <div>
          <p><strong>Código da Mesa:</strong> {table.code}</p>
          <h2>Jogadores</h2>
          {table.players.length > 0 ? (
            <ul>
              {table.players
                .filter((player: any) => player.role !== 'DM')
                .map((player: any) => (
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

      {/* Interatividade dos botões */}
      <h2>Interatividade dos Botões</h2>
      <div>
        {buttonColors.map((color, index) => (
          <button
            key={index}
            style={{ backgroundColor: color, padding: '20px', margin: '10px' }}
            onClick={() => {
              if (canClickButton(index) && activeButton === index) {
                changeButtonColor(index);
                setTurnEnded(true); // Indica que o turno foi encerrado após uma troca
              }
            }}
            disabled={turnEnded && activeButton !== index} // Desabilita botões se o turno foi encerrado e não é o botão ativo
          >
            Botão {index + 1}
          </button>
        ))}
      </div>

      {/* Botão para encerrar o turno */}
      {turnEnded && (
        <button onClick={endTurn}>Encerrar Turno</button>
      )}
    </div>
  );
};

export default TableDetails;