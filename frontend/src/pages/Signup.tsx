import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import './Signup.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';

const Signup = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !email || !password || !confirmPassword) {
      setError('Preencha todos os campos');
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres');
      return;
    }

    if (password !== confirmPassword) {
      setError('Senhas não conferem');
      return;
    }

    try {
      await api.post('/auth/register', { username, email, password });
      alert('Cadastro realizado com sucesso! Você será redirecionado para a página de login.');
      navigate('/login');
    } catch (err) {
      console.error(err);
      setError('Erro ao cadastrar. Tente novamente.');
    }
  };

  return (
    <div className="signup-container">
      <h2>Cadastro</h2>
      <form onSubmit={handleSignup}>
        {error && <p className="error">{error}</p>}
        <div>
          <label htmlFor="username">Nome de Usuário:</label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="email">Email:</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="password-container">
          <label htmlFor="password">Senha:</label>
          <div className="input-with-icon">
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="button" className="eye-button" onClick={() => setShowPassword(!showPassword)}>
              <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
            </button>
          </div>
        </div>
        <div className="password-container">
          <label htmlFor="confirmPassword">Confirme a Senha:</label>
          <div className="input-with-icon">
            <input
              type={showPassword ? 'text' : 'password'}
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            <button type="button" className="eye-button" onClick={() => setShowPassword(!showPassword)}>
              <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
            </button>
          </div>
        </div>
        <button type="submit">Cadastrar</button>
      </form>
    </div>
  );
};

export default Signup;
