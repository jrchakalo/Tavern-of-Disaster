/* eslint-disable @typescript-eslint/no-explicit-any */
import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import api from '../api'; // seu arquivo de API

const TableDetails = () => {
  const { tableCode } = useParams<{ tableCode: string }>(); // Pega o ID da URL
  const [table, setTable] = useState<any>(null);
  const [error, setError] = useState('');

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
    </div>
  );
};

export default TableDetails;