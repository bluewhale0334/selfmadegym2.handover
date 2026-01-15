import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase 콘솔의 웹 앱 설정값을 아래에 그대로 채워넣으세요.
const firebaseConfig = {
  apiKey: "AIzaSyDH48beUbLsJrXcIUjsW1WAlpcZlYOM3Ag",
  authDomain: "self-handover-app.firebaseapp.com",
  projectId: "self-handover-app",
  storageBucket: "self-handover-app.firebasestorage.app",
  messagingSenderId: "1028320934652",
  appId: "1:1028320934652:web:de6ff9c647e1fd0f2ff579",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
