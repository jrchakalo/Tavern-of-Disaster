/* eslint-disable @typescript-eslint/no-explicit-any */
import { useParams, useNavigate } from 'react-router-dom'; // Adicionar useNavigate para navegação
import { useEffect, useState } from 'react';
import Header from '../components/Header';
import api from '../api'; // seu arquivo de API
import './Table.css';

const Table = () => {
  const { tableCode } = useParams<{ tableCode: string }>(); // Pega o ID da URL
  const [table, setTable] = useState<any>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate(); // Hook para navegação

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
        setError((err as any).response ? (err as any).response.data.message : 'Erro ao cadastrar.');
      }
    };

    fetchTableDetails();
  }, [tableCode]);

  const handleCreateCharacterSheet = () => {
    navigate(`/table/${tableCode}/create-sheet`); // Navega para a página de criação da ficha
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
      <button onClick={handleCreateCharacterSheet}>Criar Ficha</button> {/* Botão para criar ficha */}
    </div>
  );
};

export default Table;
