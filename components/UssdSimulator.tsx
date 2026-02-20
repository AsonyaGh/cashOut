
import React, { useState, useEffect } from 'react';
import { LotteryEngine } from '../lib/lotteryEngine';
import { MoMoProvider } from '../types';

export const UssdSimulator: React.FC = () => {
  const [screen, setScreen] = useState<'IDLE' | 'WELCOME' | 'AMOUNT' | 'CONFIRM' | 'PROCESSING' | 'RESULT'>('IDLE');
  const [input, setInput] = useState('');
  const [phone, setPhone] = useState('0244123456');
  const [stake, setStake] = useState(0);
  const [resultMsg, setResultMsg] = useState('');

  const dial = () => {
    if (input === '*789#') {
      setScreen('WELCOME');
      setInput('');
    } else {
      alert("Invalid shortcode. Try *789#");
    }
  };

  const handleWelcome = (choice: string) => {
    if (choice === '1') {
      setScreen('AMOUNT');
    } else {
      setScreen('IDLE');
    }
    setInput('');
  };

  const handleAmount = (val: string) => {
    const amt = parseFloat(val);
    if (amt >= 1 && amt <= 10) {
      setStake(amt);
      setScreen('CONFIRM');
    } else {
      alert("Stake must be between GHS 1 and GHS 10");
    }
    setInput('');
  };

  const handleConfirm = async (choice: string) => {
    if (choice === '1') {
      setScreen('PROCESSING');
      const res = await LotteryEngine.buyTicket(phone, stake, MoMoProvider.MTN);
      setResultMsg(res.msg);
      setScreen('RESULT');
    } else {
      setScreen('IDLE');
    }
    setInput('');
  };

  const renderScreen = () => {
    switch (screen) {
      case 'IDLE':
        return (
          <div className="flex flex-col items-center gap-4">
            <input 
              className="bg-zinc-800 text-red-500 font-mono text-2xl p-4 w-full rounded border border-zinc-700 text-center"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Dial *789#"
            />
            <button onClick={dial} className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </button>
          </div>
        );
      case 'WELCOME':
        return (
          <div className="text-white font-mono bg-zinc-900 p-4 rounded shadow-inner min-h-[200px]">
            <p className="mb-4 text-red-500 font-bold">HOME RADIO CASH OUT</p>
            <p className="mb-4">Win with 99.7 FM!<br/>Enter selection:</p>
            <p>1. Play & Win</p>
            <p>2. Exit</p>
            <input 
              autoFocus
              className="mt-4 bg-transparent border-b border-zinc-600 w-full outline-none text-red-400"
              onKeyDown={(e) => e.key === 'Enter' && handleWelcome(input)}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </div>
        );
      case 'AMOUNT':
        return (
          <div className="text-white font-mono bg-zinc-900 p-4 rounded shadow-inner min-h-[200px]">
            <p className="mb-4">Enter Stake Amount<br/>(GHS 1 - GHS 10):</p>
            <input 
              autoFocus
              type="number"
              className="mt-4 bg-transparent border-b border-zinc-600 w-full outline-none text-red-400"
              onKeyDown={(e) => e.key === 'Enter' && handleAmount(input)}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </div>
        );
      case 'CONFIRM':
        return (
          <div className="text-white font-mono bg-zinc-900 p-4 rounded shadow-inner min-h-[200px]">
            <p className="mb-4 italic">Confirm Cash Out Stake of GHS {stake} from MoMo wallet {phone}?</p>
            <p>1. Confirm</p>
            <p>2. Cancel</p>
            <input 
              autoFocus
              className="mt-4 bg-transparent border-b border-zinc-600 w-full outline-none text-red-400"
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm(input)}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </div>
        );
      case 'PROCESSING':
        return (
          <div className="text-white font-mono bg-zinc-900 p-4 rounded shadow-inner min-h-[200px] flex flex-col items-center justify-center text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-red-500 mb-4"></div>
            <p>Processing MoMo Transaction...</p>
          </div>
        );
      case 'RESULT':
        return (
          <div className="text-white font-mono bg-zinc-900 p-4 rounded shadow-inner min-h-[200px]">
            <p className="mb-8 font-bold text-red-500 underline">HOME RADIO INFO</p>
            <p className="mb-8">{resultMsg}</p>
            <button 
              onClick={() => setScreen('IDLE')}
              className="bg-red-600 w-full py-2 rounded text-sm uppercase font-bold"
            >
              DISMISS
            </button>
          </div>
        );
    }
  };

  return (
    <div className="max-w-xs mx-auto bg-black rounded-[3rem] p-4 border-[8px] border-zinc-800 shadow-2xl overflow-hidden relative aspect-[9/18]">
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-4 bg-zinc-800 rounded-full"></div>
      <div className="mt-12 h-full">
        <h2 className="text-zinc-500 text-[10px] text-center uppercase font-bold tracking-tighter mb-4">Home Radio Terminal</h2>
        {renderScreen()}
      </div>
    </div>
  );
};
