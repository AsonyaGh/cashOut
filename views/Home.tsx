
import React, { useState, useEffect } from 'react';
import { onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { configDoc, drawsCol, initDB } from '../store/database';
import { UssdSimulator } from '../components/UssdSimulator';
import { LotteryEngine } from '../lib/lotteryEngine';
import { SystemConfig, Draw } from '../types';

export const Home = () => {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [recentWinners, setRecentWinners] = useState<Draw[]>([]);

  useEffect(() => {
    initDB(); // Ensure Firestore is seeded

    // Listen to System Config (Jackpot, Time)
    const unsubConfig = onSnapshot(configDoc, (doc) => {
      if (doc.exists()) {
        setConfig(doc.data() as SystemConfig);
      }
    });

    // Listen to Recent Draws (Winners)
    const qDraws = query(drawsCol, orderBy("completedTime", "desc"), limit(3));
    const unsubDraws = onSnapshot(qDraws, (snap) => {
      const draws: Draw[] = [];
      snap.forEach(d => draws.push(d.data() as Draw));
      setRecentWinners(draws);
    });

    // Scheduler background worker
    const interval = setInterval(() => {
        LotteryEngine.processScheduledDraws();
    }, 10000);

    return () => {
      unsubConfig();
      unsubDraws();
      clearInterval(interval);
    };
  }, []);

  const timeToNext = config ? Math.max(0, Math.floor((config.nextDrawTime - Date.now()) / 1000)) : 0;
  const hours = Math.floor(timeToNext / 3600);
  const minutes = Math.floor((timeToNext % 3600) / 60);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b-4 border-red-600 p-6 shadow-md">
        <div className="max-w-6xl mx-auto flex flex-col items-center justify-center">
            <div className="flex items-center gap-4 mb-2">
                <div className="bg-red-600 text-white p-4 rounded-xl font-black text-5xl italic tracking-tighter flex items-center">
                    HOME
                    <div className="ml-2 w-10 h-10 border-4 border-white rounded-full flex items-center justify-center">
                        <div className="w-4 h-6 bg-white rounded-full"></div>
                    </div>
                </div>
                <div className="flex flex-col">
                    <span className="text-3xl font-bold text-slate-900 tracking-tight leading-none">Radio 99.7</span>
                    <span className="text-xs uppercase tracking-[0.2em] font-medium text-slate-500">Trusted and Reliable</span>
                </div>
            </div>
            <div className="bg-black text-white px-6 py-1 rounded-full text-sm font-black tracking-widest uppercase mt-4">
                Cash Out Jackpot
            </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-8 grid md:grid-cols-2 gap-12 mt-6">
        <div className="space-y-8">
          <div className="bg-white rounded-[2rem] p-10 shadow-xl border-t-8 border-red-600 text-center flex flex-col items-center">
            <span className="text-slate-400 uppercase tracking-[0.3em] text-xs font-black mb-4">Total Live Jackpot</span>
            <div className="text-7xl font-black text-slate-900 mb-6 tracking-tighter">
              <span className="text-2xl font-bold align-top mr-1 text-red-600">GHS</span>
              {config?.currentJackpot.toLocaleString() || "---"}
            </div>
            <div className="flex items-center gap-2 bg-red-50 text-red-600 px-6 py-3 rounded-2xl font-black text-lg animate-pulse border border-red-100">
              <span className="w-3 h-3 bg-red-600 rounded-full"></span>
              Draw in {hours}h {minutes}m
            </div>
          </div>

          <div className="bg-white rounded-[2rem] p-8 shadow-lg border border-slate-200">
            <h3 className="text-xl font-black mb-6 flex items-center text-slate-900 uppercase tracking-tight">
              <div className="w-1.5 h-6 bg-red-600 mr-3 rounded-full"></div>
              Recent Cash Out Winners
            </h3>
            <div className="space-y-4">
              {recentWinners.length > 0 ? recentWinners.map((draw, i) => (
                <div key={i} className="flex justify-between items-center p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:border-red-200 transition-colors">
                  <div>
                    <div className="font-black text-slate-800 text-lg uppercase">{draw.winners.length} People Cashed Out!</div>
                    <div className="text-xs font-bold text-slate-400">DRAW #{draw.id}</div>
                  </div>
                  <div className="text-red-600 font-black text-xl italic">GHS {draw.payoutAmount.toLocaleString()}</div>
                </div>
              )) : (
                <div className="text-center py-10 text-slate-400 font-medium italic text-sm">
                    No recent winners. Be the first!
                </div>
              )}
            </div>
          </div>

          <div className="bg-black rounded-[2rem] p-10 text-white shadow-2xl relative overflow-hidden">
            <h3 className="text-2xl font-black mb-4 uppercase tracking-tighter">How to play</h3>
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center font-black text-xl">1</div>
                <p className="font-bold text-lg">Dial <span className="text-red-500 font-black text-2xl">*789#</span></p>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center font-black text-xl">2</div>
                <p className="font-bold text-lg italic tracking-tight">Stake GHS 1 - 10</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center font-black text-xl">3</div>
                <p className="font-bold text-lg">Get MoMo <span className="underline decoration-red-600 decoration-4">INSTANTLY</span></p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-start py-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter italic">USSD Portal</h2>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.2em] mt-2">Mobile Interaction Terminal</p>
          </div>
          <UssdSimulator />
        </div>
      </main>
    </div>
  );
};
