import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, ensureUserProfile, logAudit } from '../store/database';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const profile = await ensureUserProfile(cred.user.uid, cred.user.email);

      if (!profile.active) {
        await signOut(auth);
        setError('Your account is inactive. Contact an administrator.');
        return;
      }

      await logAudit('ADMIN_LOGIN_SUCCESS', `Admin email ${email} logged in.`);
      navigate('/admin');
    } catch {
      setError('Invalid Cloud Credentials. Please check your email and password.');
      await logAudit('ADMIN_LOGIN_FAILURE', `Attempt for: ${email}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-black text-red-600 italic tracking-tighter uppercase">Home Radio</h2>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em] mt-2">Firebase Cloud Access</p>
        </div>

        <div className="bg-zinc-900 rounded-[2.5rem] border border-zinc-800 p-10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-red-600"></div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-3">Cloud Email</label>
              <input
                type="email"
                required
                className="w-full bg-black border border-zinc-800 rounded-2xl p-4 font-bold text-white outline-none focus:border-red-600"
                placeholder="admin@homeradio.gh"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-3">Admin Password</label>
              <input
                type="password"
                required
                className="w-full bg-black border border-zinc-800 rounded-2xl p-4 font-bold text-white outline-none focus:border-red-600"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <div className="text-red-500 text-xs font-bold text-center">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-5 rounded-2xl transition-all shadow-xl shadow-red-900/20 uppercase tracking-widest text-sm disabled:opacity-50"
            >
              {loading ? "Authorizing..." : "Access Cloud Terminal"}
            </button>
          </form>
        </div>
        <div className="mt-8 text-center">
          <button onClick={() => navigate('/')} className="text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-widest">
            {'<- Return to Public Terminal'}
          </button>
        </div>
      </div>
    </div>
  );
};
