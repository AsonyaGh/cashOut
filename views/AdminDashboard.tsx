import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteDoc, doc, onSnapshot, orderBy, query, setDoc, updateDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { LotteryEngine } from '../lib/lotteryEngine';
import { createAuthUserByAdmin, sendResetLinkToUser } from '../services/adminAuthService';
import { AppUser, AuditLog, Draw, SystemConfig, Ticket, UserRole } from '../types';
import {
  auth,
  configDoc,
  db,
  drawsCol,
  ensureUserProfile,
  logAudit,
  logsCol,
  ticketsCol,
  updateConfig,
  usersCol
} from '../store/database';

type Permission =
  | 'VIEW_DASHBOARD'
  | 'VIEW_DRAWS'
  | 'VIEW_LOGS'
  | 'MANAGE_CONFIG'
  | 'TRIGGER_DRAW'
  | 'VIEW_TICKETS'
  | 'MANAGE_USERS';

type TabKey = 'DASHBOARD' | 'DRAWS' | 'CONFIG' | 'LOGS' | 'USERS';

const permissionMap: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: [
    'VIEW_DASHBOARD',
    'VIEW_DRAWS',
    'VIEW_LOGS',
    'MANAGE_CONFIG',
    'TRIGGER_DRAW',
    'VIEW_TICKETS',
    'MANAGE_USERS'
  ],
  [UserRole.STATION_ADMIN]: ['VIEW_DASHBOARD', 'VIEW_DRAWS', 'MANAGE_CONFIG', 'TRIGGER_DRAW', 'VIEW_TICKETS'],
  [UserRole.FINANCE_OFFICER]: ['VIEW_DASHBOARD', 'VIEW_DRAWS', 'VIEW_LOGS', 'VIEW_TICKETS'],
  [UserRole.OVERSIGHT_OFFICER]: ['VIEW_DRAWS', 'VIEW_LOGS', 'VIEW_TICKETS']
};

const roleOptions = [
  UserRole.ADMIN,
  UserRole.STATION_ADMIN,
  UserRole.FINANCE_OFFICER,
  UserRole.OVERSIGHT_OFFICER
];

const tabs: { key: TabKey; label: string; permission: Permission }[] = [
  { key: 'DASHBOARD', label: 'Dashboard', permission: 'VIEW_DASHBOARD' },
  { key: 'DRAWS', label: 'Draws', permission: 'VIEW_DRAWS' },
  { key: 'CONFIG', label: 'Config', permission: 'MANAGE_CONFIG' },
  { key: 'LOGS', label: 'Logs', permission: 'VIEW_LOGS' },
  { key: 'USERS', label: 'Users', permission: 'MANAGE_USERS' }
];

export const AdminDashboard = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [draws, setDraws] = useState<Draw[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('DASHBOARD');
  const [isDrawing, setIsDrawing] = useState(false);
  const [feedback, setFeedback] = useState('');

  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>(UserRole.OVERSIGHT_OFFICER);
  const [draftUserChanges, setDraftUserChanges] = useState<Record<string, Partial<AppUser>>>({});

  const hasPermission = (p: Permission) => {
    if (!profile) return false;
    return permissionMap[profile.role]?.includes(p) || false;
  };

  const visibleTabs = useMemo(() => tabs.filter((tab) => hasPermission(tab.permission)), [profile]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    const email = auth.currentUser?.email;
    if (!uid) return;

    let unsubProfile: (() => void) | undefined;
    ensureUserProfile(uid, email).then(() => {
      unsubProfile = onSnapshot(doc(db, "users", uid), (snap) => {
        if (!snap.exists()) return;
        setProfile({ ...(snap.data() as AppUser), uid });
      });
    });

    return () => {
      if (unsubProfile) unsubProfile();
    };
  }, []);

  useEffect(() => {
    if (!profile) return;
    const allowed = visibleTabs.some((tab) => tab.key === activeTab);
    if (!allowed && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0].key);
    }
  }, [profile, visibleTabs, activeTab]);

  useEffect(() => {
    if (!profile) return;
    const unsubscribers: Array<() => void> = [];

    const unsubConfig = onSnapshot(configDoc, (snap) => {
      if (snap.exists()) setConfig(snap.data() as SystemConfig);
    });
    unsubscribers.push(unsubConfig);

    if (hasPermission('VIEW_TICKETS')) {
      const qTickets = query(ticketsCol, orderBy("timestamp", "desc"));
      unsubscribers.push(onSnapshot(qTickets, (snap) => {
        const list: Ticket[] = [];
        snap.forEach((d) => list.push({ ...d.data(), id: d.id } as Ticket));
        setTickets(list.slice(0, 25));
      }));
    }

    if (hasPermission('VIEW_DRAWS')) {
      const qDraws = query(drawsCol, orderBy("completedTime", "desc"));
      unsubscribers.push(onSnapshot(qDraws, (snap) => {
        const list: Draw[] = [];
        snap.forEach((d) => list.push({ ...d.data(), id: d.id } as Draw));
        setDraws(list.slice(0, 15));
      }));
    }

    if (hasPermission('VIEW_LOGS')) {
      const qLogs = query(logsCol, orderBy("timestamp", "desc"));
      unsubscribers.push(onSnapshot(qLogs, (snap) => {
        const list: AuditLog[] = [];
        snap.forEach((d) => list.push({ ...d.data(), id: d.id } as AuditLog));
        setLogs(list.slice(0, 30));
      }));
    }

    if (hasPermission('MANAGE_USERS')) {
      const qUsers = query(usersCol, orderBy("updatedAt", "desc"));
      unsubscribers.push(onSnapshot(qUsers, (snap) => {
        const list: AppUser[] = [];
        snap.forEach((d) => list.push({ ...(d.data() as AppUser), uid: d.id }));
        setUsers(list);
      }));
    }

    return () => {
      unsubscribers.forEach((u) => u());
    };
  }, [profile]);

  const handleLogout = async () => {
    await logAudit('ADMIN_LOGOUT', `${auth.currentUser?.email || 'Unknown'} logged out.`);
    await signOut(auth);
    navigate('/login');
  };

  const handleManualDraw = async () => {
    if (!hasPermission('TRIGGER_DRAW')) return;
    if (!window.confirm("Trigger manual draw now?")) return;

    setIsDrawing(true);
    setFeedback('');
    try {
      await LotteryEngine.executeDraw();
      setFeedback('Manual draw completed successfully.');
      await logAudit('MANUAL_DRAW', `Triggered by ${auth.currentUser?.email}`);
    } catch {
      setFeedback('Manual draw failed. Check logs.');
    } finally {
      setIsDrawing(false);
    }
  };

  const setSystemConfig = async (key: keyof SystemConfig, val: number) => {
    if (!hasPermission('MANAGE_CONFIG')) return;
    await updateConfig({ [key]: val });
    await logAudit('CONFIG_CHANGE', `${key} => ${val}`);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPermission('MANAGE_USERS')) return;

    setFeedback('');
    if (!newUserEmail || newUserPassword.length < 6) {
      setFeedback('User creation requires a valid email and 6+ character password.');
      return;
    }

    try {
      const uid = await createAuthUserByAdmin(newUserEmail, newUserPassword);
      const now = Date.now();

      await setDoc(doc(db, "users", uid), {
        uid,
        email: newUserEmail.trim().toLowerCase(),
        displayName: newUserName.trim() || newUserEmail.split('@')[0],
        role: newUserRole,
        active: true,
        createdAt: now,
        updatedAt: now,
        createdBy: auth.currentUser?.uid || 'SYSTEM'
      });

      await logAudit('USER_CREATED', `Created ${newUserEmail} as ${newUserRole}`);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserName('');
      setNewUserRole(UserRole.OVERSIGHT_OFFICER);
      setFeedback('User created successfully.');
    } catch {
      setFeedback('Failed to create user. Confirm Email/Password provider is enabled.');
    }
  };

  const getDraftUser = (u: AppUser): AppUser => ({ ...u, ...(draftUserChanges[u.uid] || {}) });

  const updateUserDraft = (uid: string, patch: Partial<AppUser>) => {
    setDraftUserChanges((prev) => ({ ...prev, [uid]: { ...(prev[uid] || {}), ...patch } }));
  };

  const handleSaveUser = async (u: AppUser) => {
    if (!hasPermission('MANAGE_USERS')) return;
    const patch = draftUserChanges[u.uid];
    if (!patch) return;

    await updateDoc(doc(db, "users", u.uid), { ...patch, updatedAt: Date.now() });
    await logAudit('USER_UPDATED', `Updated ${u.email}`);
    setDraftUserChanges((prev) => {
      const next = { ...prev };
      delete next[u.uid];
      return next;
    });
    setFeedback(`Saved changes for ${u.email}.`);
  };

  const handleDeactivateUser = async (u: AppUser) => {
    if (!hasPermission('MANAGE_USERS')) return;
    if (u.uid === auth.currentUser?.uid) {
      setFeedback('You cannot deactivate your own account.');
      return;
    }

    await updateDoc(doc(db, "users", u.uid), { active: !u.active, updatedAt: Date.now() });
    await logAudit('USER_STATUS_CHANGED', `${u.email} => ${!u.active ? 'ACTIVE' : 'INACTIVE'}`);
    setFeedback(`${u.email} is now ${!u.active ? 'active' : 'inactive'}.`);
  };

  const handleDeleteUser = async (u: AppUser) => {
    if (!hasPermission('MANAGE_USERS')) return;
    if (u.uid === auth.currentUser?.uid) {
      setFeedback('You cannot delete your own profile.');
      return;
    }

    if (!window.confirm(`Delete ${u.email} profile from Firestore?`)) return;

    await deleteDoc(doc(db, "users", u.uid));
    await logAudit('USER_DELETED', `Deleted profile for ${u.email}`);
    setFeedback(`Deleted profile: ${u.email}`);
  };

  const handleSendReset = async (u: AppUser) => {
    if (!hasPermission('MANAGE_USERS')) return;
    if (!u.email) return;
    try {
      await sendResetLinkToUser(u.email);
      await logAudit('PASSWORD_RESET_LINK_SENT', `Password reset sent to ${u.email}`);
      setFeedback(`Password reset link sent to ${u.email}.`);
    } catch {
      setFeedback(`Could not send reset link for ${u.email}.`);
    }
  };

  const roleLabel = profile?.role.replace(/_/g, ' ') || 'LOADING';
  const totalRevenue = draws.reduce((sum, d) => sum + (d.totalStakes * 0.3), 0);

  if (!profile || !config) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-red-600 font-black animate-pulse uppercase tracking-widest">Synchronizing Cloud Data...</div>;
  }

  return (
    <div className="min-h-screen bg-black text-white flex">
      <aside className="w-72 bg-zinc-950 p-8 flex flex-col border-r border-red-900/30">
        <div className="mb-12">
          <h2 className="text-2xl font-black text-red-600 italic tracking-tighter uppercase">Home Radio</h2>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em]">{roleLabel}</p>
        </div>
        <nav className="space-y-3 flex-1">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`w-full text-left px-6 py-4 rounded-2xl font-black transition-all uppercase text-xs tracking-widest ${activeTab === tab.key ? 'bg-red-600 text-white shadow-lg shadow-red-900/40 translate-x-2' : 'text-zinc-500 hover:text-white hover:bg-zinc-900'}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="space-y-4">
          <div className="p-6 bg-zinc-900/50 rounded-3xl border border-zinc-800">
            <div className="text-[10px] text-zinc-500 uppercase font-black mb-2 tracking-widest">Revenue Estimate</div>
            <div className="text-2xl font-black text-red-500 italic">GHS {totalRevenue.toFixed(2)}</div>
          </div>
          <button onClick={handleLogout} className="w-full py-4 text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-red-500 transition-colors border border-zinc-900 rounded-2xl">Logout Session</button>
        </div>
      </aside>

      <main className="flex-1 p-12 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          {feedback && (
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 text-sm text-zinc-200">{feedback}</div>
          )}

          {activeTab === 'DASHBOARD' && hasPermission('VIEW_DASHBOARD') && (
            <div className="space-y-8">
              <header className="flex justify-between items-end">
                <div>
                  <h1 className="text-4xl font-black tracking-tighter uppercase italic">Control Center</h1>
                  <p className="text-zinc-500 font-bold mt-2">Live Cloud Monitoring & Operations</p>
                </div>
                {hasPermission('TRIGGER_DRAW') && (
                  <button onClick={handleManualDraw} disabled={isDrawing} className={`px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest transition-all ${isDrawing ? 'bg-zinc-800 text-zinc-600' : 'bg-red-600 hover:bg-red-500 text-white shadow-xl shadow-red-900/30'}`}>
                    {isDrawing ? "Processing Draw..." : "Trigger Manual Draw"}
                  </button>
                )}
              </header>

              <div className="grid grid-cols-3 gap-8">
                <div className="bg-zinc-900 p-8 rounded-[2rem] border border-zinc-800">
                  <div className="text-zinc-500 text-xs font-black mb-2 uppercase tracking-widest">Current Jackpot</div>
                  <div className="text-4xl font-black text-white italic">GHS {config.currentJackpot.toLocaleString()}</div>
                </div>
                <div className="bg-zinc-900 p-8 rounded-[2rem] border border-zinc-800">
                  <div className="text-zinc-500 text-xs font-black mb-2 uppercase tracking-widest">Total Tickets (Visible)</div>
                  <div className="text-4xl font-black text-white italic">{tickets.length}</div>
                </div>
                <div className="bg-zinc-900 p-8 rounded-[2rem] border border-zinc-800">
                  <div className="text-zinc-500 text-xs font-black mb-2 uppercase tracking-widest">Operator</div>
                  <div className="text-sm font-black truncate text-red-500">{auth.currentUser?.email}</div>
                </div>
              </div>

              {hasPermission('VIEW_TICKETS') && (
                <div className="bg-zinc-900 rounded-[2rem] border border-zinc-800 overflow-hidden shadow-2xl">
                  <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 font-black text-red-500 uppercase tracking-tight">Real-time Stake Stream</div>
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-zinc-950 text-zinc-500 text-[10px] uppercase font-black tracking-widest">
                        <th className="p-6">Phone Number</th>
                        <th className="p-6 text-center">Stake (GHS)</th>
                        <th className="p-6 text-right">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {tickets.map(t => (
                        <tr key={t.id} className="hover:bg-zinc-800/50 transition-colors">
                          <td className="p-6 font-bold">{t.phone}</td>
                          <td className="p-6 text-center font-black italic text-red-400">GHS {t.stake.toFixed(2)}</td>
                          <td className="p-6 text-right text-zinc-500 font-medium">{new Date(t.timestamp).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'DRAWS' && hasPermission('VIEW_DRAWS') && (
            <div className="space-y-10">
              <h1 className="text-4xl font-black tracking-tighter uppercase italic">Draw Records</h1>
              {draws.map(draw => (
                <div key={draw.id} className="bg-zinc-900 p-10 rounded-[2.5rem] border border-zinc-800 shadow-xl">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-3xl font-black text-red-600 uppercase italic tracking-tighter">{draw.id}</h3>
                      <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{new Date(draw.completedTime || 0).toLocaleString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-white italic">GHS {draw.jackpotPool.toLocaleString()}</div>
                      <div className="text-[10px] font-black text-zinc-600 uppercase">Total Pool</div>
                    </div>
                  </div>
                  <div className="bg-black p-6 rounded-2xl border border-zinc-800">
                    <p className="text-zinc-300 italic text-lg leading-relaxed font-medium">{draw.radioScript || 'No radio script generated.'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'CONFIG' && hasPermission('MANAGE_CONFIG') && (
            <div className="space-y-10 max-w-2xl">
              <h1 className="text-4xl font-black tracking-tighter uppercase italic">System Settings</h1>
              <div className="bg-zinc-900 p-10 rounded-[2.5rem] border border-zinc-800 space-y-10 shadow-2xl">
                <div className="space-y-4">
                  <label className="block text-zinc-400 font-black uppercase text-xs tracking-widest">Manual Jackpot Pool Override (GHS)</label>
                  <input type="number" className="w-full bg-black border border-zinc-800 rounded-2xl p-6 text-3xl font-black text-red-600 outline-none focus:border-red-600 transition-colors italic" value={config.currentJackpot} onChange={(e) => setSystemConfig('currentJackpot', parseInt(e.target.value, 10) || 0)} />
                </div>

                <div className="space-y-4 pt-8 border-t border-zinc-800">
                  <label className="block text-zinc-400 font-black uppercase text-xs tracking-widest">Manual Payout Override (GHS)</label>
                  <input type="number" className="w-full bg-black border border-zinc-800 rounded-2xl p-5 text-2xl font-black text-white outline-none focus:border-red-600 transition-colors italic" value={config.fixedPayoutAmount || 0} onChange={(e) => setSystemConfig('fixedPayoutAmount', parseInt(e.target.value, 10) || 0)} />
                </div>

                <div className="space-y-4 pt-8 border-t border-zinc-800">
                  <label className="block text-zinc-400 font-black uppercase text-xs tracking-widest">Payout Percentage</label>
                  <input type="range" min="0.1" max="0.9" step="0.01" className="w-full h-3 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-red-600" value={config.payoutPercentage} onChange={(e) => setSystemConfig('payoutPercentage', parseFloat(e.target.value))} />
                  <div className="text-zinc-400 font-bold text-sm">{(config.payoutPercentage * 100).toFixed(0)}%</div>
                </div>

                <div className="grid grid-cols-2 gap-8 pt-8 border-t border-zinc-800">
                  <div className="space-y-3">
                    <label className="block text-zinc-500 text-[10px] font-black uppercase tracking-widest text-center">Min Stake</label>
                    <input type="number" className="w-full bg-black border border-zinc-800 rounded-xl p-5 text-center font-black text-xl outline-none focus:border-red-600" value={config.minStake} onChange={(e) => setSystemConfig('minStake', parseInt(e.target.value, 10) || 0)} />
                  </div>
                  <div className="space-y-3">
                    <label className="block text-zinc-500 text-[10px] font-black uppercase tracking-widest text-center">Max Stake</label>
                    <input type="number" className="w-full bg-black border border-zinc-800 rounded-xl p-5 text-center font-black text-xl outline-none focus:border-red-600" value={config.maxStake} onChange={(e) => setSystemConfig('maxStake', parseInt(e.target.value, 10) || 0)} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'LOGS' && hasPermission('VIEW_LOGS') && (
            <div className="space-y-10">
              <h1 className="text-4xl font-black tracking-tighter uppercase italic">System Audit Trail</h1>
              <div className="bg-zinc-900 rounded-[2rem] border border-zinc-800 overflow-hidden shadow-2xl font-mono text-[11px]">
                <table className="w-full text-left">
                  <thead className="bg-zinc-950 text-zinc-600 uppercase tracking-widest">
                    <tr>
                      <th className="p-6">Time</th>
                      <th className="p-6">Admin</th>
                      <th className="p-6">Action</th>
                      <th className="p-6">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {logs.map(log => (
                      <tr key={log.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="p-6 text-zinc-500 whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                        <td className="p-6 font-bold text-zinc-400 truncate max-w-[150px]">{log.adminId}</td>
                        <td className="p-6 font-black text-red-500 italic uppercase">{log.action}</td>
                        <td className="p-6 text-zinc-300 font-medium">{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'USERS' && hasPermission('MANAGE_USERS') && (
            <div className="space-y-10">
              <h1 className="text-4xl font-black tracking-tighter uppercase italic">User Management</h1>

              <form onSubmit={handleCreateUser} className="bg-zinc-900 p-8 rounded-[2rem] border border-zinc-800 grid grid-cols-4 gap-4">
                <input
                  type="text"
                  placeholder="Display name"
                  className="bg-black border border-zinc-800 rounded-xl p-3 font-bold text-sm"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                />
                <input
                  type="email"
                  placeholder="Email"
                  className="bg-black border border-zinc-800 rounded-xl p-3 font-bold text-sm"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  required
                />
                <input
                  type="password"
                  placeholder="Temp password"
                  className="bg-black border border-zinc-800 rounded-xl p-3 font-bold text-sm"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  required
                />
                <div className="flex gap-3">
                  <select className="flex-1 bg-black border border-zinc-800 rounded-xl p-3 font-bold text-sm" value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as UserRole)}>
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                  <button type="submit" className="bg-red-600 hover:bg-red-500 rounded-xl px-6 text-xs font-black uppercase tracking-widest">Create</button>
                </div>
              </form>

              <div className="bg-zinc-900 rounded-[2rem] border border-zinc-800 overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-950 text-zinc-500 text-[10px] uppercase font-black tracking-widest">
                    <tr>
                      <th className="p-5">Name</th>
                      <th className="p-5">Email</th>
                      <th className="p-5">Role</th>
                      <th className="p-5">Status</th>
                      <th className="p-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {users.map((u) => {
                      const draft = getDraftUser(u);
                      const hasDraft = !!draftUserChanges[u.uid];
                      return (
                        <tr key={u.uid} className="hover:bg-zinc-800/30">
                          <td className="p-5">
                            <input
                              className="bg-black border border-zinc-800 rounded-lg px-3 py-2 w-full"
                              value={draft.displayName || ''}
                              onChange={(e) => updateUserDraft(u.uid, { displayName: e.target.value })}
                            />
                          </td>
                          <td className="p-5 text-zinc-300">{u.email}</td>
                          <td className="p-5">
                            <select className="bg-black border border-zinc-800 rounded-lg px-3 py-2 w-full" value={draft.role} onChange={(e) => updateUserDraft(u.uid, { role: e.target.value as UserRole })}>
                              {roleOptions.map((role) => (
                                <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>
                              ))}
                            </select>
                          </td>
                          <td className="p-5">
                            <label className="inline-flex items-center gap-2 text-xs font-bold uppercase">
                              <input type="checkbox" checked={draft.active} onChange={(e) => updateUserDraft(u.uid, { active: e.target.checked })} />
                              {draft.active ? 'Active' : 'Inactive'}
                            </label>
                          </td>
                          <td className="p-5">
                            <div className="flex justify-end gap-2">
                              <button className="px-3 py-2 text-[10px] uppercase font-black rounded-lg bg-zinc-800 hover:bg-zinc-700" onClick={() => handleSendReset(u)}>Reset Link</button>
                              <button className="px-3 py-2 text-[10px] uppercase font-black rounded-lg bg-zinc-800 hover:bg-zinc-700" onClick={() => handleDeactivateUser(u)}>{u.active ? 'Deactivate' : 'Activate'}</button>
                              <button className="px-3 py-2 text-[10px] uppercase font-black rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40" disabled={!hasDraft} onClick={() => handleSaveUser(u)}>Save</button>
                              <button className="px-3 py-2 text-[10px] uppercase font-black rounded-lg bg-red-700 hover:bg-red-600" onClick={() => handleDeleteUser(u)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
