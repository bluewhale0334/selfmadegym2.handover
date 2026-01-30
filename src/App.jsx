import { useEffect, useRef, useState } from "react";
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signOut,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import "./App.css";

function App() {
  const [user, setUser] = useState(null);
  const [showAuthPage, setShowAuthPage] = useState(false);
  const [authMode, setAuthMode] = useState("login"); // "login" or "signup"
  const [isLoading, setIsLoading] = useState(true);
  const lastUserRef = useRef(null);
  const lastUserDataRef = useRef(null);
  const lastWorkDateRef = useRef(null);
  const hasInitializedRef = useRef(false);

  const formatDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const parseTimeToMinutes = (value, isEndTime = false) => {
    if (!value) return null;
    const [hourText, minuteText = "0"] = String(value).split(":");
    const hour = Number.parseInt(hourText, 10);
    const minute = Number.parseInt(minuteText, 10) || 0;
    if (Number.isNaN(hour)) return null;
    if (isEndTime && (hour === 0 || hour === 24)) {
      return 24 * 60;
    }
    return hour * 60 + minute;
  };

  const formatMinutesToTime = (minutes) => {
    if (!Number.isFinite(minutes)) return "";
    if (minutes >= 24 * 60) {
      return "24:00";
    }
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  };

  const roundToHalfHour = (minutes) => {
    if (!Number.isFinite(minutes)) return null;
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const roundedMinute = minute <= 20 ? 0 : 30;
    return hour * 60 + roundedMinute;
  };

  const getScheduleForDate = (workTime, date) => {
    if (!workTime) return null;
    const weekday = date.getDay(); // 0:일 ~ 6:토
    const isSunday = weekday === 0;
    const startKey = isSunday ? "sundayStartTime" : "startTime";
    const endKey = isSunday ? "sundayEndTime" : "endTime";
    const startMinutes = parseTimeToMinutes(workTime[startKey], false);
    const endMinutes = parseTimeToMinutes(workTime[endKey], true);
    if (startMinutes === null || endMinutes === null) {
      return null;
    }
    return {
      startMinutes,
      endMinutes,
    };
  };

  const getAppliedStartTime = (loginDate, schedule) => {
    const loginMinutes = loginDate.getHours() * 60 + loginDate.getMinutes();
    const startMinutes = schedule.startMinutes;
    if (loginMinutes <= startMinutes + 20) {
      return startMinutes;
    }
    return roundToHalfHour(loginMinutes);
  };

  const getAppliedEndTime = (logoutDate, schedule) => {
    if (schedule.endMinutes === 24 * 60) {
      return 24 * 60;
    }
    const logoutMinutes = logoutDate.getHours() * 60 + logoutDate.getMinutes();
    if (
      logoutMinutes >= schedule.endMinutes - 20 &&
      logoutMinutes <= schedule.endMinutes + 20
    ) {
      return schedule.endMinutes;
    }
    if (logoutMinutes > schedule.endMinutes + 20) {
      return schedule.endMinutes;
    }
    return roundToHalfHour(logoutMinutes);
  };

  const updateAttendanceRecord = async (
    userId,
    dateKey,
    payload
  ) => {
    const recordRef = doc(db, "workAttendance", `${userId}_${dateKey}`);
    await setDoc(
      recordRef,
      {
        userId,
        date: dateKey,
        ...payload,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  const recordLogin = async (userData, now) => {
    const schedule = getScheduleForDate(userData.workTime, now);
    if (!schedule) return;
    const dateKey = formatDateKey(now);
    const appliedStart = getAppliedStartTime(now, schedule);
    if (appliedStart === null) return;
    const recordRef = doc(db, "workAttendance", `${userData.id}_${dateKey}`);
    const existingSnap = await getDoc(recordRef);
    if (existingSnap.exists() && existingSnap.data()?.source === "admin") {
      lastWorkDateRef.current = dateKey;
      return;
    }
    let nextStart = appliedStart;
    if (existingSnap.exists()) {
      const existingStart = parseTimeToMinutes(
        existingSnap.data()?.startTime,
        false
      );
      if (existingStart !== null && existingStart <= appliedStart) {
        nextStart = existingStart;
      }
    }
    const late = nextStart - schedule.startMinutes >= 30;
    lastWorkDateRef.current = dateKey;
    await updateAttendanceRecord(userData.id, dateKey, {
      startTime: formatMinutesToTime(nextStart),
      late,
      source: "auto",
    });
  };

  const recordLogout = async (userData, now) => {
    const schedule = getScheduleForDate(userData.workTime, now);
    if (!schedule) return;
    const dateKey = lastWorkDateRef.current || formatDateKey(now);
    const appliedEnd = getAppliedEndTime(now, schedule);
    if (appliedEnd === null) return;
    const recordRef = doc(db, "workAttendance", `${userData.id}_${dateKey}`);
    const existingSnap = await getDoc(recordRef);
    if (existingSnap.exists() && existingSnap.data()?.source === "admin") {
      return;
    }
    let nextEnd = appliedEnd;
    if (existingSnap.exists()) {
      const existingEnd = parseTimeToMinutes(
        existingSnap.data()?.endTime,
        true
      );
      if (existingEnd !== null && existingEnd >= appliedEnd) {
        nextEnd = existingEnd;
      }
    }
    await updateAttendanceRecord(userData.id, dateKey, {
      endTime: formatMinutesToTime(nextEnd),
      source: "auto",
    });
  };

  const handleBeforeLogout = async () => {
    if (!lastUserDataRef.current || lastUserDataRef.current.user_type !== "customer") {
      return;
    }
    await recordLogout(lastUserDataRef.current, new Date());
  };

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.error(error);
    });

    const waitForUserDoc = async (uid, maxRetries = 5, delayMs = 500) => {
      for (let attempt = 0; attempt < maxRetries; attempt += 1) {
        const docSnapshot = await getDoc(doc(db, "users", uid));
        if (docSnapshot.exists()) {
          return docSnapshot;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      return null;
    };

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Firestore에서 사용자 정보 확인 (disabled 체크)
        try {
          let userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (!userDoc.exists()) {
            const pendingUid = sessionStorage.getItem("pendingUserDocUid");
            if (pendingUid === currentUser.uid) {
              userDoc = await waitForUserDoc(currentUser.uid);
            }
          }

          if (userDoc && userDoc.exists()) {
            const userData = userDoc.data();
            // disabled 플래그가 true이거나 email이 빈 문자열이면 자동 로그아웃
            if (userData.disabled === true || !userData.email || userData.email === "") {
              console.log("User is disabled or email is empty, signing out...");
              await signOut(auth);
              setUser(null);
              setIsLoading(false);
              return;
            }
            const previousUser = lastUserRef.current;
            const previousUserData = lastUserDataRef.current;
            if (
              hasInitializedRef.current &&
              previousUser &&
              previousUser.uid !== currentUser.uid &&
              previousUserData?.user_type === "customer"
            ) {
              await recordLogout(previousUserData, new Date());
            }
            lastUserRef.current = currentUser;
            lastUserDataRef.current = {
              id: currentUser.uid,
              ...userData,
            };
            if (hasInitializedRef.current && userData.user_type === "customer") {
              await recordLogin(
                {
                  id: currentUser.uid,
                  ...userData,
                },
                new Date()
              );
            }
          } else {
            // Firestore에 사용자 문서가 없으면 로그아웃
            sessionStorage.removeItem("pendingUserDocUid");
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
      if (!currentUser) {
        lastUserRef.current = null;
        lastUserDataRef.current = null;
        lastWorkDateRef.current = null;
      }
      setUser(currentUser);
      setIsLoading(false);
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;
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
      onBeforeLogout={handleBeforeLogout}
      onShowAuthPage={(mode = "login") => {
        setAuthMode(mode);
        setShowAuthPage(true);
      }}
    />
  );
}

export default App;
