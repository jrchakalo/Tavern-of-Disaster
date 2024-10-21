import './global.css';
import { Route, Routes } from 'react-router-dom';
import './App.css'
import Dice from './pages/Dice.tsx'
import Login from './pages/Login.tsx'
import Signup from './pages/Signup.tsx'
import MyTables from './pages/MyTables.tsx'
import Table from './pages/Table.tsx'
import ProtectedRoute from './components/ProtectedRoute.tsx';
import ResetPassword from './pages/ResetPassword.tsx';
import RequestResetPassword from './pages/RequestResetPassword.tsx';
import Home from './pages/Home.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import BattleMap from './pages/BattleMap.tsx';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/home" element={<Home />} />
        <Route path="/dice" element={<Dice />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route
              path="/my-tables"
              element={
                <ProtectedRoute>
                  <MyTables />
                </ProtectedRoute>
              }
            />
        <Route path="/:tableCode" element={<Table />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
        <Route path="/request-reset-password" element={<RequestResetPassword />} />
        <Route path="/battle-map" element={<BattleMap />} />
      </Routes>
    </AuthProvider>
  );
}

export default App
