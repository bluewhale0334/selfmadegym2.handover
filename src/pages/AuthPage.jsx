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
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import "./AuthPage.css";

function AuthPage({ user }) {
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState("login");
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
          <h1>Handover App</h1>
          <p>업무 인수인계를 더 간단하게</p>
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
                const userCredential = await createUserWithEmailAndPassword(
                  auth,
                  signupForm.email,
                  signupForm.password
                );
                await updateProfile(userCredential.user, {
                  displayName: signupForm.name,
                });
                await setDoc(doc(db, "users", userCredential.user.uid), {
                  email: signupForm.email,
                  name: signupForm.name,
                  role: signupForm.role,
                  phone: signupForm.phone,
                  tagColor: signupForm.tagColor,
                  createdAt: serverTimestamp(),
                  lastLoginAt: serverTimestamp(),
                });
                await setDoc(doc(db, "tagColors", signupForm.tagColor), {
                  uid: userCredential.user.uid,
                  name: signupForm.name,
                  color: selectedColor?.color ?? "",
                  createdAt: serverTimestamp(),
                });
                setReservedColors((prev) => ({
                  ...prev,
                  [signupForm.tagColor]: signupForm.name,
                }));
                setStatus("회원가입 완료");
              } catch (error) {
                console.error(error);
                if (error.code === "auth/email-already-in-use") {
                  setStatus("이미 가입된 이메일입니다.");
                } else if (error.code === "auth/weak-password") {
                  setStatus("비밀번호가 너무 약합니다.");
                } else {
                  setStatus("회원가입 실패");
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
                      style={{ backgroundColor: option.color }}
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
