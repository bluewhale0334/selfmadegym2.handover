import { useEffect, useState } from "react";
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
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

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Firestore에서 사용자 정보 확인 (disabled 체크)
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            // disabled 플래그가 true이거나 email이 빈 문자열이면 자동 로그아웃
            if (userData.disabled === true || !userData.email || userData.email === "") {
              console.log("User is disabled or email is empty, signing out...");
              await signOut(auth);
              setUser(null);
              setIsLoading(false);
              return;
            }
          } else {
            // Firestore에 사용자 문서가 없으면 로그아웃
            console.log("User document not found in Firestore, signing out...");
            await signOut(auth);
            setUser(null);
            setIsLoading(false);
            return;
          }
        } catch (error) {
          console.error("Error checking user status:", error);
          // 에러 발생 시에도 안전을 위해 로그아웃
          try {
            await signOut(auth);
          } catch (signOutError) {
            console.error("Error signing out:", signOutError);
          }
          setUser(null);
          setIsLoading(false);
          return;
        }
        setShowAuthPage(false);
      }
      setUser(currentUser);
      setIsLoading(false);
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
