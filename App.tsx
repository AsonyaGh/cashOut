
import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { auth, ensureUserProfile } from './store/database';
import { onAuthStateChanged, User } from "firebase/auth";
import { Home } from './views/Home';
import { AdminDashboard } from './views/AdminDashboard';
import { Login } from './views/Login';

const ProtectedRoute = ({ children }: React.PropsWithChildren) => {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const profile = await ensureUserProfile(u.uid, u.email);
          setIsActive(profile.active);
        } catch {
          setIsActive(false);
        }
      } else {
        setIsActive(false);
      }
      setLoading(false);
    });
  }, []);

  if (loading) return null;
  if (!user || !isActive) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const App = () => {
  return (
    <Router>
      <div className="relative min-h-screen">
        <div className="fixed bottom-4 right-4 z-50 opacity-10 hover:opacity-100 transition-opacity">
          <Link to="/login" className="bg-slate-800 text-white p-2 rounded text-[8px] uppercase font-bold tracking-widest">
            Admin Panel
          </Link>
        </div>

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route 
            path="/admin" 
            element={
              <ProtectedRoute>
                <AdminDashboard />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
