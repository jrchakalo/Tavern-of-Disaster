import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './global.css';
import { Route, Routes } from 'react-router-dom';
import './App.css'
import Dice from './pages/Dice.tsx'
import Login from './pages/Login.tsx'
import Signup from './pages/Signup.tsx'
import Table from './pages/Table.tsx'
import ProtectedRoute from './ProtectedRoute';

function App() {
  const [count, setCount] = useState(0)

  return (
    <Routes>
      <Route path="/" element={
        <>
          <div>
            <a href="https://vitejs.dev" target="_blank">
              <img src={viteLogo} className="logo" alt="Vite logo" />
            </a>
            <a href="https://react.dev" target="_blank">
              <img src={reactLogo} className="logo react" alt="React logo" />
            </a>
          </div>
          <h1>Vite + React</h1>
          <div className="card">
            <button onClick={() => setCount((count) => count + 1)}>
              count is {count}
            </button>
            <p>
              Edit <code>src/App.tsx</code> and save to test HMR
            </p>
          </div>
          <p className="read-the-docs">
            Click on the Vite and React logos to learn more
          </p>
        </>
      } 
    />
    <Route path="/dice" element={<Dice />} />
    <Route path="/login" element={<Login />} />
    <Route path="/signup" element={<Signup />} />
    <Route
          path="/table"
          element={
            <ProtectedRoute>
              <Table />
            </ProtectedRoute>
          }
        />
  </Routes>
  );
}

export default App
