/* eslint-disable @typescript-eslint/no-explicit-any */
import { useParams, useNavigate } from 'react-router-dom'; // Adicionar useNavigate para navegação
import { useEffect, useState } from 'react';
import Header from '../components/Header';
import api from '../api'; // seu arquivo de API
import './Table.css';

const Table = () => {
  const { tableCode } = useParams<{ tableCode: string }>(); // Pega o ID da URL
  const navigate = useNavigate();
  const [table, setTable] = useState<any>(null);
  const [error, setError] = useState('');
  const [hasCharacterSheet, setHasCharacterSheet] = useState(false); // Novo estado para verificar se há uma ficha

  useEffect(() => {
    const fetchTableDetails = async () => {
      const token = localStorage.getItem('token');
      const response = await api.get(`/table/${tableCode}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTable(response.data);
      
      const existe = await api.get(`players/get-sheet/${tableCode}`, {
        headers: {
          Authorization: `Bearer ${token}`
        },
      });

        if(existe.data){
          setHasCharacterSheet(true);
        }
    };

    fetchTableDetails();
  }, [tableCode]);

  const handleCreateCharacterSheet = () => {
    // Vai para a página de criação de ficha
    navigate(`/${tableCode}/create-sheet`);
  };

  const handleAccessCharacterSheet = async () => {
    // Acessa a ficha do jogador
      const token = localStorage.getItem('token');
      const response = await api.get(`players/get-sheet/${tableCode}`, {
        headers: {
          Authorization: `Bearer ${token}`
        },
      });

      if(response.data){
      // Se a ficha existir, vai para a página de visualização
        navigate(`/${tableCode}/sheet/${response.data.id}`);
      }else{
        setError('Ficha não encontrada.');
      }
  };

  const handleUpdateCharacterSheet = async () => {
    // Vai para a página de atualização de ficha
    
    const token = localStorage.getItem('token');
    const response = await api.get(`players/get-sheet/${tableCode}`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
    });

    if(response.data){
      navigate(`/${tableCode}/update-sheet/${response.data.id}`);
    }else{
      setError('Ficha não encontrada.');
    }
  };

  if (error) return <p>{error}</p>;

  if (!table) return <p>Carregando...</p>;

  return (
    <div className='playtable'>
      <Header />
      <h1>{table.name}</h1>

      {table.isDm ? (
        <div>
          <p><strong>Código da Mesa:</strong> {table.code}</p>
          <h2>Jogadores</h2>
          {table.players.length > 0 ? (
            <ul>
              {table.players.map((player: any) => (
                <li key={player.id}>
                  {player.name} - <strong>{player.role}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhum jogador na mesa ainda.</p>
          )}
        </div>
      ) : (
        <div>
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

      {/* Exibe os botões apenas se o jogador não for o DM */}
      {!table.isDm && (
        <>
          {/* Exibe o botão de "Acessar Ficha" se o jogador tiver uma ficha */}
          {hasCharacterSheet ? (
            <>
              <button onClick={handleAccessCharacterSheet}>Acessar Ficha</button>
              <button onClick={handleUpdateCharacterSheet}>Atualizar Ficha</button>
            </>
          ) : (
            <>
              <button onClick={handleCreateCharacterSheet}>Criar Ficha</button>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default Table;