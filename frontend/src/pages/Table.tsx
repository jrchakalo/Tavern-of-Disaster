/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import api from '../api';
import './Table.css';
import Header from '../components/Header';

const Tables = () => {
  const [tableName, setTableName] = useState('');
  const [tables, setTables] = useState<{ id: number; name: string; description: string; code: string; role: string }[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
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
      setTables([...tables, { id: newTable.id, name: newTable.name, description: newTable.description, code: newTable.code, role: 'DM' }]);
      setTableName('');
      setDescription('');
      setShowCreatePopup(false);
      setSuccess('Mesa criada com sucesso.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error(err);
      setError('Erro ao criar a mesa');
      setTimeout(() => setError(''), 3000);
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
      setSuccess('Você entrou na mesa com sucesso.');
      setShowJoinPopup(false);
      //carrega as mesas novamente
      const response = await api.get('/table/getTables', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTables(response.data);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Erro:', (err as any).response ? (err as any).response.data : (err as any).message);
      setError((err as any).response ? (err as any).response.data.message : 'Erro ao cadastrar.');
      setShowJoinPopup(false);
      setTimeout(() => setError(''), 3000);
    }
  };

  const closeTable = async (tableId: number) => {
    //pergunta se o usuário tem certeza que deseja fechar a mesa
    if (!window.confirm('Tem certeza que deseja fechar essa mesa?')) return;
    try {
      const token = localStorage.getItem('token');
      await api.post(
        '/table/closeTable',
        { tableId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTables(tables.filter((table) => table.id !== tableId));
      setSuccess('Mesa fechada com sucesso.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error(err);
      setError('Erro ao fechar a mesa');
      setTimeout(() => setError(''), 3000);
    }
  };

  const leaveTable = async (tableId: number) => {
    //pergunta se o usuário tem certeza que deseja sair da mesa
    if (!window.confirm('Tem certeza que deseja sair dessa mesa?')) return;
    try {
      const token = localStorage.getItem('token');
      await api.post(
        '/table/leave',
        { tableId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTables(tables.filter((table) => table.id !== tableId));
      setSuccess('Você saiu da mesa com sucesso.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error(err);
      setError('Erro ao sair da mesa');
      setTimeout(() => setError(''), 3000);
    }
  }
  
  return (
    <div className="table-page">
      <Header />
      <div className="tables-container">
        <h1>Suas Mesas</h1>
        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}
        {tables.length === 0 ? (
          <p>Você ainda não faz parte de nenhuma mesa</p>
        ) : (
          <div className="tables-list">
            <ul>
              {tables.map((table, index) => (
                <li key={index}>
                  <span className="table-name">{table.name}</span>
                  <span className="table-role"> Papel: ({table.role})</span>
                  <span className = "table-description">
                      Descrição {table.description}
                  </span>
                  {table.role === 'DM' && (
                    <span className="table-code">
                      Código: {table.code} <button onClick={() => navigator.clipboard.writeText(table.code)}>📋</button>
                    </span>
                  )}
                  {table.role === 'DM' && (
                    <span className="table-delete">
                      Exclua <button onClick={() => closeTable(table.id)}>🗑️</button>
                    </span>
                  )}
                  {table.role === 'PLAYER' && (
                    <span className="table-leave">
                      <button onClick={() => leaveTable(table.id)}>Sair</button>
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
    </div>
  );
};

export default Tables;