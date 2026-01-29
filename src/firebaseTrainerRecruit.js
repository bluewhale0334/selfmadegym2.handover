import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const trainerRecruitConfig = {
  apiKey: import.meta.env.VITE_TRAINER_RECRUIT_API_KEY,
  authDomain: import.meta.env.VITE_TRAINER_RECRUIT_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_TRAINER_RECRUIT_PROJECT_ID,
  storageBucket: import.meta.env.VITE_TRAINER_RECRUIT_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_TRAINER_RECRUIT_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_TRAINER_RECRUIT_APP_ID,
};

const trainerRecruitApp =
  getApps().find((app) => app.name === "trainerToRecruitApp") ||
  initializeApp(trainerRecruitConfig, "trainerToRecruitApp");

export const trainerRecruitAuth = getAuth(trainerRecruitApp);
export const trainerRecruitDb = getFirestore(trainerRecruitApp);
export const trainerRecruitStorage = getStorage(trainerRecruitApp);
