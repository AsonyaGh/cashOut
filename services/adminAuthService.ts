import { deleteApp, initializeApp } from "firebase/app";
import { createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail, signOut } from "firebase/auth";
import { auth, firebaseConfig } from "../store/database";

export const createAuthUserByAdmin = async (email: string, password: string): Promise<string> => {
  const tempApp = initializeApp(firebaseConfig, `admin-create-${Date.now()}`);
  const tempAuth = getAuth(tempApp);

  try {
    const cred = await createUserWithEmailAndPassword(tempAuth, email, password);
    return cred.user.uid;
  } finally {
    await signOut(tempAuth);
    await deleteApp(tempApp);
  }
};

export const sendResetLinkToUser = async (email: string): Promise<void> => {
  await sendPasswordResetEmail(auth, email);
};
