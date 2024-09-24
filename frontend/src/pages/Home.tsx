import React from 'react';
import Header from '../components/Header';
import './Home.css';

const Home: React.FC = () => {
  return (
    <div className="home-container">
      <Header />
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