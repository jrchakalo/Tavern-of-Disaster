import React, { useState } from 'react';
import api from '../api';
import './RequestResetPassword.css';
import { useNavigate } from 'react-router-dom';

const RequestResetPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const response = await api.post('/password/request-password-reset', { email });
      if (response.status === 200) {
        setSuccess('Um e-mail de recuperação foi enviado para o endereço fornecido. Você será redirecionado para tela de login.');
        setEmail(''); // Limpa o campo de e-mail
        setTimeout(() => {
            navigate('/login');
          }, 3000);
      } else {
        setError('Erro ao tentar enviar o e-mail de recuperação. Tente novamente.');
      }
    } catch (err) {
      console.error(err);
      setError('E-mail não encontrado ou erro no servidor. Verifique e tente novamente.');
    }
  };

  return (
    <div className="request-reset-password-container">
      <h2>Recuperar Senha</h2>
      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}
      {!success && (
        <form onSubmit={handleSubmit}>
          <div className="email-container">
            <label>Digite seu e-mail:</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <button type="submit">Enviar e-mail de recuperação</button>
          {/* Adicione um link para a página de login em formato de botão*/}
            <a href="/login" className="login-link">Voltar para o login</a>
        </form>
      )}
    </div>
  );
};

export default RequestResetPassword;