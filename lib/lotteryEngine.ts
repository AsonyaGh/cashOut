
import { db, configDoc, ticketsCol, drawsCol, logAudit, updateConfig } from '../store/database';
import { getDoc, getDocs, addDoc, updateDoc, doc, query, where, Timestamp } from "firebase/firestore";
import { DrawStatus, TransactionStatus, Ticket, Draw, SystemConfig } from '../types';
import { aiService } from '../services/geminiService';
import { GhanaMoMoGateway } from './paymentGateway';

export class LotteryEngine {
  static async processScheduledDraws() {
    const snap = await getDoc(configDoc);
    if (!snap.exists()) return;

    const config = snap.data() as SystemConfig;
    const now = Date.now();

    if (now >= config.nextDrawTime) {
      await this.executeDraw();
    }
  }

  static async executeDraw() {
    const snap = await getDoc(configDoc);
    if (!snap.exists()) return;
    const config = snap.data() as SystemConfig;

    const drawId = `CASH-${Date.now().toString().slice(-6)}`;

    // 1. Gather eligible tickets from Firestore
    const q = query(ticketsCol, where("drawId", "==", "current"), where("status", "==", TransactionStatus.SUCCESS));
    const ticketSnaps = await getDocs(q);
    const currentTickets: Ticket[] = [];
    ticketSnaps.forEach(s => currentTickets.push({ ...s.data(), id: s.id } as Ticket));

    const totalStakes = currentTickets.reduce((sum, t) => sum + t.stake, 0);
    const pool = config.currentJackpot + totalStakes;

    // 1.1 Check for Fraud
    const isFraudulent = await aiService.detectFraud(currentTickets);
    if (isFraudulent) {
      await logAudit('FRAUD_ALERT', 'AI detected suspicious betting patterns in this draw pool. Proceeding with caution.');
    }

    // 2. Select Winners
    const winningTickets: Ticket[] = [];
    currentTickets.forEach(ticket => {
      // 5% chance of winning per ticket for simulation
      if (Math.random() < 0.05) {
        winningTickets.push(ticket);
      }
    });

    // Determine Payout Amount: Priority to fixedPayoutAmount if set (> 0)
    const payoutPool = (config.fixedPayoutAmount && config.fixedPayoutAmount > 0)
      ? config.fixedPayoutAmount
      : pool * config.payoutPercentage;

    const prizePerWinner = winningTickets.length > 0 ? payoutPool / winningTickets.length : 0;

    // 3. Update Tickets & Automatic Payouts in parallel
    const ticketUpdates = currentTickets.map(async (t) => {
      const isWinner = winningTickets.some(wt => wt.id === t.id);
      const ticketRef = doc(db, "tickets", t.id);

      if (isWinner) {
        await GhanaMoMoGateway.disburseWinnings(t.phone, prizePerWinner);
        await logAudit('MOMO_DISBURSEMENT', `Paid GHS ${prizePerWinner.toFixed(2)} to ${t.phone}`);
        return updateDoc(ticketRef, { isWinner: true, prizeAmount: prizePerWinner, drawId });
      }
      return updateDoc(ticketRef, { drawId });
    });

    await Promise.all(ticketUpdates);

    // 4. Generate Radio Script using Gemini
    const radioScript = await aiService.generateRadioAnnouncement(
      drawId,
      pool,
      winningTickets.length,
      prizePerWinner
    );

    // 5. Save Draw Record
    const newDraw: Draw = {
      id: drawId,
      scheduledTime: config.nextDrawTime,
      completedTime: Date.now(),
      status: DrawStatus.COMPLETED,
      totalStakes,
      winners: winningTickets.map(w => w.id),
      payoutAmount: winningTickets.length > 0 ? payoutPool : 0,
      jackpotPool: pool,
      radioScript
    };
    await addDoc(drawsCol, newDraw);

    // 6. Update System State
    // Reset fixedPayoutAmount to 0 after draw to prevent accidental repeat fixed payouts
    await updateConfig({
      currentJackpot: winningTickets.length > 0 ? 5000 : pool,
      nextDrawTime: Date.now() + (config.drawIntervalHours * 60 * 60 * 1000),
      fixedPayoutAmount: 0
    });

    await logAudit('DRAW_FINALIZED', `Draw ${drawId} closed with pool GHS ${pool.toFixed(2)}. Fixed payout reset.`);
  }

  static async buyTicket(phone: string, stake: number, provider: any): Promise<{ success: boolean; msg: string }> {
    const payment = await GhanaMoMoGateway.requestPayment({ phone, amount: stake, provider });

    if (payment.success) {
      const newTicket: Omit<Ticket, 'id'> = {
        phone,
        stake,
        drawId: 'current',
        timestamp: Date.now(),
        status: TransactionStatus.SUCCESS,
        isWinner: false,
        prizeAmount: 0
      };

      await addDoc(ticketsCol, newTicket);

      // Increment the live jackpot in real-time
      const configSnap = await getDoc(configDoc);
      const currentJackpot = configSnap.data()?.currentJackpot || 5000;
      await updateConfig({ currentJackpot: currentJackpot + stake });

      await logAudit('STAKE_COLLECTED', `GHS ${stake} staked by ${phone}`);
      return { success: true, msg: 'Success! Your Home Radio Cash Out ticket is active.' };
    } else {
      await logAudit('MOMO_PAYMENT_FAILED', `Failed collection from ${phone}`);
      return { success: false, msg: 'MoMo transaction failed. Please try again.' };
    }
  }
}
