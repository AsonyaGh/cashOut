
import { GoogleGenAI } from "@google/genai";

export class AkwaabaAI {
  private ai: GoogleGenAI;

  constructor() {
    // Initializing the Google GenAI client with the API key from environment variables as per guidelines.
    const apiKey = process.env.API_KEY || "";
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    } else {
      console.warn("Gemini API Key is missing. AI features will be disabled.");
    }
  }

  /**
   * Generates a radio script for announcing winners on Home Radio 99.7
   */
  async generateRadioAnnouncement(drawId: string, jackpot: number, winnersCount: number, prize: number) {
    try {
      if (!this.ai) return "AI Configuration Missing. Call *789# to play.";

      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Write a 30-second high-energy radio announcement script for "Home Radio Cash Out" on Home Radio 99.7. 
        The draw ID is ${drawId}. 
        The total jackpot was GHS ${jackpot.toLocaleString()}. 
        There were ${winnersCount} lucky listeners who each won GHS ${prize.toLocaleString()}.
        The script should sound like a professional Ghanaian radio hypeman/DJ. 
        Mention that the money has already been sent to their Mobile Money wallets. 
        Encourage others to dial *789# to be the next winner.`,
      });
      // Accessing the text property directly from the response as per guidelines.
      return response.text;
    } catch (error) {
      console.error("AI Script generation failed", error);
      return "Congratulations to our lucky winners on Home Radio Cash Out! Your MoMo is waiting!";
    }
  }

  /**
   * Analyzes betting patterns to detect potential fraud.
   * @param stakes Array of recent transactions/stakes
   * @returns boolean True if fraud is suspected
   */
  async detectFraud(stakes: any[]) {
    try {
      if (!this.ai) return false;

      // Simplification: only send relevant data to save tokens
      const stakesSummary = stakes.map(s => `Phone: ${s.phone}, Amount: ${s.stake}, Time: ${s.timestamp}`).join('\n');

      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze the following lottery stakes for suspicious patterns.
        Suspicious patterns include:
        1. High frequency of bets from the same phone number in a short time.
        2. Coordinated betting (multiple numbers betting identical amounts at exact same times).
        3. Stakes that look like bot behavior.

        Stakes Data:
        ${stakesSummary}

        Respond ONLY with "true" if fraud is suspected, or "false" if it looks organic. Do not add any explanation.`,
      });

      const result = response.text?.trim().toLowerCase();
      return result === 'true';

    } catch (error) {
      console.error("AI Fraud detection failed", error);
      return false; // Fail open to avoid blocking legitimate users if AI is down
    }
  }
}

export const aiService = new AkwaabaAI();
