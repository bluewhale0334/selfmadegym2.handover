import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase 콘솔의 웹 앱 설정값을 아래에 그대로 채워넣으세요.
const firebaseConfig = {
  apiKey: "AIzaSyAH-NlnjVo4V3Zya070pSDbC7ScZiuNyK8",
  authDomain: "selfmadegym-bd0e1.firebaseapp.com",
  projectId: "selfmadegym-bd0e1",
  storageBucket: "selfmadegym-bd0e1.firebasestorage.app",
  messagingSenderId: "910239683589",
  appId: "1:910239683589:web:7f5063ca9d8df2ed98786c",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
