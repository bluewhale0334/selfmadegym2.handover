import { useCallback, useEffect, useMemo, useState } from "react";
import { updateProfile } from "firebase/auth";
import { doc, getDocs, collection, deleteDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import "./ProfilePage.css";

function ProfilePage({ user, profile, onClose }) {
  const [formData, setFormData] = useState({
    name: "",
    role: "",
    phone: "",
    tagColor: "red",
  });
  const [reservedColors, setReservedColors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [isEditing, setIsEditing] = useState(false);

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

  // 프로필 데이터 로드
  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name || "",
        role: profile.role || "",
        phone: profile.phone || "",
        tagColor: profile.tagColor || "red",
      });
    }
  }, [profile]);

  // 예약된 태그 색상 가져오기
  const fetchReservedColors = useCallback(async () => {
    try {
      const snapshot = await getDocs(collection(db, "tagColors"));
      const nextReserved = {};
      snapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        // 현재 사용자의 태그 색상은 예약된 것으로 표시하지 않음
        if (data?.name && docSnapshot.id !== formData.tagColor) {
          nextReserved[docSnapshot.id] = data.name;
        }
      });
      setReservedColors(nextReserved);
    } catch (error) {
      console.error("Error fetching reserved colors:", error);
    }
  }, [formData.tagColor]);

  useEffect(() => {
    if (isEditing) {
      fetchReservedColors();
    }
  }, [isEditing, fetchReservedColors]);

  const validatePhone = (value) => /^01[016789]-\d{3,4}-\d{4}$/.test(value);

  const handleEdit = () => {
    setIsEditing(true);
    setStatus("");
  };

  const handleCancel = () => {
    // 원래 프로필 데이터로 복원
    if (profile) {
      setFormData({
        name: profile.name || "",
        role: profile.role || "",
        phone: profile.phone || "",
        tagColor: profile.tagColor || "red",
      });
    }
    setIsEditing(false);
    setStatus("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!user) {
      setStatus("로그인이 필요합니다.");
      return;
    }

    if (!formData.name || !formData.role || !formData.phone) {
      setStatus("모든 필드를 입력하세요.");
      return;
    }

    if (!validatePhone(formData.phone)) {
      setStatus("전화번호 형식을 확인하세요. (예: 010-1234-5678)");
      return;
    }

    // 태그 색상이 변경되었고, 새 색상이 이미 사용 중인 경우
    if (profile?.tagColor !== formData.tagColor && reservedColors[formData.tagColor]) {
      setStatus("이미 사용 중인 태그 색상입니다.");
      return;
    }

    setIsLoading(true);
    setStatus("저장 중...");

    try {
      const userRef = doc(db, "users", user.uid);
      const selectedColor = tagColorOptions.find(
        (option) => option.value === formData.tagColor
      );

      // 태그 색상이 변경된 경우
      if (profile?.tagColor !== formData.tagColor) {
        // 기존 태그 색상 문서 삭제
        if (profile?.tagColor) {
          try {
            await deleteDoc(doc(db, "tagColors", profile.tagColor));
          } catch (error) {
            console.error("Error deleting old tag color:", error);
            // 삭제 실패해도 계속 진행
          }
        }

        // 새 태그 색상 문서 생성
        await setDoc(doc(db, "tagColors", formData.tagColor), {
          uid: user.uid,
          name: formData.name,
          color: selectedColor?.color ?? "",
          createdAt: serverTimestamp(),
        });
      } else if (profile?.tagColor === formData.tagColor) {
        // 태그 색상이 변경되지 않았지만 이름이 변경된 경우, tagColors 문서도 업데이트
        await setDoc(
          doc(db, "tagColors", formData.tagColor),
          {
            uid: user.uid,
            name: formData.name,
            color: selectedColor?.color ?? "",
          },
          { merge: true }
        );
      }

      // 사용자 프로필 업데이트
      await updateDoc(userRef, {
        name: formData.name,
        role: formData.role,
        phone: formData.phone,
        tagColor: formData.tagColor,
      });

      // Firebase Auth의 displayName도 업데이트
      await updateProfile(auth.currentUser, {
        displayName: formData.name,
      });

      setStatus("저장 완료");
      setIsEditing(false);
      
      // 1초 후 상태 메시지 제거
      setTimeout(() => {
        setStatus("");
      }, 2000);
    } catch (error) {
      console.error("Error updating profile:", error);
      setStatus("저장 실패: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="profile-page">
        <div className="profile-card">
          <p>로그인이 필요합니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-card">
        <div className="profile-header">
          <h2>프로필</h2>
          {onClose && (
            <button
              type="button"
              className="profile-close-button"
              onClick={onClose}
            >
              프로필 나가기
            </button>
          )}
        </div>

        <form className="profile-form" onSubmit={handleSubmit}>
          <div className="profile-field">
            <label>이메일</label>
            <input
              type="email"
              value={user.email || ""}
              disabled
              className="profile-input-disabled"
            />
            <span className="profile-field-note">이메일은 변경할 수 없습니다.</span>
          </div>

          <div className="profile-field">
            <label>이름</label>
            <input
              type="text"
              placeholder="이름"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              disabled={!isEditing}
              className={!isEditing ? "profile-input-disabled" : ""}
            />
          </div>

          <div className="profile-field">
            <label>직책</label>
            <select
              value={formData.role}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, role: e.target.value }))
              }
              disabled={!isEditing}
              className={!isEditing ? "profile-input-disabled" : ""}
            >
              <option value="" disabled>
                직책을 선택하세요
              </option>
              <option value="대표">대표</option>
              <option value="매니저">매니저</option>
              <option value="어드민">어드민</option>
              <option value="트레이너">트레이너</option>
            </select>
          </div>

          <div className="profile-field">
            <label>전화번호</label>
            <input
              type="tel"
              placeholder="010-1234-5678"
              value={formData.phone}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, phone: e.target.value }))
              }
              disabled={!isEditing}
              className={!isEditing ? "profile-input-disabled" : ""}
            />
          </div>

          <div className="profile-field">
            <label>태그 색상</label>
            <div className="tag-color-options">
              {tagColorOptions.map((option) => {
                const isReserved = reservedColors[option.value] && option.value !== formData.tagColor;
                const isSelected = formData.tagColor === option.value;
                
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
                      if (!isEditing || isReserved) {
                        return;
                      }
                      setFormData((prev) => ({
                        ...prev,
                        tagColor: option.value,
                      }));
                    }}
                    disabled={!isEditing || isReserved}
                    aria-pressed={isSelected}
                  >
                    <span
                      className="color-dot"
                      style={{ backgroundColor: option.color }}
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
            {!isEditing && (
              <span className="profile-field-note">
                태그 색상을 변경하려면 수정 버튼을 클릭하세요.
              </span>
            )}
          </div>

          {status && (
            <p className={`profile-status ${status.includes("완료") ? "success" : ""}`}>
              {status}
            </p>
          )}

          <div className="profile-actions">
            {!isEditing ? (
              <button
                type="button"
                className="profile-edit-button"
                onClick={handleEdit}
              >
                수정
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="profile-cancel-button"
                  onClick={handleCancel}
                  disabled={isLoading}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="profile-save-button"
                  disabled={isLoading}
                >
                  {isLoading ? "저장 중..." : "저장"}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default ProfilePage;
