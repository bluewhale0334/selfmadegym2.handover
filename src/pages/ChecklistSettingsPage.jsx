import { useEffect, useMemo, useState } from "react";
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, updateDoc, where, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import "./ChecklistSettingsPage.css";

function ChecklistSettingsPage({ user, profile, onClose }) {
  const [items, setItems] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const [selectedHour, setSelectedHour] = useState("09");
  const [selectedMinute, setSelectedMinute] = useState("00");
  const [selectedCategory, setSelectedCategory] = useState("일일 업무");
  const [selectedWeekday, setSelectedWeekday] = useState("월");
  const [selectedMonthDays, setSelectedMonthDays] = useState([1]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [showUserList, setShowUserList] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(user?.uid ?? null);
  const [showCopyPanel, setShowCopyPanel] = useState(false);
  const [copySourceUserId, setCopySourceUserId] = useState(null);
  const [copyTargetUserIds, setCopyTargetUserIds] = useState([]);
  const [copyCategories, setCopyCategories] = useState(["일일 업무"]);

  const isAdmin = profile?.user_type === "admin";

  const selectedUserLabel = useMemo(() => {
    if (!isAdmin) return "내 업무 리스트";
    const match = users.find((u) => u.id === selectedUserId);
    return match ? `${match.name} (${match.role || "직책"})` : "사용자 선택";
  }, [isAdmin, users, selectedUserId]);

  const copySourceLabel = useMemo(() => {
    const match = users.find((u) => u.id === copySourceUserId);
    return match ? `${match.name} (${match.role || "직책"})` : "원본 사용자 선택";
  }, [users, copySourceUserId]);

  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, "users"), where("user_type", "==", "customer"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const next = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (!data?.name) return;
          next.push({
            id: docSnap.id,
            name: data.name,
            role: data.role || "직책",
          });
        });
        setUsers(next);
      },
      (error) => {
        console.error("Error fetching checklist users:", error);
        setStatus("사용자 목록을 불러오지 못했습니다.");
      }
    );

    return () => unsubscribe();
  }, [isAdmin]);

  useEffect(() => {
    if (!user || !selectedUserId) {
      setItems([]);
      return () => {};
    }

    setIsLoading(true);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/529e4d9a-a612-4f25-a2dc-da0b5a1f0a42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ChecklistSettingsPage.jsx:112',message:'Checklist tasks query init',data:{selectedUserId,orderByField:'createdAt',collection:'checklistTasks',hasUser:Boolean(user?.uid),isAdmin:profile?.user_type==='admin'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    const q = query(
      collection(db, "checklistTasks"),
      where("userId", "==", selectedUserId)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/529e4d9a-a612-4f25-a2dc-da0b5a1f0a42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ChecklistSettingsPage.jsx:122',message:'Checklist tasks snapshot success',data:{count:snapshot.size,selectedUserId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
        const next = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          next.push({
            id: docSnap.id,
            title: data.title || "",
            done: Boolean(data.done),
            hour: data.hour ?? null,
            minute: data.minute ?? null,
            category: data.category || "일일 업무",
            weekday: data.weekday ?? null,
            monthDays: Array.isArray(data.monthDays)
              ? data.monthDays
              : typeof data.monthDay === "number"
              ? [data.monthDay]
              : [],
            createdAt: data.createdAt,
          });
        });
        const filtered = next.filter((item) => item.category === selectedCategory);
        const sorted = filtered.sort((a, b) => {
          if (selectedCategory === "주간 업무") {
            const order = ["월", "화", "수", "목", "금", "토", "일"];
            const aIndex = order.indexOf(a.weekday ?? "");
            const bIndex = order.indexOf(b.weekday ?? "");
            if (aIndex !== bIndex) return aIndex - bIndex;
          } else if (selectedCategory === "월간 업무") {
            const aDay =
              Array.isArray(a.monthDays) && a.monthDays.length > 0
                ? Math.min(...a.monthDays)
                : 99;
            const bDay =
              Array.isArray(b.monthDays) && b.monthDays.length > 0
                ? Math.min(...b.monthDays)
                : 99;
            if (aDay !== bDay) return aDay - bDay;
          } else {
            const aHour = typeof a.hour === "number" ? a.hour : 99;
            const bHour = typeof b.hour === "number" ? b.hour : 99;
            if (aHour !== bHour) return aHour - bHour;
            const aMin = typeof a.minute === "number" ? a.minute : 99;
            const bMin = typeof b.minute === "number" ? b.minute : 99;
            if (aMin !== bMin) return aMin - bMin;
          }
          const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return bTime - aTime;
        });
        setItems(sorted);
        setIsLoading(false);
      },
      (error) => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/529e4d9a-a612-4f25-a2dc-da0b5a1f0a42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ChecklistSettingsPage.jsx:142',message:'Checklist tasks snapshot error',data:{code:error.code||null,message:error.message||null,selectedUserId,orderByField:'createdAt'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        console.error("Error fetching checklist tasks:", error);
        setStatus("업무 리스트를 불러오지 못했습니다.");
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, selectedUserId, selectedCategory]);

  const handleAddItem = async () => {
    if (!newTitle.trim()) {
      setStatus("항목 내용을 입력해주세요.");
      return;
    }
    if (!user || !selectedUserId) {
      setStatus("로그인이 필요합니다.");
      return;
    }

    setStatus("");
    try {
      const hourValue = Number(selectedHour);
      const minuteValue = Number(selectedMinute);
      const payload = {
        title: newTitle.trim(),
        done: false,
        userId: selectedUserId,
        category: selectedCategory,
        createdAt: Timestamp.now(),
      };

      if (selectedCategory === "주간 업무") {
        payload.weekday = selectedWeekday;
      } else if (selectedCategory === "월간 업무") {
        payload.monthDays = selectedMonthDays.length > 0 ? selectedMonthDays : [1];
      } else {
        payload.hour = Number.isNaN(hourValue) ? 9 : hourValue;
        payload.minute = Number.isNaN(minuteValue) ? 0 : minuteValue;
      }

      await addDoc(collection(db, "checklistTasks"), {
        ...payload,
      });
      setNewTitle("");
    } catch (error) {
      console.error("Error adding checklist item:", error);
      setStatus("업무 리스트 추가에 실패했습니다.");
    }
  };

  const handleToggleDone = async (item) => {
    try {
      await updateDoc(doc(db, "checklistTasks", item.id), {
        done: !item.done,
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      console.error("Error updating checklist item:", error);
      setStatus("업무 리스트 상태 변경에 실패했습니다.");
    }
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm("이 항목을 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, "checklistTasks", item.id));
    } catch (error) {
      console.error("Error deleting checklist item:", error);
      setStatus("업무 리스트 삭제에 실패했습니다.");
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditingTitle(item.title);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const handleSaveEdit = async (item) => {
    if (!editingTitle.trim()) {
      setStatus("항목 내용을 입력해주세요.");
      return;
    }
    try {
      await updateDoc(doc(db, "checklistTasks", item.id), {
        title: editingTitle.trim(),
        updatedAt: Timestamp.now(),
      });
      cancelEdit();
    } catch (error) {
      console.error("Error updating checklist item:", error);
      setStatus("업무 리스트 수정에 실패했습니다.");
    }
  };

  const handleCopyContent = async () => {
    if (!copySourceUserId) {
      setStatus("복사할 원본 사용자를 선택해주세요.");
      return;
    }
    if (copyTargetUserIds.length === 0) {
      setStatus("복사 대상 사용자를 선택해주세요.");
      return;
    }
    if (copyCategories.length === 0) {
      setStatus("복사할 카테고리를 선택해주세요.");
      return;
    }

    setStatus("");
    setIsLoading(true);
    try {
      const q = query(
        collection(db, "checklistTasks"),
        where("userId", "==", copySourceUserId)
      );
      const sourceItems = [];
      const unsubscribe = onSnapshot(
        q,
        async (snapshot) => {
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (!copyCategories.includes(data.category || "일일 업무")) {
              return;
            }
            sourceItems.push({
              title: data.title || "",
              category: data.category || "일일 업무",
              hour: data.hour ?? null,
              minute: data.minute ?? null,
              weekday: data.weekday ?? null,
              monthDays: Array.isArray(data.monthDays)
                ? data.monthDays
                : typeof data.monthDay === "number"
                ? [data.monthDay]
                : [],
            });
          });

          if (sourceItems.length === 0) {
            setStatus("복사할 항목이 없습니다.");
            setIsLoading(false);
            unsubscribe();
            return;
          }

          const payloads = [];
          copyTargetUserIds.forEach((targetId) => {
            sourceItems.forEach((item) => {
              const base = {
                title: item.title,
                done: false,
                userId: targetId,
                category: item.category,
                createdAt: Timestamp.now(),
              };
              if (item.category === "주간 업무") {
                payloads.push({ ...base, weekday: item.weekday });
              } else if (item.category === "월간 업무") {
                payloads.push({ ...base, monthDays: item.monthDays });
              } else {
                payloads.push({ ...base, hour: item.hour, minute: item.minute });
              }
            });
          });

          await Promise.all(
            payloads.map((payload) => addDoc(collection(db, "checklistTasks"), payload))
          );
          setStatus("선택한 사용자에게 복사되었습니다.");
          setIsLoading(false);
          unsubscribe();
        },
        (error) => {
          console.error("Error copying checklist tasks:", error);
          setStatus("복사 중 오류가 발생했습니다.");
          setIsLoading(false);
          unsubscribe();
        }
      );
    } catch (error) {
      console.error("Error starting copy:", error);
      setStatus("복사를 시작할 수 없습니다.");
      setIsLoading(false);
    }
  };

  return (
    <div className="checklist-settings">
      <div className="checklist-settings-header">
        <div>
          <h2>업무관리 설정</h2>
          <p className="checklist-settings-subtitle"></p>
        </div>
        <div className="checklist-category-tabs">
          {["일일 업무", "주간 업무", "월간 업무"].map((category) => (
            <button
              key={category}
              type="button"
              className={`checklist-category-button${category === selectedCategory ? " active" : ""}`}
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
        <div className="checklist-settings-actions">
          {isAdmin && (
            <div className="checklist-user-select">
              <button
                type="button"
                className="checklist-user-button"
                onClick={() => setShowUserList((prev) => !prev)}
              >
                사용자 목록
              </button>
              <span className="checklist-user-label">{selectedUserLabel}</span>
              {showUserList && (
                <div className="checklist-user-list">
                  {users.length === 0 ? (
                    <div className="checklist-user-empty">사용자가 없습니다.</div>
                  ) : (
                    users.map((u) => (
                      <button
                        type="button"
                        key={u.id}
                        className={`checklist-user-item${u.id === selectedUserId ? " active" : ""}`}
                        onClick={() => {
                          setSelectedUserId(u.id);
                          setShowUserList(false);
                        }}
                      >
                        <span>{u.name}</span>
                        <span className="checklist-user-role">{u.role}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          {isAdmin && (
            <button
              type="button"
              className="checklist-user-button"
              onClick={() => setShowCopyPanel((prev) => !prev)}
            >
              {showCopyPanel ? "복사 닫기" : "내용 복사"}
            </button>
          )}
          <button type="button" className="checklist-close-button" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>

      {isAdmin && showCopyPanel && (
        <div className="checklist-copy-panel">
          <div className="checklist-copy-section">
            <h4>원본 사용자 선택</h4>
            <div className="checklist-copy-list">
              {users.length === 0 ? (
                <div className="checklist-user-empty">사용자가 없습니다.</div>
              ) : (
                users.map((u) => (
                  <button
                    type="button"
                    key={u.id}
                    className={`checklist-copy-item${u.id === copySourceUserId ? " active" : ""}`}
                    onClick={() => setCopySourceUserId(u.id)}
                  >
                    <span>{u.name}</span>
                    <span className="checklist-user-role">{u.role}</span>
                  </button>
                ))
              )}
            </div>
            <div className="checklist-copy-hint">선택된 원본: {copySourceLabel}</div>
          </div>

          <div className="checklist-copy-section">
            <h4>복사할 카테고리</h4>
            <div className="checklist-copy-categories">
              {["일일 업무", "주간 업무", "월간 업무"].map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`checklist-copy-chip${copyCategories.includes(category) ? " active" : ""}`}
                  onClick={() =>
                    setCopyCategories((prev) =>
                      prev.includes(category)
                        ? prev.filter((c) => c !== category)
                        : [...prev, category]
                    )
                  }
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="checklist-copy-section">
            <h4>복사 대상 사용자</h4>
            <div className="checklist-copy-list">
              {users.length === 0 ? (
                <div className="checklist-user-empty">사용자가 없습니다.</div>
              ) : (
                users.map((u) => (
                  <button
                    type="button"
                    key={u.id}
                    className={`checklist-copy-item${copyTargetUserIds.includes(u.id) ? " active" : ""}`}
                    onClick={() =>
                      setCopyTargetUserIds((prev) =>
                        prev.includes(u.id)
                          ? prev.filter((id) => id !== u.id)
                          : [...prev, u.id]
                      )
                    }
                  >
                    <span>{u.name}</span>
                    <span className="checklist-user-role">{u.role}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="checklist-copy-actions">
            <button type="button" onClick={handleCopyContent}>
              복사 실행
            </button>
          </div>
        </div>
      )}

      <div className="checklist-settings-controls">
        {selectedCategory === "일일 업무" && (
          <div className="checklist-time-picker">
            <span>시간</span>
            <select value={selectedHour} onChange={(event) => setSelectedHour(event.target.value)}>
              {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((hour) => (
                <option key={hour} value={hour}>
                  {hour}시
                </option>
              ))}
            </select>
            <select value={selectedMinute} onChange={(event) => setSelectedMinute(event.target.value)}>
              {["00", "30", "50"].map((minute) => (
                <option key={minute} value={minute}>
                  {minute}분
                </option>
              ))}
            </select>
          </div>
        )}
        {selectedCategory === "주간 업무" && (
          <div className="checklist-weekday-picker">
            <span>요일</span>
            {["월", "화", "수", "목", "금", "토", "일"].map((day) => (
              <button
                key={day}
                type="button"
                className={`checklist-weekday-button${selectedWeekday === day ? " active" : ""}`}
                onClick={() => setSelectedWeekday(day)}
              >
                {day}
              </button>
            ))}
          </div>
        )}
        {selectedCategory === "월간 업무" && (
          <div className="checklist-monthday-picker">
            <div className="checklist-monthday-header">
              <span>날짜</span>
              <span className="checklist-monthday-hint">Ctrl+클릭으로 다중 선택</span>
            </div>
            <div className="checklist-monthday-grid">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <button
                  key={day}
                  type="button"
                  className={`checklist-monthday-button${selectedMonthDays.includes(day) ? " active" : ""}`}
                  onClick={(event) => {
                    if (event.ctrlKey || event.metaKey) {
                      setSelectedMonthDays((prev) =>
                        prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
                      );
                      return;
                    }
                    setSelectedMonthDays([day]);
                  }}
                >
                  {day}일
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="checklist-create">
          <input
            type="text"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="업무 리스트 항목을 입력하세요"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAddItem();
              }
            }}
          />
          <button type="button" onClick={handleAddItem}>
            추가
          </button>
        </div>
      </div>

      {status && <div className="checklist-status">{status}</div>}

      <div className="checklist-items">
        {isLoading ? (
          <div className="checklist-empty">불러오는 중...</div>
        ) : items.length === 0 ? (
          <div className="checklist-empty">등록된 항목이 없습니다.</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className={`checklist-item${item.done ? " done" : ""}`}>
              <label className="checklist-item-main">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => handleToggleDone(item)}
                />
                {editingId === item.id ? (
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(event) => setEditingTitle(event.target.value)}
                  />
                ) : (
                  <span>
                    <span className="checklist-item-time">
                      {item.category === "주간 업무"
                        ? `${item.weekday || "--"}요일`
                        : item.category === "월간 업무"
                        ? `${(item.monthDays && item.monthDays.length > 0 ? item.monthDays : item.monthDay ? [item.monthDay] : [])
                            .sort((a, b) => a - b)
                            .join(",") || "--"}일`
                        : `${typeof item.hour === "number" ? String(item.hour).padStart(2, "0") : "--"}:${typeof item.minute === "number" ? String(item.minute).padStart(2, "0") : "--"}`}
                    </span>
                    {item.title}
                  </span>
                )}
              </label>
              <div className="checklist-item-actions">
                {editingId === item.id ? (
                  <>
                    <button type="button" onClick={() => handleSaveEdit(item)}>
                      저장
                    </button>
                    <button type="button" onClick={cancelEdit}>
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => startEdit(item)}>
                      수정
                    </button>
                    <button type="button" onClick={() => handleDeleteItem(item)}>
                      삭제
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ChecklistSettingsPage;
