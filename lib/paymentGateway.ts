
import { MoMoProvider, TransactionStatus } from '../types';

export interface PaymentRequest {
  phone: string;
  amount: number;
  provider: MoMoProvider;
}

export class GhanaMoMoGateway {
  /**
   * Simulates a Mobile Money Prompt (USSD Push)
   */
  static async requestPayment(req: PaymentRequest): Promise<{ success: boolean; transactionId: string }> {
    console.log(`[MoMo] Requesting GHS ${req.amount} from ${req.phone} via ${req.provider}`);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Simulate success (95% rate for testing)
    const success = Math.random() > 0.05;
    const transactionId = `TX-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    return { success, transactionId };
  }

  /**
   * Simulates an automatic payout to a winner
   */
  static async disburseWinnings(phone: string, amount: number): Promise<boolean> {
    console.log(`[MoMo] DISBURSING GHS ${amount} to ${phone}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    return true; // Assume disbursement success for this demo
  }
}
