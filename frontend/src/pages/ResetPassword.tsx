import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import api from '../api';
import './ResetPassword.css';

const ResetPassword: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    try {
      const response = await api.post(`/password/reset-password/${token}`, { newPassword: password });
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
    <div className="reset-password-container">
      <h2>Redefinir Senha</h2>
      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}
      {!success && (
        <form onSubmit={handleSubmit}>
          <div className="password-container">
            <label>Nova Senha:</label>
            <div className="input-with-icon">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="eye-button"
                onClick={() => setShowPassword(!showPassword)}
              >
                <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
              </button>
            </div>
          </div>
          <div className="password-container">
            <label>Confirmar Nova Senha:</label>
            <div className="input-with-icon">
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="eye-button"
                onClick={() => setShowPassword(!showPassword)}
              >
                <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
              </button>
            </div>
          </div>
          <button type="submit">Redefinir Senha</button>
        </form>
      )}
    </div>
  );
};

export default ResetPassword;