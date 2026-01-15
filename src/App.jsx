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

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.error(error);
    });

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  return <>{user ? <DashboardPage user={user} /> : <AuthPage user={user} />}</>;
}

export default App;
