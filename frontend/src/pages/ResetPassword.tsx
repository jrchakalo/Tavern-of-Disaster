import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';

const ResetPassword: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    try {
      const response = await api.post(`/users/reset-password/${token}`, { newPassword: password });
      if (response.status === 200) {
        setSuccess('Senha alterada com sucesso. Você será redirecionado para o login.');
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      } else {
        setError('Houve um erro ao redefinir sua senha. Tente novamente.');
      }
    } catch (err) {
      console.error(err);
      setError('Token inválido ou expirado. Tente solicitar a recuperação de senha novamente.');
    }
  };

  return (
    <div>
      <h2>Redefinir Senha</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {success && <p style={{ color: 'green' }}>{success}</p>}
      {!success && (
        <form onSubmit={handleSubmit}>
          <div>
            <label>Nova Senha:</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label>Confirmar Nova Senha:</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit">Redefinir Senha</button>
        </form>
      )}
    </div>
  );
};

export default ResetPassword;