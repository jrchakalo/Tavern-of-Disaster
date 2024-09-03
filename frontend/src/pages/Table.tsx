import { useState, useEffect } from 'react';
import api from '../api';
import './Table.css';

const Tables = () => {
  const [tableName, setTableName] = useState('');
  const [tables, setTables] = useState<{ name: string; code: string }[]>([]);
  const [error, setError] = useState('');
  const [joinCode, setJoinCode] = useState('');

  useEffect(() => {
    const fetchTables = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await api.get('/table/getTables', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setTables(response.data);
      } catch (err) {
        console.error(err);
        setError('Erro ao carregar as mesas');
      }
    };

    fetchTables();
  }, []);

  const createTable = async () => {
    if (!tableName) return;

    try {
      const token = localStorage.getItem('token');
      const response = await api.post(
        '/table/create',
        { name: tableName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTableName('');
      setTables([...tables, response.data]); // Adiciona a nova mesa com código
    } catch (err) {
      console.error(err);
      setError('Erro ao criar a mesa');
    }
  };

  const joinTable = async () => {
    if (!joinCode) return;

    try {
      const token = localStorage.getItem('token');
      await api.post(
        '/table/join',
        { code: joinCode },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setJoinCode('');
      setError('Você entrou na mesa com sucesso.');
      // Opcionalmente, atualize a lista de mesas para refletir a nova mesa adicionada
      // const response = await api.get('/table/getTables', { headers: { Authorization: `Bearer ${token}` } });
      // setTables(response.data);
    } catch (err) {
      console.error(err);
      setError('Erro ao entrar na mesa');
    }
  };

  return (
    <div className="tables-container">
      <h1>Gerenciamento de Mesas</h1>
      {error && <p className="error">{error}</p>}
      <div className="input-group">
        <label htmlFor="table-name">Nome da Mesa:</label>
        <input
          type="text"
          id="table-name"
          value={tableName}
          onChange={(e) => setTableName(e.target.value)}
        />
      </div>
      <button onClick={createTable}>Criar Mesa</button>
      <div className="tables-list">
        <h2>Mesas Criadas</h2>
        <ul>
          {tables.map((table, index) => (
            <li key={index}>
              {table.name} <span className="table-code">Código: {table.code}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="join-table">
        <h2>Entrar em uma Mesa</h2>
        <div className="input-group">
          <label htmlFor="join-code">Código da Mesa:</label>
          <input
            type="text"
            id="join-code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
          />
        </div>
        <button onClick={joinTable}>Entrar na Mesa</button>
      </div>
    </div>
  );
};

export default Tables;
