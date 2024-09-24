import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';  // Importando o contexto de autenticação
import './Home.css';  // Arquivo CSS
import logo from "../assets/logo/logotof.png"

const Home: React.FC = () => {
  const { token, logout } = useContext(AuthContext);  // Usando o token e a função de logout do contexto
  const isLoggedIn = !!token;  // Verifica se o usuário está logado

  return (
    <div className="home-container">
      <header className="header">
        <div className="site-name">
          <Link to="/">
            <img src={logo} className="site-logo" />
          </Link>
          Tavern of Disaster
        </div>
        <nav className="nav-links">
          {isLoggedIn ? (
            <>
              <Link to="/profile">Perfil</Link>
              <Link to="/my-tables">Minhas Mesas</Link>
              <Link to="/dice">Dado</Link>
              <a href="/" onClick={logout} className="logout-link">Logout</a>  {/* Logout como link */}
            </>
          ) : (
            <>
              <Link to="/signup">Cadastre-se</Link>
              <Link to="/login">Entre</Link>
              <Link to="/dice">Dado</Link>
            </>
          )}
        </nav>
      </header>

      <div className="nav-container">
        <main className="content">
          <h1>Bem-vindo à Tavern of Disaster</h1>
          <p>Aqui, você encontrará mesas de RPG, aventuras épicas e muito mais. Conecte-se e comece suas aventuras!</p>
        </main>
      </div>
      
      <footer className="footer">
        <p>© 2024 Tavern of Disaster. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
};

export default Home;