import { useState, useEffect } from 'react';
import api from '../api';
import './Table.css';

const Tables = () => {
  const [tableName, setTableName] = useState('');
  const [tables, setTables] = useState<{ id: number; name: string; code: string; role: string }[]>([]);
  const [error, setError] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [showJoinPopup, setShowJoinPopup] = useState(false);
  const [showCreatePopup, setShowCreatePopup] = useState(false);
  const [description, setDescription] = useState('');

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
        { name: tableName, description },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const newTable = response.data;
      setTables([...tables, { id: newTable.id, name: newTable.name, code: newTable.code, role: 'DM' }]);
      setTableName('');
      setDescription('');
      setShowCreatePopup(false);
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
      setShowJoinPopup(false);
    } catch (err) {
      console.error(err);
      setError('Erro ao entrar na mesa');
    }
  };
  

  return (
    <div className="tables-container">
      <h1>Suas Mesas</h1>
      {error && <p className="error">{error}</p>}
      {tables.length === 0 ? (
        <p>Você ainda não faz parte de nenhuma mesa</p>
      ) : (
        <div className="tables-list">
          <ul>
            {tables.map((table, index) => (
              <li key={index}>
                {table.name}
                <span className="table-role"> ({table.role})</span>
                {table.role === 'DM' && (
                  <span className="table-code">
                    Código: {table.code} <button onClick={() => navigator.clipboard.writeText(table.code)}>Copiar</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button onClick={() => setShowCreatePopup(true)}>Criar Mesa</button>
      <button onClick={() => setShowJoinPopup(true)}>Entrar em uma Mesa</button>

      {showJoinPopup && (
        <div className="popup">
          <div className="popup-content">
            <button className="close-popup" onClick={() => setShowJoinPopup(false)}>X</button> {/* Botão "X" */}
            <h2>Digite o código da mesa</h2>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
            />
            <button onClick={joinTable}>Entrar na Mesa</button>
            <button onClick={() => setShowJoinPopup(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {showCreatePopup && (
        <div className="popup">
          <div className="popup-content">
            <button className="close-popup" onClick={() => setShowCreatePopup(false)}>✕</button> {/* Botão "X" */}
            <h2>Criar Nova Mesa</h2>
            <input
              type="text"
              placeholder="Nome da mesa"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
            />
            <input
              type="text"
              placeholder="Descrição"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <button onClick={createTable}>Criar Mesa</button>
            <button onClick={() => setShowCreatePopup(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tables;