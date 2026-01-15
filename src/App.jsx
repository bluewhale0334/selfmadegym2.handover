import { useEffect, useState } from "react";
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
} from "firebase/auth";
import { auth } from "./firebase";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import "./App.css";

function App() {
  const [user, setUser] = useState(null);
  const [showAuthPage, setShowAuthPage] = useState(false);
  const [authMode, setAuthMode] = useState("login"); // "login" or "signup"
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.error(error);
    });

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsLoading(false);
      // 로그인 성공 시 AuthPage 닫기
      if (currentUser) {
        setShowAuthPage(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 로딩 중이면 아무것도 표시하지 않음 (깜빡임 방지)
  if (isLoading) {
    return null;
  }

  // AuthPage를 표시해야 할 때
  if (showAuthPage) {
    return (
      <AuthPage
        user={user}
        initialMode={authMode}
        onClose={() => setShowAuthPage(false)}
      />
    );
  }

  // 항상 DashboardPage를 메인으로 표시
  return (
    <DashboardPage
      user={user}
      onShowAuthPage={(mode = "login") => {
        setAuthMode(mode);
        setShowAuthPage(true);
      }}
    />
  );
}

export default App;
