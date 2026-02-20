import { useEffect, useMemo, useState } from "react";
import { collection, doc, deleteField, getDocs, query, updateDoc, deleteDoc, where, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import "./SettingsPage.css";

function SettingsPage({ user, profile, onClose }) {
  const [allUsers, setAllUsers] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [disabledUsers, setDisabledUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [selectedSection, setSelectedSection] = useState("admin"); // "admin", "revoke", "retire", "disabled", or "worktime"
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [selectedUserForRestore, setSelectedUserForRestore] = useState(null);
  const [restoreEmail, setRestoreEmail] = useState("");
  const [restoreTagColor, setRestoreTagColor] = useState("red");
  const [reservedColors, setReservedColors] = useState({});
  const [worktimeEdits, setWorktimeEdits] = useState({});
  const [savingWorktimeUserId, setSavingWorktimeUserId] = useState(null);
  const [bulkHourlyWage, setBulkHourlyWage] = useState("");
  const [isSavingBulkWage, setIsSavingBulkWage] = useState(false);

  const tagColors = useMemo(
    () => ({
      red: "#e4574f",
      orange: "#f2a65a",
      yellow: "#f7d36f",
      green: "#7fc8a9",
      blue: "#6baed6",
      purple: "#b58fd6",
      pink: "#f3a6c8",
      brown: "#c29a7f",
      gray: "#b0b3b8",
      black: "#2b2b2b",
      "red-orange": "linear-gradient(90deg, #e4574f 0 50%, #f2a65a 50% 100%)",
      "orange-yellow": "linear-gradient(90deg, #f2a65a 0 50%, #f7d36f 50% 100%)",
      "yellow-green": "linear-gradient(90deg, #f7d36f 0 50%, #7fc8a9 50% 100%)",
      "green-blue": "linear-gradient(90deg, #7fc8a9 0 50%, #6baed6 50% 100%)",
      "blue-purple": "linear-gradient(90deg, #6baed6 0 50%, #b58fd6 50% 100%)",
      "purple-pink": "linear-gradient(90deg, #b58fd6 0 50%, #f3a6c8 50% 100%)",
      "pink-brown": "linear-gradient(90deg, #f3a6c8 0 50%, #c29a7f 50% 100%)",
      "brown-gray": "linear-gradient(90deg, #c29a7f 0 50%, #b0b3b8 50% 100%)",
      "gray-black": "linear-gradient(90deg, #b0b3b8 0 50%, #2b2b2b 50% 100%)",
      "black-red": "linear-gradient(90deg, #2b2b2b 0 50%, #e4574f 50% 100%)",
    }),
    []
  );

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

  const weekdayOptions = useMemo(
    () => ["월", "화", "수", "목", "금", "토", "일"],
    []
  );
  const hourOptions = useMemo(
    () => Array.from({ length: 24 }).map((_, index) => String(index).padStart(2, "0")),
    []
  );

  const normalizeHourValue = (value) => {
    if (!value) return "";
    return String(value).split(":")[0].padStart(2, "0");
  };

  // customer 타입 사용자 목록 가져오기
  useEffect(() => {
    if (!user || profile?.user_type !== "admin") return;

    const fetchCustomerUsers = async () => {
      try {
        const q = query(
          collection(db, "users"),
          where("user_type", "==", "customer")
        );
        const snapshot = await getDocs(q);
        const users = [];
        snapshot.forEach((docSnapshot) => {
          const data = docSnapshot.data();
          // email이 있는 사용자만 추가
          if (data.email && data.email.trim() !== "") {
            users.push({
              id: docSnapshot.id,
              email: data.email || "",
              name: data.name || "사용자",
              role: data.role || "직책",
              tagColor: data.tagColor || "gray",
              user_type: data.user_type || "customer",
              workTime: data.workTime || {},
              excludeFromAbsenceTag: data.excludeFromAbsenceTag || false,
            });
          }
        });
        setAllUsers(users);
      } catch (error) {
        console.error("Error fetching customer users:", error);
        setStatus("사용자 목록을 불러오는데 실패했습니다: " + error.message);
      }
    };

    fetchCustomerUsers();
  }, [user, profile?.user_type]);

  useEffect(() => {
    if (allUsers.length === 0) return;
    setWorktimeEdits((prev) => {
      const next = { ...prev };
      allUsers.forEach((userItem) => {
        if (next[userItem.id]) return;
        const workTime = userItem.workTime || {};
        next[userItem.id] = {
          weekdays: Array.isArray(workTime.weekdays) ? workTime.weekdays : [],
          startTime: normalizeHourValue(workTime.startTime),
          endTime: normalizeHourValue(workTime.endTime),
          sundayStartTime: normalizeHourValue(workTime.sundayStartTime),
          sundayEndTime: normalizeHourValue(workTime.sundayEndTime),
          hourlyWage: workTime.hourlyWage ?? "",
          assumedHours: workTime.assumedHours ?? "",
          weeklyAllowanceEnabled: workTime.weeklyAllowanceEnabled ?? true,
        };
      });
      return next;
    });
  }, [allUsers]);

  const handleToggleWorkday = (userId, dayLabel) => {
    setWorktimeEdits((prev) => {
      const current = prev[userId] || { weekdays: [], startTime: "", endTime: "" };
      const exists = current.weekdays.includes(dayLabel);
      const nextWeekdays = exists
        ? current.weekdays.filter((day) => day !== dayLabel)
        : [...current.weekdays, dayLabel];
      return {
        ...prev,
        [userId]: { ...current, weekdays: nextWeekdays },
      };
    });
  };

  const handleWorktimeChange = (userId, field, value) => {
    setWorktimeEdits((prev) => {
      const current = prev[userId] || {
        weekdays: [],
        startTime: "",
        endTime: "",
        sundayStartTime: "",
        sundayEndTime: "",
        hourlyWage: "",
        assumedHours: "",
        weeklyAllowanceEnabled: true,
      };
      return {
        ...prev,
        [userId]: { ...current, [field]: value },
      };
    });
  };

  const handleToggleExcludeFromAbsenceTag = async (userItem) => {
    const nextValue = !userItem.excludeFromAbsenceTag;
    setStatus("");
    try {
      await updateDoc(doc(db, "users", userItem.id), {
        excludeFromAbsenceTag: nextValue,
      });
      setAllUsers((prev) =>
        prev.map((u) =>
          u.id === userItem.id ? { ...u, excludeFromAbsenceTag: nextValue } : u
        )
      );
      setStatus(
        nextValue
          ? `${userItem.name}님은 결근 태그에서 제외됩니다.`
          : `${userItem.name}님은 결근 태그에 포함됩니다.`
      );
    } catch (error) {
      console.error("Error toggling excludeFromAbsenceTag:", error);
      setStatus("설정 변경에 실패했습니다.");
    }
  };

  const handleSaveWorktime = async (userItem) => {
    const payload = worktimeEdits[userItem.id];
    if (!payload) return;
    setSavingWorktimeUserId(userItem.id);
    setStatus("");
    try {
      const userRef = doc(db, "users", userItem.id);
      await updateDoc(userRef, {
        workTime: payload,
      });
      setStatus(`${userItem.name}님의 근무시간이 저장되었습니다.`);
    } catch (error) {
      console.error("Error saving work time:", error);
      setStatus("근무시간 저장에 실패했습니다: " + error.message);
    } finally {
      setSavingWorktimeUserId(null);
    }
  };

  const handleSaveBulkHourlyWage = async () => {
    if (!bulkHourlyWage) {
      setStatus("시급을 입력하세요.");
      return;
    }
    setIsSavingBulkWage(true);
    setStatus("");
    try {
      const updates = allUsers.map(async (userItem) => {
        const nextWorkTime = {
          ...(worktimeEdits[userItem.id] || {}),
          hourlyWage: bulkHourlyWage,
        };
        await updateDoc(doc(db, "users", userItem.id), {
          workTime: nextWorkTime,
        });
        return nextWorkTime;
      });
      const nextWorktimeEdits = { ...worktimeEdits };
      const results = await Promise.all(updates);
      allUsers.forEach((userItem, index) => {
        nextWorktimeEdits[userItem.id] = results[index];
      });
      setWorktimeEdits(nextWorktimeEdits);
      setStatus("모든 직원의 시급이 저장되었습니다.");
    } catch (error) {
      console.error("Error saving bulk hourly wage:", error);
      setStatus("시급 저장에 실패했습니다: " + error.message);
    } finally {
      setIsSavingBulkWage(false);
    }
  };

  // admin 타입 사용자 목록 가져오기
  useEffect(() => {
    if (!user || profile?.user_type !== "admin") return;

    const fetchAdminUsers = async () => {
      try {
        const q = query(
          collection(db, "users"),
          where("user_type", "==", "admin")
        );
        const snapshot = await getDocs(q);
        const users = [];
        snapshot.forEach((docSnapshot) => {
          const data = docSnapshot.data();
          // 자신은 제외
          if (docSnapshot.id === user.uid) {
            return;
          }
          users.push({
            id: docSnapshot.id,
            email: data.email || "",
            name: data.name || "사용자",
            role: data.role || "직책",
            tagColor: data.tagColor || "gray",
            user_type: data.user_type || "admin",
          });
        });
        setAdminUsers(users);
      } catch (error) {
        console.error("Error fetching admin users:", error);
        setStatus("admin 사용자 목록을 불러오는데 실패했습니다: " + error.message);
      }
    };

    fetchAdminUsers();
  }, [user, profile?.user_type]);

  // disabled(퇴사 처리된) 사용자 목록 가져오기
  useEffect(() => {
    if (!user || profile?.user_type !== "admin") return;

    const fetchDisabledUsers = async () => {
      try {
        const q = query(
          collection(db, "users"),
          where("disabled", "==", true)
        );
        const snapshot = await getDocs(q);
        const users = [];
        snapshot.forEach((docSnapshot) => {
          const data = docSnapshot.data();
          users.push({
            id: docSnapshot.id,
            email: data.email || "",
            name: data.name || "사용자",
            role: data.role || "직책",
            tagColor: data.tagColor || "",
            user_type: data.user_type || "customer",
            disabled: data.disabled || false,
          });
        });
        setDisabledUsers(users);
      } catch (error) {
        console.error("Error fetching disabled users:", error);
        // disabled 필드에 인덱스가 없을 수 있으므로, 모든 사용자를 조회한 후 필터링
        try {
          const allSnapshot = await getDocs(collection(db, "users"));
          const users = [];
          allSnapshot.forEach((docSnapshot) => {
            const data = docSnapshot.data();
            if (data.disabled === true) {
              users.push({
                id: docSnapshot.id,
                email: data.email || "",
                name: data.name || "사용자",
                role: data.role || "직책",
                tagColor: data.tagColor || "",
                user_type: data.user_type || "customer",
                disabled: data.disabled || false,
              });
            }
          });
          setDisabledUsers(users);
        } catch (fallbackError) {
          console.error("Error fetching all users for disabled filter:", fallbackError);
        }
      }
    };

    fetchDisabledUsers();
  }, [user, profile?.user_type]);

  // 예약된 태그 색상 가져오기 (복귀 모달용)
  useEffect(() => {
    if (!showRestoreModal) return;

    const fetchReservedColors = async () => {
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
        console.error("Error fetching reserved colors:", error);
      }
    };

    fetchReservedColors();
  }, [showRestoreModal]);

  // admin 권한 부여
  const handleGrantAdmin = async (targetUserId, targetUserName) => {
    if (!window.confirm(`${targetUserName}님에게 admin 권한을 부여하시겠습니까?`)) {
      return;
    }

    setIsLoading(true);
    setStatus("admin 권한 부여 중...");

    try {
      const userRef = doc(db, "users", targetUserId);
      await updateDoc(userRef, {
        user_type: "admin",
      });

      setStatus(`${targetUserName}님에게 admin 권한이 부여되었습니다.`);
      
      // 사용자 목록 업데이트
      setAllUsers((prev) => prev.filter((u) => u.id !== targetUserId));
      
      // admin 목록에 추가
      const updatedUser = allUsers.find((u) => u.id === targetUserId);
      if (updatedUser) {
        setAdminUsers((prev) => [
          ...prev,
          { ...updatedUser, user_type: "admin" },
        ]);
      }

      setTimeout(() => {
        setStatus("");
      }, 3000);
    } catch (error) {
      console.error("Error granting admin:", error);
      setStatus("admin 권한 부여 실패: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // admin 권한 해제
  const handleRevokeAdmin = async (targetUserId, targetUserName) => {
    if (!window.confirm(`${targetUserName}님의 admin 권한을 해제하시겠습니까?`)) {
      return;
    }

    setIsLoading(true);
    setStatus("admin 권한 해제 중...");

    try {
      const userRef = doc(db, "users", targetUserId);
      await updateDoc(userRef, {
        user_type: "customer",
      });

      setStatus(`${targetUserName}님의 admin 권한이 해제되었습니다.`);
      
      // admin 목록에서 제거
      setAdminUsers((prev) => prev.filter((u) => u.id !== targetUserId));
      
      // customer 목록에 추가
      const updatedUser = adminUsers.find((u) => u.id === targetUserId);
      if (updatedUser) {
        setAllUsers((prev) => [
          ...prev,
          { ...updatedUser, user_type: "customer" },
        ]);
      }

      setTimeout(() => {
        setStatus("");
      }, 3000);
    } catch (error) {
      console.error("Error revoking admin:", error);
      setStatus("admin 권한 해제 실패: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 직원 퇴사 처리 (태그 색상만 제거)
  const handleRetireEmployee = async (targetUserId, targetUserName, targetTagColor) => {
    if (!window.confirm(`${targetUserName}님의 태그 색상을 제거하고 퇴사 처리하시겠습니까?`)) {
      return;
    }

    setIsLoading(true);
    setStatus("퇴사 처리 중...");

    try {
      // tagColors 컬렉션에서 해당 태그 색상 문서 삭제
      if (targetTagColor) {
        try {
          await deleteDoc(doc(db, "tagColors", targetTagColor));
        } catch (error) {
          console.error("Error deleting tag color:", error);
          // 태그 색상이 이미 없는 경우 무시
        }
      }

      // users 문서에서 tagColor를 빈 문자열로, email을 빈 문자열로, disabled 플래그 추가, deletedAt 설정
      const userRef = doc(db, "users", targetUserId);
      await updateDoc(userRef, {
        tagColor: "",
        email: "",
        disabled: true,
        deletedAt: serverTimestamp(),
      });

      setStatus(`${targetUserName}님이 퇴사 처리되었습니다.`);
      
      // 사용자 목록에서 제거
      setAllUsers((prev) => prev.filter((u) => u.id !== targetUserId));
      
      // disabled 목록에 추가 (리프레시를 위해)
      setTimeout(() => {
        window.location.reload();
      }, 1000);

      setTimeout(() => {
        setStatus("");
      }, 3000);
    } catch (error) {
      console.error("Error retiring employee:", error);
      setStatus("퇴사 처리 실패: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 직원 복귀 처리
  const handleRestoreEmployee = async () => {
    if (!selectedUserForRestore) return;
    
    if (!restoreEmail || !restoreTagColor) {
      setStatus("이메일과 태그 색상을 입력하세요.");
      return;
    }

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(restoreEmail)) {
      setStatus("이메일 형식을 확인하세요.");
      return;
    }

    // 태그 색상이 이미 사용 중인지 확인
    if (reservedColors[restoreTagColor] && reservedColors[restoreTagColor] !== selectedUserForRestore.name) {
      setStatus("이미 사용 중인 태그 색상입니다.");
      return;
    }

    setIsLoading(true);
    setStatus("복귀 처리 중...");

    try {
      const selectedColor = tagColorOptions.find(
        (option) => option.value === restoreTagColor
      );

      // tagColors 컬렉션에 태그 색상 문서 생성/업데이트
      await setDoc(doc(db, "tagColors", restoreTagColor), {
        uid: selectedUserForRestore.id,
        name: selectedUserForRestore.name,
        color: selectedColor?.color ?? "",
        createdAt: serverTimestamp(),
      });

      // users 문서 업데이트: email, tagColor 복원, disabled 제거, deletedAt 제거
      const userRef = doc(db, "users", selectedUserForRestore.id);
      await updateDoc(userRef, {
        email: restoreEmail,
        tagColor: restoreTagColor,
        disabled: false,
        deletedAt: deleteField(),
      });
      
      setStatus(`${selectedUserForRestore.name}님이 복귀 처리되었습니다.`);
      
      // 모달 닫기 및 상태 초기화
      setShowRestoreModal(false);
      setSelectedUserForRestore(null);
      setRestoreEmail("");
      setRestoreTagColor("red");
      
      // 목록 새로고침 (리프레시)
      setTimeout(() => {
        window.location.reload();
      }, 1000);

      setTimeout(() => {
        setStatus("");
      }, 3000);
    } catch (error) {
      console.error("Error restoring employee:", error);
      setStatus("복귀 처리 실패: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // admin이 아니면 접근 불가
  if (!user || profile?.user_type !== "admin") {
    return (
      <div className="settings-page">
        <div className="settings-card">
          <p>관리자 권한이 필요합니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-card">
        <div className="settings-header">
          <h2>환경설정</h2>
          {onClose && (
            <button
              type="button"
              className="settings-close-button"
              onClick={onClose}
            >
              환경설정 나가기
            </button>
          )}
        </div>

        <div className="settings-nav">
          <button
            type="button"
            className={`settings-nav-item ${selectedSection === "worktime" ? "active" : ""}`}
            onClick={() => {
              setSelectedSection("worktime");
              setStatus("");
            }}
          >
            직원 근무 설정
          </button>
          <button
            type="button"
            className={`settings-nav-item ${selectedSection === "admin" ? "active" : ""}`}
            onClick={() => {
              setSelectedSection("admin");
              setStatus("");
            }}
          >
            Admin 권한 부여
          </button>
          <button
            type="button"
            className={`settings-nav-item ${selectedSection === "revoke" ? "active" : ""}`}
            onClick={() => {
              setSelectedSection("revoke");
              setStatus("");
            }}
          >
            Admin 권한 해제
          </button>
          <button
            type="button"
            className={`settings-nav-item ${selectedSection === "retire" ? "active" : ""}`}
            onClick={() => {
              setSelectedSection("retire");
              setStatus("");
            }}
          >
            직원 퇴사 처리
          </button>
          <button
            type="button"
            className={`settings-nav-item ${selectedSection === "disabled" ? "active" : ""}`}
            onClick={() => {
              setSelectedSection("disabled");
              setStatus("");
            }}
          >
            퇴사 처리된 직원
          </button>
        </div>

        {status && (
          <p className={`settings-status ${status.includes("완료") || status.includes("부여") || status.includes("해제") || status.includes("처리") ? "success" : ""}`}>
            {status}
          </p>
        )}

        <div className="settings-content">
          {selectedSection === "admin" ? (
            <div className="settings-section">
              <h3>Admin 권한 부여</h3>
              <p className="settings-description">
                customer 타입 사용자에게 admin 권한을 부여합니다.
              </p>
              {allUsers.length === 0 ? (
                <p className="settings-empty">등록된 customer 타입 사용자가 없습니다.</p>
              ) : (
                <div className="settings-user-list">
                  {allUsers.map((userItem) => (
                    <div key={userItem.id} className="settings-user-item">
                      <span
                        className="settings-user-dot"
                        style={{
                          background: tagColors[userItem.tagColor] ?? "#b0b3b8",
                        }}
                      />
                      <div className="settings-user-info">
                        <span className="settings-user-name">{userItem.name}</span>
                        <span className="settings-user-role">{userItem.role}</span>
                        <span className="settings-user-email">{userItem.email}</span>
                      </div>
                      <button
                        type="button"
                        className="settings-action-button admin-button"
                        onClick={() => handleGrantAdmin(userItem.id, userItem.name)}
                        disabled={isLoading || userItem.user_type === "admin"}
                      >
                        {userItem.user_type === "admin" ? "이미 Admin" : "Admin 권한 부여"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : selectedSection === "revoke" ? (
            <div className="settings-section">
              <h3>Admin 권한 해제</h3>
              <p className="settings-description">
                admin 타입 사용자의 admin 권한을 해제하여 customer로 변경합니다. (자신은 제외)
              </p>
              {adminUsers.length === 0 ? (
                <p className="settings-empty">등록된 admin 타입 사용자가 없습니다.</p>
              ) : (
                <div className="settings-user-list">
                  {adminUsers.map((userItem) => (
                    <div key={userItem.id} className="settings-user-item">
                      <span
                        className="settings-user-dot"
                        style={{
                          background: tagColors[userItem.tagColor] ?? "#b0b3b8",
                        }}
                      />
                      <div className="settings-user-info">
                        <span className="settings-user-name">{userItem.name}</span>
                        <span className="settings-user-role">{userItem.role}</span>
                        <span className="settings-user-email">{userItem.email}</span>
                      </div>
                      <button
                        type="button"
                        className="settings-action-button revoke-button"
                        onClick={() => handleRevokeAdmin(userItem.id, userItem.name)}
                        disabled={isLoading}
                      >
                        Admin 권한 해제
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : selectedSection === "retire" ? (
            <div className="settings-section">
              <h3>직원 퇴사 처리</h3>
              <p className="settings-description">
                직원의 태그 색상을 제거합니다. 다른 데이터(이름, 직책, 전화번호 등)는 유지됩니다.
              </p>
              {allUsers.length === 0 ? (
                <p className="settings-empty">등록된 customer 타입 사용자가 없습니다.</p>
              ) : (
                <div className="settings-user-list">
                  {allUsers
                    .filter((u) => u.tagColor) // 태그 색상이 있는 사용자만 표시
                    .map((userItem) => (
                      <div key={userItem.id} className="settings-user-item">
                        <span
                          className="settings-user-dot"
                          style={{
                            background: tagColors[userItem.tagColor] ?? "#b0b3b8",
                          }}
                        />
                        <div className="settings-user-info">
                          <span className="settings-user-name">{userItem.name}</span>
                          <span className="settings-user-role">{userItem.role}</span>
                          <span className="settings-user-email">{userItem.email}</span>
                        </div>
                        <button
                          type="button"
                          className="settings-action-button retire-button"
                          onClick={() =>
                            handleRetireEmployee(
                              userItem.id,
                              userItem.name,
                              userItem.tagColor
                            )
                          }
                          disabled={isLoading}
                        >
                          퇴사 처리
                        </button>
                      </div>
                    ))}
                  {allUsers.filter((u) => u.tagColor).length === 0 && (
                    <p className="settings-empty">태그 색상이 있는 사용자가 없습니다.</p>
                  )}
                </div>
              )}
            </div>
          ) : selectedSection === "disabled" ? (
            <div className="settings-section">
              <h3>퇴사 처리된 직원</h3>
              <p className="settings-description">
                퇴사 처리된 직원 목록입니다. 복귀 버튼을 클릭하여 이메일과 태그 색상을 입력하여 복귀 처리할 수 있습니다.
              </p>
              {disabledUsers.length === 0 ? (
                <p className="settings-empty">퇴사 처리된 직원이 없습니다.</p>
              ) : (
                <div className="settings-user-list">
                  {disabledUsers.map((userItem) => (
                    <div key={userItem.id} className="settings-user-item">
                      <span
                        className="settings-user-dot"
                        style={{
                          backgroundColor: userItem.tagColor 
                            ? (tagColors[userItem.tagColor] ?? "#b0b3b8")
                            : "#b0b3b8",
                          opacity: userItem.tagColor ? 1 : 0.3,
                        }}
                      />
                      <div className="settings-user-info">
                        <span className="settings-user-name">{userItem.name}</span>
                        <span className="settings-user-role">{userItem.role}</span>
                        <span className="settings-user-email">
                          {userItem.email || "(이메일 없음)"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="settings-action-button restore-button"
                        onClick={() => {
                          setSelectedUserForRestore(userItem);
                          setRestoreEmail(userItem.email || "");
                          setRestoreTagColor(userItem.tagColor || "red");
                          setShowRestoreModal(true);
                        }}
                        disabled={isLoading}
                      >
                        복귀
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : selectedSection === "worktime" ? (
            <div className="settings-section">
              <div className="settings-worktime-header">
                <h3>어드민 근무 설정</h3>
                <div className="settings-worktime-bulk">
                  <span className="settings-worktime-bulk-label">시급 동일 설정</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={bulkHourlyWage}
                    onChange={(event) => setBulkHourlyWage(event.target.value)}
                  />
                  <button
                    type="button"
                    className="settings-worktime-bulk-save"
                    onClick={handleSaveBulkHourlyWage}
                    disabled={isSavingBulkWage}
                  >
                    {isSavingBulkWage ? "저장 중..." : "저장"}
                  </button>
                </div>
              </div>
              <p className="settings-description">
                customer 타입 사용자별로 근무 요일과 시간을 설정합니다.
              </p>
              {allUsers.length === 0 ? (
                <p className="settings-empty">등록된 customer 타입 사용자가 없습니다.</p>
              ) : (
                <div className="settings-user-list">
                  {allUsers.map((userItem) => {
                    const worktime = worktimeEdits[userItem.id] || {
                      weekdays: [],
                      startTime: "",
                      endTime: "",
                      sundayStartTime: "",
                      sundayEndTime: "",
                      hourlyWage: "",
                      assumedHours: "",
                      weeklyAllowanceEnabled: true,
                    };
                    return (
                      <div key={userItem.id} className="settings-user-item settings-worktime-item">
                        <span
                          className="settings-user-dot"
                          style={{
                            background: tagColors[userItem.tagColor] ?? "#b0b3b8",
                          }}
                        />
                        <div className="settings-user-info">
                          <span className="settings-user-name">{userItem.name}</span>
                          <span className="settings-user-role">{userItem.role}</span>
                          <span className="settings-user-email">{userItem.email}</span>
                        </div>
                        <label className="settings-exclude-absence-label">
                          <input
                            type="checkbox"
                            checked={userItem.excludeFromAbsenceTag || false}
                            onChange={() => handleToggleExcludeFromAbsenceTag(userItem)}
                          />
                          태그 제외
                        </label>
                        <div className="settings-worktime-controls">
                          <div className="settings-worktime-weekdays">
                            {weekdayOptions.map((day) => (
                              <button
                                key={`${userItem.id}-${day}`}
                                type="button"
                                className={`settings-worktime-day${
                                  worktime.weekdays.includes(day) ? " active" : ""
                                }`}
                                onClick={() => handleToggleWorkday(userItem.id, day)}
                              >
                                {day}
                              </button>
                            ))}
                          </div>
                          <div className="settings-worktime-times">
                            <label>
                              시작
                              <select
                                value={worktime.startTime}
                                onChange={(event) =>
                                  handleWorktimeChange(userItem.id, "startTime", event.target.value)
                                }
                              >
                                <option value="">선택</option>
                                {hourOptions.map((hour) => (
                                  <option key={`${userItem.id}-start-${hour}`} value={hour}>
                                    {hour}시
                                  </option>
                                ))}
                              </select>
                            </label>
                            <span>~</span>
                            <label>
                              종료
                              <select
                                value={worktime.endTime}
                                onChange={(event) =>
                                  handleWorktimeChange(userItem.id, "endTime", event.target.value)
                                }
                              >
                                <option value="">선택</option>
                                {hourOptions.map((hour) => (
                                  <option key={`${userItem.id}-end-${hour}`} value={hour}>
                                    {hour}시
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              상정근로시간
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                placeholder="0"
                                value={worktime.assumedHours ?? ""}
                                onChange={(event) =>
                                  handleWorktimeChange(
                                    userItem.id,
                                    "assumedHours",
                                    event.target.value
                                  )
                                }
                                className="settings-assumed-hours-input"
                              />
                            </label>
                          </div>
                        {worktime.weekdays.includes("일") && (
                          <div className="settings-worktime-times">
                            <label>
                              일요일 시작
                              <select
                                value={worktime.sundayStartTime}
                                onChange={(event) =>
                                  handleWorktimeChange(
                                    userItem.id,
                                    "sundayStartTime",
                                    event.target.value
                                  )
                                }
                              >
                                <option value="">선택</option>
                                {hourOptions.map((hour) => (
                                  <option key={`${userItem.id}-sun-start-${hour}`} value={hour}>
                                    {hour}시
                                  </option>
                                ))}
                              </select>
                            </label>
                            <span>~</span>
                            <label>
                              일요일 종료
                              <select
                                value={worktime.sundayEndTime}
                                onChange={(event) =>
                                  handleWorktimeChange(
                                    userItem.id,
                                    "sundayEndTime",
                                    event.target.value
                                  )
                                }
                              >
                                <option value="">선택</option>
                                {hourOptions.map((hour) => (
                                  <option key={`${userItem.id}-sun-end-${hour}`} value={hour}>
                                    {hour}시
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        )}
                        <div className="settings-worktime-times settings-worktime-wage">
                          <label>
                            시급
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={worktime.hourlyWage}
                              onChange={(event) =>
                                handleWorktimeChange(
                                  userItem.id,
                                  "hourlyWage",
                                  event.target.value
                                )
                              }
                            />
                          </label>
                          <label className="settings-weekly-allowance-toggle">
                            주휴수당
                            <button
                              type="button"
                              className={`settings-toggle-switch ${
                                worktime.weeklyAllowanceEnabled ? "on" : "off"
                              }`}
                              onClick={() =>
                                handleWorktimeChange(
                                  userItem.id,
                                  "weeklyAllowanceEnabled",
                                  !worktime.weeklyAllowanceEnabled
                                )
                              }
                            >
                              <span className="settings-toggle-slider" />
                            </button>
                          </label>
                        </div>
                        </div>
                        <button
                          type="button"
                          className="settings-action-button"
                          onClick={() => handleSaveWorktime(userItem)}
                          disabled={savingWorktimeUserId === userItem.id}
                        >
                          {savingWorktimeUserId === userItem.id ? "저장 중..." : "저장"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* 복귀 모달 */}
      {showRestoreModal && selectedUserForRestore && (
        <div className="settings-modal-overlay" onClick={() => setShowRestoreModal(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h3>{selectedUserForRestore.name}님 복귀 처리</h3>
              <button
                type="button"
                className="settings-modal-close"
                onClick={() => {
                  setShowRestoreModal(false);
                  setSelectedUserForRestore(null);
                  setRestoreEmail("");
                  setRestoreTagColor("red");
                }}
              >
                ✕
              </button>
            </div>
            <div className="settings-modal-content">
              <div className="settings-modal-field">
                <label>이메일</label>
                <input
                  type="email"
                  placeholder="example@email.com"
                  value={restoreEmail}
                  onChange={(e) => setRestoreEmail(e.target.value)}
                />
              </div>
              <div className="settings-modal-field">
                <label>태그 색상</label>
                <div className="tag-color-options">
                  {tagColorOptions.map((option) => {
                    const isReserved = reservedColors[option.value] && 
                      reservedColors[option.value] !== selectedUserForRestore.name;
                    const isSelected = restoreTagColor === option.value;
                    
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={[
                          isSelected ? "active" : "",
                          isReserved ? "reserved" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => {
                          if (!isReserved) {
                            setRestoreTagColor(option.value);
                          }
                        }}
                        disabled={isReserved}
                        aria-pressed={isSelected}
                      >
                        <span
                          className="color-dot"
                          style={{ background: option.color }}
                          aria-hidden="true"
                        />
                        {option.label}
                        {isReserved ? (
                          <span className="tag-overlay">
                            {reservedColors[option.value]}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="settings-modal-actions">
                <button
                  type="button"
                  className="settings-modal-cancel"
                  onClick={() => {
                    setShowRestoreModal(false);
                    setSelectedUserForRestore(null);
                    setRestoreEmail("");
                    setRestoreTagColor("red");
                  }}
                  disabled={isLoading}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="settings-modal-confirm"
                  onClick={handleRestoreEmployee}
                  disabled={isLoading}
                >
                  {isLoading ? "처리 중..." : "복귀 처리"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsPage;
