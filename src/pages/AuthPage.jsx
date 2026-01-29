import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import "./AuthPage.css";

function AuthPage({ user, onClose, initialMode = "login" }) {
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState(initialMode);
  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  });
  const [resetEmail, setResetEmail] = useState("");
  const [signupForm, setSignupForm] = useState({
    email: "",
    password: "",
    name: "",
    role: "",
    phone: "",
    tagColor: "red",
  });
  const [reservedColors, setReservedColors] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  const tagColorOptions = useMemo(
    () => [
      { value: "red", label: "빨강", color: "#e4574f" },
      { value: "orange", label: "주황", color: "#f2a65a" },
      { value: "yellow", label: "노랑", color: "#f7d36f" },
      { value: "green", label: "초록", color: "#7fc8a9" },
      { value: "blue", label: "파랑", color: "#6baed6" },
      { value: "purple", label: "보라", color: "#b58fd6" },
      { value: "pink", label: "분홍", color: "#f3a6c8" },
      { value: "brown", label: "갈색", color: "#c29a7f" },
      { value: "gray", label: "회색", color: "#b0b3b8" },
      { value: "black", label: "검정", color: "#2b2b2b" },
      {
        value: "red-orange",
        label: "빨강/주황",
        color: "linear-gradient(90deg, #e4574f 0 50%, #f2a65a 50% 100%)",
      },
      {
        value: "orange-yellow",
        label: "주황/노랑",
        color: "linear-gradient(90deg, #f2a65a 0 50%, #f7d36f 50% 100%)",
      },
      {
        value: "yellow-green",
        label: "노랑/초록",
        color: "linear-gradient(90deg, #f7d36f 0 50%, #7fc8a9 50% 100%)",
      },
      {
        value: "green-blue",
        label: "초록/파랑",
        color: "linear-gradient(90deg, #7fc8a9 0 50%, #6baed6 50% 100%)",
      },
      {
        value: "blue-purple",
        label: "파랑/보라",
        color: "linear-gradient(90deg, #6baed6 0 50%, #b58fd6 50% 100%)",
      },
      {
        value: "purple-pink",
        label: "보라/분홍",
        color: "linear-gradient(90deg, #b58fd6 0 50%, #f3a6c8 50% 100%)",
      },
      {
        value: "pink-brown",
        label: "분홍/갈색",
        color: "linear-gradient(90deg, #f3a6c8 0 50%, #c29a7f 50% 100%)",
      },
      {
        value: "brown-gray",
        label: "갈색/회색",
        color: "linear-gradient(90deg, #c29a7f 0 50%, #b0b3b8 50% 100%)",
      },
      {
        value: "gray-black",
        label: "회색/검정",
        color: "linear-gradient(90deg, #b0b3b8 0 50%, #2b2b2b 50% 100%)",
      },
      {
        value: "black-red",
        label: "검정/빨강",
        color: "linear-gradient(90deg, #2b2b2b 0 50%, #e4574f 50% 100%)",
      },
    ],
    []
  );

  const fetchReservedColors = useCallback(async () => {
    if (mode !== "signup") {
      return;
    }
    try {
      const snapshot = await getDocs(collection(db, "tagColors"));
      const nextReserved = {};
      snapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        if (data?.name) {
          nextReserved[docSnapshot.id] = data.name;
        }
      });
      setReservedColors(nextReserved);
    } catch (error) {
      console.error(error);
    }
  }, [mode]);

  useEffect(() => {
    fetchReservedColors();
  }, [fetchReservedColors]);

  const validateEmail = (value) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const validatePhone = (value) =>
    /^01[016789]-\d{3,4}-\d{4}$/.test(value);

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-header">
          <div>
            <h1>Handover App</h1>
            <p>업무 인수인계를 더 간단하게</p>
          </div>
          {onClose && (
            <button
              type="button"
              className="auth-close-button"
              onClick={onClose}
              aria-label="닫기"
            >
              ✕
            </button>
          )}
        </div>

        <div className="auth-tabs">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setStatus("");
            }}
          >
            로그인
          </button>
          <button
            className={mode === "signup" ? "active" : ""}
            onClick={() => {
              setMode("signup");
              setStatus("");
              fetchReservedColors();
            }}
          >
            회원가입
          </button>
        </div>

        {mode === "login" ? (
          <form
            className="auth-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!loginForm.email || !loginForm.password) {
                setStatus("이메일과 비밀번호를 입력하세요.");
                return;
              }
              if (!validateEmail(loginForm.email)) {
                setStatus("이메일 형식을 확인하세요.");
                return;
              }
              setIsLoading(true);
              setStatus("로그인 중...");
              try {
                const userCredential = await signInWithEmailAndPassword(
                  auth,
                  loginForm.email,
                  loginForm.password
                );
                
                // Firestore에서 사용자 정보 확인
                const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));
                if (userDoc.exists()) {
                  const userData = userDoc.data();
                  // disabled 플래그가 true이거나 email이 빈 문자열이면 로그인 차단
                  if (userData.disabled === true || !userData.email || userData.email === "") {
                    await signOut(auth);
                    setStatus("접속이 차단된 계정입니다. 관리자에게 문의하세요.");
                    setIsLoading(false);
                    return;
                  }
                } else {
                  // Firestore에 사용자 문서가 없으면 로그인 차단
                  await signOut(auth);
                  setStatus("접속이 차단된 계정입니다. 관리자에게 문의하세요.");
                  setIsLoading(false);
                  return;
                }
                
                await setDoc(
                  doc(db, "users", userCredential.user.uid),
                  {
                    email: userCredential.user.email,
                    lastLoginAt: serverTimestamp(),
                  },
                  { merge: true }
                );
                setStatus("로그인 완료");
              } catch (error) {
                console.error(error);
                if (error.code === "auth/user-not-found") {
                  setStatus("존재하지 않는 계정입니다.");
                } else if (error.code === "auth/wrong-password") {
                  setStatus("비밀번호가 올바르지 않습니다.");
                } else if (error.code === "auth/invalid-credential") {
                  setStatus("이메일 또는 비밀번호가 올바르지 않습니다.");
                } else {
                  setStatus("로그인 실패");
                }
              } finally {
                setIsLoading(false);
              }
            }}
          >
            <label>
              이메일
              <input
                type="email"
                placeholder="name@example.com"
                value={loginForm.email}
                onChange={(event) =>
                  setLoginForm((prev) => ({
                    ...prev,
                    email: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              비밀번호
              <input
                type="password"
                placeholder="비밀번호"
                value={loginForm.password}
                onChange={(event) =>
                  setLoginForm((prev) => ({
                    ...prev,
                    password: event.target.value,
                  }))
                }
              />
            </label>
            <button type="submit" disabled={isLoading}>
              로그인
            </button>
            <div className="reset-area">
              <span>비밀번호를 잊으셨나요?</span>
              <div>
                <input
                  type="email"
                  placeholder="재설정 이메일"
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                />
                <button
                  type="button"
                  className="ghost"
                  disabled={isLoading}
                  onClick={async () => {
                    if (!resetEmail) {
                      setStatus("재설정할 이메일을 입력하세요.");
                      return;
                    }
                    if (!validateEmail(resetEmail)) {
                      setStatus("이메일 형식을 확인하세요.");
                      return;
                    }
                    setIsLoading(true);
                    setStatus("재설정 메일 발송 중...");
                    try {
                      await sendPasswordResetEmail(auth, resetEmail);
                      setStatus("재설정 메일을 보냈습니다.");
                    } catch (error) {
                      console.error(error);
                      if (error.code === "auth/user-not-found") {
                        setStatus("해당 이메일의 계정이 없습니다.");
                      } else {
                        setStatus("재설정 메일 발송 실패");
                      }
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                >
                  재설정 메일 보내기
                </button>
              </div>
            </div>
          </form>
        ) : (
          <form
            className="auth-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                !signupForm.email ||
                !signupForm.password ||
                !signupForm.name ||
                !signupForm.role ||
                !signupForm.phone
              ) {
                setStatus("모든 필드를 입력하세요.");
                return;
              }
              if (signupForm.password.length < 6) {
                setStatus("비밀번호는 6자 이상이어야 합니다.");
                return;
              }
              if (!validateEmail(signupForm.email)) {
                setStatus("이메일 형식을 확인하세요.");
                return;
              }
              if (!validatePhone(signupForm.phone)) {
                setStatus("전화번호 형식을 확인하세요. (예: 010-1234-5678)");
                return;
              }
              if (reservedColors[signupForm.tagColor]) {
                setStatus("이미 사용 중인 태그 색상입니다.");
                return;
              }
              setIsLoading(true);
              setStatus("회원가입 중...");
              try {
                const selectedColor = tagColorOptions.find(
                  (option) => option.value === signupForm.tagColor
                );
                const tagColorRef = doc(db, "tagColors", signupForm.tagColor);
                const existingColorDoc = await getDoc(tagColorRef);
                if (existingColorDoc.exists()) {
                  setStatus("이미 사용 중인 태그 색상입니다.");
                  return;
                }

                // Firebase Auth 사용자 생성
                const userCredential = await createUserWithEmailAndPassword(
                  auth,
                  signupForm.email,
                  signupForm.password
                );

                const pendingUserDocKey = "pendingUserDocUid";
                sessionStorage.setItem(pendingUserDocKey, userCredential.user.uid);

                // 프로필 업데이트
                await updateProfile(userCredential.user, {
                  displayName: signupForm.name,
                });

                // 인증 상태 최신화 (Firestore Rules에 전파)
                await userCredential.user.reload();
                await userCredential.user.getIdTokenResult(true);

                // Firestore users 문서 생성
                try {
                  await setDoc(doc(db, "users", userCredential.user.uid), {
                    email: signupForm.email,
                    name: signupForm.name,
                    role: signupForm.role,
                    phone: signupForm.phone,
                    tagColor: signupForm.tagColor,
                    user_type: "customer",
                    createdAt: serverTimestamp(),
                    lastLoginAt: serverTimestamp(),
                  });
                } catch (docError) {
                  console.error("Failed to create users document:", docError);
                  throw docError;
                }

                // tagColors 문서 생성
                try {
                  await setDoc(tagColorRef, {
                    uid: userCredential.user.uid,
                    name: signupForm.name,
                    color: selectedColor?.color ?? "",
                    createdAt: serverTimestamp(),
                  });
                } catch (tagError) {
                  console.error("Failed to create tagColors document:", tagError);
                  throw tagError;
                }

                sessionStorage.removeItem(pendingUserDocKey);
                setReservedColors((prev) => ({
                  ...prev,
                  [signupForm.tagColor]: signupForm.name,
                }));
                setStatus("회원가입 완료");
              } catch (error) {
                console.error("Signup error:", error);
                console.error("Error code:", error.code);
                console.error("Error message:", error.message);
                sessionStorage.removeItem("pendingUserDocUid");
                
                if (error.code === "auth/email-already-in-use") {
                  setStatus("이미 가입된 이메일입니다.");
                } else if (error.code === "auth/weak-password") {
                  setStatus("비밀번호가 너무 약합니다.");
                } else if (error.code === "permission-denied" || error.message?.includes("Missing or insufficient permissions")) {
                  setStatus("권한 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
                  console.error("Firestore permission error - this may be a timing issue with Firebase Auth state propagation");
                } else {
                  setStatus(`회원가입 실패: ${error.message || error.code || "알 수 없는 오류"}`);
                }
              } finally {
                setIsLoading(false);
              }
            }}
          >
            <label>
              이메일
              <input
                type="email"
                placeholder="name@example.com"
                value={signupForm.email}
                onChange={(event) =>
                  setSignupForm((prev) => ({
                    ...prev,
                    email: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              비밀번호
              <input
                type="password"
                placeholder="비밀번호 (6자 이상)"
                value={signupForm.password}
                onChange={(event) =>
                  setSignupForm((prev) => ({
                    ...prev,
                    password: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              이름
              <input
                type="text"
                placeholder="이름"
                value={signupForm.name}
                onChange={(event) =>
                  setSignupForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              직책
              <select
                value={signupForm.role}
                onChange={(event) =>
                  setSignupForm((prev) => ({
                    ...prev,
                    role: event.target.value,
                  }))
                }
              >
                <option value="" disabled>
                  직책을 선택하세요
                </option>
                <option value="대표">대표</option>
                <option value="매니저">매니저</option>
                <option value="어드민">어드민</option>
                <option value="트레이너">트레이너</option>
              </select>
            </label>
            <label>
              전화번호
              <input
                type="tel"
                placeholder="010-1234-5678"
                value={signupForm.phone}
                onChange={(event) =>
                  setSignupForm((prev) => ({
                    ...prev,
                    phone: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              태그 색상
              <div className="tag-color-options">
                {tagColorOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={[
                      signupForm.tagColor === option.value ? "active" : "",
                      reservedColors[option.value] ? "reserved" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => {
                      if (reservedColors[option.value]) {
                        return;
                      }
                      setSignupForm((prev) => ({
                        ...prev,
                        tagColor: option.value,
                      }));
                    }}
                    aria-pressed={signupForm.tagColor === option.value}
                    disabled={Boolean(reservedColors[option.value])}
                  >
                    <span
                      className="color-dot"
                      style={{ background: option.color }}
                      aria-hidden="true"
                    />
                    {option.label}
                    {reservedColors[option.value] ? (
                      <span className="tag-overlay">
                        {reservedColors[option.value]}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </label>
            <button type="submit" disabled={isLoading}>
              회원가입
            </button>
          </form>
        )}

        {status ? <p className="auth-status">{status}</p> : null}
      </div>
    </div>
  );
}

export default AuthPage;
