import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, query, updateDoc, deleteDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import "./SettingsPage.css";

function SettingsPage({ user, profile, onClose }) {
  const [allUsers, setAllUsers] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [selectedSection, setSelectedSection] = useState("admin"); // "admin", "revoke", or "retire"

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
    }),
    []
  );

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
          users.push({
            id: docSnapshot.id,
            email: data.email || "",
            name: data.name || "사용자",
            role: data.role || "직책",
            tagColor: data.tagColor || "gray",
            user_type: data.user_type || "customer",
          });
        });
        setAllUsers(users);
      } catch (error) {
        console.error("Error fetching customer users:", error);
        setStatus("사용자 목록을 불러오는데 실패했습니다: " + error.message);
      }
    };

    fetchCustomerUsers();
  }, [user, profile?.user_type]);

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

      // users 문서에서 tagColor를 빈 문자열로, email을 빈 문자열로, disabled 플래그 추가
      const userRef = doc(db, "users", targetUserId);
      await updateDoc(userRef, {
        tagColor: "",
        email: "",
        disabled: true,
      });

      setStatus(`${targetUserName}님이 퇴사 처리되었습니다.`);
      
      // 사용자 목록에서 제거
      setAllUsers((prev) => prev.filter((u) => u.id !== targetUserId));

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
                          backgroundColor: tagColors[userItem.tagColor] ?? "#b0b3b8",
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
                          backgroundColor: tagColors[userItem.tagColor] ?? "#b0b3b8",
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
          ) : (
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
                            backgroundColor: tagColors[userItem.tagColor] ?? "#b0b3b8",
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
          )}
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
