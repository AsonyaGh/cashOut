
import { initializeApp } from "firebase/app";
import { getFirestore, doc, collection, getDoc, setDoc, addDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { AppUser, SystemConfig, UserRole } from '../types';

export const firebaseConfig = {
  apiKey: "AIzaSyB1egjpuy7TRjIaHNt8k5BPXIg20JmpsJE",
  authDomain: "home-radio-cashout.firebaseapp.com",
  projectId: "home-radio-cashout",
  storageBucket: "home-radio-cashout.firebasestorage.app",
  messagingSenderId: "762892192912",
  appId: "1:762892192912:web:25d6d8edd373140bdf9c15",
  measurementId: "G-86SWL6FN2T"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Collection References
export const configDoc = doc(db, "system", "config");
export const ticketsCol = collection(db, "tickets");
export const drawsCol = collection(db, "draws");
export const logsCol = collection(db, "logs");
export const usersCol = collection(db, "users");

const DEFAULT_ADMIN_UIDS = ['sxYRl4uU4wbNa70Vh50B3C5b9j63'];
const DEFAULT_ADMIN_EMAILS = ['mashoodfarouk@gmail.com'];

const initialConfig: SystemConfig = {
  payoutPercentage: 0.7,
  fixedPayoutAmount: 0,
  minStake: 1,
  maxStake: 10,
  drawIntervalHours: 6,
  nextDrawTime: Date.now() + 6 * 60 * 60 * 1000,
  currentJackpot: 5000,
};

/**
 * Ensures the system configuration exists in Firestore
 */
export const initDB = async () => {
  const snap = await getDoc(configDoc);
  if (!snap.exists()) {
    await setDoc(configDoc, initialConfig);
    console.log("Firestore initialized with fresh data.");
  }
};

export const updateConfig = async (newConfig: Partial<SystemConfig>) => {
  await setDoc(configDoc, newConfig, { merge: true });
};

export const logAudit = async (action: string, details: string) => {
  const user = auth.currentUser;
  await addDoc(logsCol, {
    timestamp: Date.now(),
    action,
    details,
    adminId: user?.email || 'SYSTEM'
  });
};

export const ensureUserProfile = async (uid: string, email?: string | null): Promise<AppUser> => {
  const userDoc = doc(db, "users", uid);
  const snap = await getDoc(userDoc);

  if (snap.exists()) {
    const existing = snap.data() as AppUser;
    return { ...existing, uid };
  }

  const safeEmail = email || '';
  const isBootstrapAdmin = DEFAULT_ADMIN_UIDS.includes(uid) || DEFAULT_ADMIN_EMAILS.includes(safeEmail);

  const newUser: AppUser = {
    uid,
    email: safeEmail,
    displayName: safeEmail.split('@')[0] || 'New User',
    role: isBootstrapAdmin ? UserRole.ADMIN : UserRole.OVERSIGHT_OFFICER,
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdBy: auth.currentUser?.uid || 'SYSTEM'
  };

  await setDoc(userDoc, newUser, { merge: true });
  return newUser;
};

export const getUserProfile = async (uid: string): Promise<AppUser | null> => {
  const userDoc = doc(db, "users", uid);
  const snap = await getDoc(userDoc);
  if (!snap.exists()) return null;
  return { ...(snap.data() as AppUser), uid };
};
