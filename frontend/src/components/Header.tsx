import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import logo from "/assets/logo/logotof.png";
import './Header.css'; // Você pode mover o estilo do header para um arquivo separado

const Header: React.FC = () => {
  const { token, logout } = useContext(AuthContext);
  const isLoggedIn = !!token;

  return (
    <header className="header">
      <div className="site-name">
        <Link to="/">
          <img src={logo} className="site-logo" alt="Logo" />
        </Link>
        Tavern of Disaster
      </div>
      {/*verifica se esta na página inicial para adicionar os links, se não estiver não adiciona nada*/}
        {window.location.pathname === '/' ? (
            <nav className="nav-links">
                {isLoggedIn ? (
                <>
                    <Link to="/profile">Perfil</Link>
                    <Link to="/my-tables">Minhas Mesas</Link>
                    <Link to="/dice">Dado</Link>
                    <a href="/" onClick={logout} className="logout-link">Logout</a>
                </>
                ) : (
                <>

                    {/*<Link to="/signup">Cadastre-se</Link>
                    <Link to="/login">Entre</Link>*/}
                    <Link to="/battle-map">Mapa de Batalha</Link>
                    <Link to="/dice">Dado</Link>
                </>
                )}
            </nav>
            ) : (
            <>
            </>
        )}    
    </header>
  );
};

export default Header;