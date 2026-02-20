
export enum MoMoProvider {
  MTN = 'MTN',
  VODAFONE = 'Vodafone',
  AIRTELTIGO = 'AirtelTigo'
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED'
}

export enum DrawStatus {
  UPCOMING = 'UPCOMING',
  ONGOING = 'ONGOING',
  COMPLETED = 'COMPLETED'
}

export interface Ticket {
  id: string;
  phone: string;
  stake: number;
  drawId: string;
  timestamp: number;
  status: TransactionStatus;
  isWinner: boolean;
  prizeAmount: number;
}

export interface Draw {
  id: string;
  scheduledTime: number;
  completedTime?: number;
  status: DrawStatus;
  totalStakes: number;
  winners: string[]; // Ticket IDs
  payoutAmount: number;
  jackpotPool: number;
  radioScript?: string;
}

export interface SystemConfig {
  payoutPercentage: number; // e.g., 0.7 (70%)
  fixedPayoutAmount: number; // Manual override in GHS
  minStake: number;
  maxStake: number;
  drawIntervalHours: number;
  nextDrawTime: number;
  currentJackpot: number;
}

export interface AuditLog {
  id: string;
  timestamp: number;
  action: string;
  details: string;
  adminId?: string;
}
