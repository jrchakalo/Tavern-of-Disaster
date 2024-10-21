/* eslint-disable @typescript-eslint/no-explicit-any */
import { useParams } from 'react-router-dom'; // Adicionar useNavigate para navegação
import { useEffect, useState } from 'react';
import Header from '../components/Header';
import api from '../api'; // seu arquivo de API
import './Table.css';

const Table = () => {
  const { tableCode } = useParams<{ tableCode: string }>(); // Pega o ID da URL
  const [table, setTable] = useState<any>(null);
  const [error, setError] = useState('');
  const [hasCharacterSheet, setHasCharacterSheet] = useState(false); // Novo estado para verificar se há uma ficha

  useEffect(() => {
    const fetchTableDetails = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await api.get(`/table/${tableCode}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setTable(response.data);
        
        const existe = await api.get(`players/get-sheet/${tableCode}`, {
          headers: {
            Authorization: `Bearer ${token}`
          },
          responseType: 'blob', // Para tratar a resposta como um binário (blob)
        });
  
        // Criar um URL para o arquivo PDF
        const fileURL = window.URL.createObjectURL(new Blob([existe.data]));

        if(fileURL){
          setHasCharacterSheet(true);
        }
      } catch (err) {
        console.error('Erro:', (err as any).response ? (err as any).response.data : (err as any).message);
        setError((err as any).response ? (err as any).response.data.message : 'Erro ao carregar a mesa.');
      }
    };

    fetchTableDetails();
  }, [tableCode]);

  const handleCreateCharacterSheet = () => {
    window.open('/assets/fichabase/fichabase.pdf', '_blank');
  };

  const handleUploadCharacterSheet = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const token = localStorage.getItem('token');
        await api.post(`/players/save-sheet/${tableCode}`, formData, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        });

        // Sucesso - atualizar estado
        setHasCharacterSheet(true);
      } catch (err) {
        console.error('Erro ao carregar ficha:', err);
        setError('Erro ao carregar ficha.');
      }
    }
  };

  const handleAccessCharacterSheet = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get(`players/get-sheet/${tableCode}`, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        responseType: 'blob', // Para tratar a resposta como um binário (blob)
      });

      // Criar um URL para o arquivo PDF
      const fileURL = window.URL.createObjectURL(new Blob([response.data]));
      window.open(fileURL);
    } catch (err) {
      console.error('Erro ao acessar ficha:', err);
      setError('Erro ao acessar ficha.');
    }
  };

  const handleUpdateCharacterSheet = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleUploadCharacterSheet(event); // Reutiliza a função de upload
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
              <label className='file-upload'>
                Atualizar Ficha
                <input type="file" onChange={handleUpdateCharacterSheet} /> {/* Input para carregar ficha */}
              </label>
            </>
          ) : (
            <>
              <button onClick={handleCreateCharacterSheet}>Criar Ficha</button>
              <label className='file-upload'>
                Atualizar Ficha
                <input type="file" onChange={handleUploadCharacterSheet} /> {/* Input para carregar ficha */}
              </label>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default Table;