import './global.css';
import { Route, Routes } from 'react-router-dom';
import './App.css'
import Dice from './pages/Dice.tsx'
import Login from './pages/Login.tsx'
import Signup from './pages/Signup.tsx'
import Table from './pages/Table.tsx'
import ProtectedRoute from './components/ProtectedRoute.tsx';
import ResetPassword from './pages/ResetPassword.tsx';
import Home from './pages/Home.tsx';
import { AuthProvider } from './context/AuthContext.tsx';

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
                  <Table />
                </ProtectedRoute>
              }
            />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
      </Routes>
    </AuthProvider>
  );
}

export default App
