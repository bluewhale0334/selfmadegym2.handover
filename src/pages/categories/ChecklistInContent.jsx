import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, Timestamp } from "firebase/firestore";
import { db } from "../../firebase";
import DatePicker from "./DatePicker";
import "./ChecklistInContent.css";

const formatToday = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatShortDate = (dateString) => {
  const [year, month, day] = dateString.split("-");
  return `${month}/${day}`;
};

const getSnapshotDocId = (userId, date) => {
  return `${userId}_${date}`;
};

const formatRepeatItemTime = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "--:--";
  const hour = Math.floor(value);
  const decimal = Math.abs(value - hour);
  const minute = decimal >= 0.5 ? 30 : 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

function ChecklistInContent({ selectedDate, onOpenChecklistSettings, user, profile }) {
  const [dailyItems, setDailyItems] = useState([]);
  const [extraItems, setExtraItems] = useState([]);
  const [repeatItems, setRepeatItems] = useState([]);
  const [newExtraTitle, setNewExtraTitle] = useState("");
  const [editingExtraIndex, setEditingExtraIndex] = useState(null);
  const [editingExtraTitle, setEditingExtraTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [adminUsers, setAdminUsers] = useState([]);
  const [showAdminUserList, setShowAdminUserList] = useState(false);
  const [targetUserId, setTargetUserId] = useState(user?.uid ?? null);
  const [activeDate, setActiveDate] = useState(formatToday);
  const [recentDates, setRecentDates] = useState([]);
  const [recentSnapshots, setRecentSnapshots] = useState({});
  const [availableDates, setAvailableDates] = useState([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDateAdder, setShowDateAdder] = useState(false);
  const [pendingSelectDate, setPendingSelectDate] = useState(formatToday);
  const [pendingAddDate, setPendingAddDate] = useState(formatToday);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const isAdmin = profile?.user_type === "admin";
  const today = formatToday();
  const activeDateValue = activeDate || today;
  const activeDateObj = useMemo(() => new Date(activeDateValue), [activeDateValue]);
  const activeWeekday = useMemo(() => {
    const labels = ["일", "월", "화", "수", "목", "금", "토"];
    return labels[activeDateObj.getDay()] ?? "월";
  }, [activeDateObj]);
  const activeMonthDay = useMemo(() => activeDateObj.getDate(), [activeDateObj]);

  useEffect(() => {
    if (user?.uid) {
      setTargetUserId(user.uid);
    }
  }, [user?.uid]);

  useEffect(() => {
    const base = new Date(today);
    const dates = [];
    for (let i = 0; i < 5; i += 1) {
      const next = new Date(base);
      next.setDate(base.getDate() - i);
      const year = next.getFullYear();
      const month = String(next.getMonth() + 1).padStart(2, "0");
      const day = String(next.getDate()).padStart(2, "0");
      dates.push(`${year}-${month}-${day}`);
    }
    setRecentDates(dates);
  }, [today]);

  useEffect(() => {
    if (!targetUserId || recentDates.length === 0) return;
    const fetchSnapshots = async () => {
      const next = {};
      for (const date of recentDates) {
        const snapshotId = getSnapshotDocId(targetUserId, date);
        const snapshotRef = doc(db, "dailyChecklistSnapshots", snapshotId);
        const snapshotDoc = await getDoc(snapshotRef);
        next[date] = snapshotDoc.exists();
      }
      setRecentSnapshots(next);
    };
    fetchSnapshots();
  }, [targetUserId, recentDates]);

  useEffect(() => {
    if (!targetUserId) return;
    const fetchAvailableDates = async () => {
      try {
        const snapshots = await getDocs(
          query(collection(db, "dailyChecklistSnapshots"), where("userId", "==", targetUserId))
        );
        const next = [];
        snapshots.forEach((docSnap) => {
          const data = docSnap.data();
          if (data?.date) {
            next.push(data.date);
          }
        });
        setAvailableDates(next);
      } catch (error) {
        console.error("Error fetching checklist dates:", error);
      }
    };
    fetchAvailableDates();
  }, [targetUserId]);

  const displayDateLabel = useMemo(() => {
    if (!activeDateValue) return "";
    const [year, month, day] = activeDateValue.split("-");
    return `${year}.${month}.${day}`;
  }, [activeDateValue]);

  useEffect(() => {
    if (!isAdmin) return;
    const fetchUsers = async () => {
      try {
        const q = query(collection(db, "users"), where("user_type", "==", "customer"));
        const snapshot = await getDocs(q);
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
        setAdminUsers(next);
      } catch (error) {
        console.error("Error fetching admin checklist users:", error);
        setStatus("사용자 목록을 불러오지 못했습니다.");
      }
    };
    fetchUsers();
  }, [isAdmin]);

  const selectedUserLabel = useMemo(() => {
    if (!isAdmin) return "내 업무 리스트";
    const match = adminUsers.find((u) => u.id === targetUserId);
    return match ? `${match.name} (${match.role || "직책"})` : "사용자 선택";
  }, [isAdmin, adminUsers, targetUserId]);

  const createSnapshotForDate = async (dateValue) => {
    if (!targetUserId) return false;
    if (!isAdmin && targetUserId !== user?.uid) {
      setStatus("다른 사용자의 날짜 추가는 관리자만 가능합니다.");
      return false;
    }
    const snapshotId = getSnapshotDocId(targetUserId, dateValue);
    const snapshotRef = doc(db, "dailyChecklistSnapshots", snapshotId);
    const existing = await getDoc(snapshotRef);
    if (existing.exists()) {
      setStatus("이미 등록된 날짜입니다.");
      return false;
    }

    const taskQuery = query(
      collection(db, "checklistTasks"),
      where("userId", "==", targetUserId)
    );
    const taskSnapshot = await getDocs(taskQuery);
    const items = [];
    taskSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      items.push({
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
        done: false,
      });
    });

    const repeatQuery = query(
      collection(db, "repeatChecklistTasks"),
      where("userId", "==", targetUserId)
    );
    const repeatSnapshot = await getDocs(repeatQuery);
    const repeatItems = [];
    repeatSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const hours = Array.isArray(data.hours) ? data.hours : [];
      hours.forEach((hour) => {
        repeatItems.push({
          title: data.title || "",
          hour,
          minute: 0,
          done: false,
          completedAt: null,
        });
      });
    });

    await setDoc(snapshotRef, {
      userId: targetUserId,
      date: dateValue,
      createdAt: Timestamp.now(),
      items,
      extraItems: [],
      repeatItems,
    });
    return true;
  };

  useEffect(() => {
    if (!targetUserId) return;
    const loadDailyChecklist = async () => {
      setIsLoading(true);
      setStatus("");
      const snapshotId = getSnapshotDocId(targetUserId, activeDateValue);
      const snapshotRef = doc(db, "dailyChecklistSnapshots", snapshotId);
      try {
        const snapshotDoc = await getDoc(snapshotRef);
        if (snapshotDoc.exists()) {
          const data = snapshotDoc.data();
          const nextDailyItems = Array.isArray(data.items) ? data.items : [];
          const nextExtraItems = Array.isArray(data.extraItems) ? data.extraItems : [];
          const existingRepeatItems = Array.isArray(data.repeatItems) ? data.repeatItems : [];
          setDailyItems(nextDailyItems);
          setExtraItems(nextExtraItems);

          if (activeDateValue === today) {
            const repeatQuery = query(
              collection(db, "repeatChecklistTasks"),
              where("userId", "==", targetUserId)
            );
            const repeatSnapshot = await getDocs(repeatQuery);
            const repeatItems = [];
            repeatSnapshot.forEach((docSnap) => {
              const repeatData = docSnap.data();
              const hours = Array.isArray(repeatData.hours) ? repeatData.hours : [];
              hours.forEach((hour) => {
                repeatItems.push({
                  title: repeatData.title || "",
                  hour,
                  minute: 0,
                  done: false,
                  completedAt: null,
                });
              });
            });

            const existingMap = new Map(
              existingRepeatItems.map((item) => [
                `${item.title}-${item.hour}-${item.minute ?? 0}`,
                item,
              ])
            );
            const mergedRepeatItems = repeatItems.map((item) => {
              const key = `${item.title}-${item.hour}-${item.minute ?? 0}`;
              const saved = existingMap.get(key);
              return saved ? { ...item, done: saved.done, completedAt: saved.completedAt } : item;
            });
            setRepeatItems(mergedRepeatItems);

            if (mergedRepeatItems.length !== existingRepeatItems.length) {
              await updateDoc(snapshotRef, {
                repeatItems: mergedRepeatItems,
                updatedAt: Timestamp.now(),
              });
            }
          } else {
            setRepeatItems(existingRepeatItems);
          }

          setIsLoading(false);
          return;
        }

        if (activeDateValue !== today) {
          setDailyItems([]);
          setExtraItems([]);
          setRepeatItems([]);
          setStatus("선택한 날짜의 업무 리스트가 없습니다.");
          setIsLoading(false);
          return;
        }

        if (targetUserId !== user?.uid) {
          setDailyItems([]);
          setExtraItems([]);
          setRepeatItems([]);
          setStatus("선택한 사용자의 오늘 업무 리스트가 아직 생성되지 않았습니다.");
          setIsLoading(false);
          return;
        }

        const taskQuery = query(
          collection(db, "checklistTasks"),
          where("userId", "==", targetUserId)
        );
        const taskSnapshot = await getDocs(taskQuery);
        const items = [];
        taskSnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          items.push({
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
            done: false,
          });
        });

        const repeatQuery = query(
          collection(db, "repeatChecklistTasks"),
          where("userId", "==", targetUserId)
        );
        const repeatSnapshot = await getDocs(repeatQuery);
        const repeatItems = [];
        repeatSnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const hours = Array.isArray(data.hours) ? data.hours : [];
          hours.forEach((hour) => {
            repeatItems.push({
              title: data.title || "",
              hour,
              minute: 0,
              done: false,
              completedAt: null,
            });
          });
        });

        await setDoc(snapshotRef, {
          userId: targetUserId,
          date: activeDateValue,
          createdAt: Timestamp.now(),
          items,
          extraItems: [],
          repeatItems,
        });
        setDailyItems(items);
        setExtraItems([]);
        setRepeatItems(repeatItems);
      } catch (error) {
        console.error("Error loading daily checklist:", error);
        setStatus("업무 리스트를 불러오지 못했습니다.");
      } finally {
        setIsLoading(false);
      }
    };

    loadDailyChecklist();
  }, [targetUserId, activeDateValue, today, user?.uid, nowTick]);

  useEffect(() => {
    let timeoutId;
    const schedule = () => {
      const now = new Date();
      const next = new Date(now);
      next.setMinutes(1, 0, 0);
      if (now >= next) {
        next.setHours(now.getHours() + 1, 1, 0, 0);
      }
      const delay = Math.max(0, next.getTime() - now.getTime());
      timeoutId = setTimeout(() => {
        setNowTick(Date.now());
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, []);

  const persistSnapshot = async (dateValue, nextItems, nextExtraItems, nextRepeatItems) => {
    if (!targetUserId) return;
    const snapshotId = getSnapshotDocId(targetUserId, dateValue);
    const snapshotRef = doc(db, "dailyChecklistSnapshots", snapshotId);
    await updateDoc(snapshotRef, {
      items: nextItems,
      extraItems: nextExtraItems,
      repeatItems: nextRepeatItems,
      updatedAt: Timestamp.now(),
    });
  };

  const handleToggleDone = async (index, type = "main") => {
    if (!targetUserId) return;
    const now = new Date();
    const completedAt = `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;
    const nextItems = dailyItems.map((item, itemIndex) =>
      itemIndex === index && type === "main"
        ? {
            ...item,
            done: !item.done,
            completedAt: item.done ? null : completedAt,
          }
        : item
    );
    const nextExtraItems = extraItems.map((item, itemIndex) =>
      itemIndex === index && type === "extra"
        ? {
            ...item,
            done: !item.done,
            completedAt: item.done ? null : completedAt,
          }
        : item
    );
    const nextRepeatItems = repeatItems.map((item, itemIndex) =>
      itemIndex === index && type === "repeat"
        ? {
            ...item,
            done: !item.done,
            completedAt: item.done ? null : completedAt,
          }
        : item
    );
    if (type === "main") {
      setDailyItems(nextItems);
    } else if (type === "extra") {
      setExtraItems(nextExtraItems);
    } else {
      setRepeatItems(nextRepeatItems);
    }
    try {
      await persistSnapshot(activeDateValue, nextItems, nextExtraItems, nextRepeatItems);
    } catch (error) {
      console.error("Error updating daily checklist:", error);
      setStatus("업무 리스트 저장에 실패했습니다.");
    }
  };

  const handleAddExtraItem = async () => {
    if (!newExtraTitle.trim()) {
      setStatus("추가 업무 리스트 내용을 입력해주세요.");
      return;
    }
    const nextExtraItems = [
      ...extraItems,
      {
        title: newExtraTitle.trim(),
        done: false,
        completedAt: null,
      },
    ];
    setExtraItems(nextExtraItems);
    setNewExtraTitle("");
    try {
      await persistSnapshot(activeDateValue, dailyItems, nextExtraItems, repeatItems);
    } catch (error) {
      console.error("Error adding extra checklist:", error);
      setStatus("추가 업무 리스트 저장에 실패했습니다.");
    }
  };

  const handleDeleteExtraItem = async (index) => {
    const nextExtraItems = extraItems.filter((_, itemIndex) => itemIndex !== index);
    setExtraItems(nextExtraItems);
    try {
      await persistSnapshot(activeDateValue, dailyItems, nextExtraItems, repeatItems);
    } catch (error) {
      console.error("Error deleting extra checklist:", error);
      setStatus("추가 업무 리스트 삭제에 실패했습니다.");
    }
  };

  const handleStartEditExtra = (index) => {
    setEditingExtraIndex(index);
    setEditingExtraTitle(extraItems[index]?.title || "");
  };

  const handleCancelEditExtra = () => {
    setEditingExtraIndex(null);
    setEditingExtraTitle("");
  };

  const handleSaveEditExtra = async (index) => {
    if (!editingExtraTitle.trim()) {
      setStatus("추가 업무 리스트 내용을 입력해주세요.");
      return;
    }
    const nextExtraItems = extraItems.map((item, itemIndex) =>
      itemIndex === index ? { ...item, title: editingExtraTitle.trim() } : item
    );
    setExtraItems(nextExtraItems);
    handleCancelEditExtra();
    try {
      await persistSnapshot(activeDateValue, dailyItems, nextExtraItems, repeatItems);
    } catch (error) {
      console.error("Error updating extra checklist:", error);
      setStatus("추가 업무 리스트 수정에 실패했습니다.");
    }
  };

  const groupedItems = useMemo(() => {
    const categoryOrder = ["일일 업무", "주간 업무", "월간 업무"];
    const grouped = {
      "일일 업무": [],
      "주간 업무": [],
      "월간 업무": [],
    };

    dailyItems.forEach((item) => {
      const category = item.category || "일일 업무";
      if (category === "주간 업무") {
        if (item.weekday !== activeWeekday) return;
      } else if (category === "월간 업무") {
        if (!Array.isArray(item.monthDays) || !item.monthDays.includes(activeMonthDay)) return;
      }
      if (grouped[category]) {
        grouped[category].push(item);
      }
    });

    const sortByTime = (a, b) => {
      const aHour = typeof a.hour === "number" ? a.hour : 99;
      const bHour = typeof b.hour === "number" ? b.hour : 99;
      if (aHour !== bHour) return aHour - bHour;
      const aMin = typeof a.minute === "number" ? a.minute : 99;
      const bMin = typeof b.minute === "number" ? b.minute : 99;
      if (aMin !== bMin) return aMin - bMin;
      return 0;
    };

    const pending = categoryOrder.map((category) => ({
      category,
      items: grouped[category].filter((item) => !item.done).sort(sortByTime),
    }));

    const completed = [...dailyItems, ...extraItems, ...repeatItems]
      .filter((item) => item.done)
      .sort((a, b) => {
        const aTime = a.completedAt || "";
        const bTime = b.completedAt || "";
        return aTime.localeCompare(bTime);
      });

    return { pending, completed };
  }, [dailyItems, extraItems, repeatItems, activeWeekday, activeMonthDay]);

  const visibleRepeatItems = useMemo(() => {
    if (activeDateValue !== today) return [];
    const now = new Date(nowTick);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return repeatItems.filter((item) => {
      if (item.done) return false;
      if (typeof item.hour !== "number") return false;
      const minute = typeof item.minute === "number" ? item.minute : 0;
      const itemMinutes = item.hour * 60 + minute;
      return itemMinutes >= nowMinutes - 60 && itemMinutes <= nowMinutes + 60;
    });
  }, [repeatItems, nowTick, activeDateValue, today]);
  return (
    <section className="checklist-overview">
      <div className="checklist-date-indicator">
        <button
          type="button"
          className="checklist-date-button"
          onClick={() => {
            setPendingSelectDate(activeDateValue);
            setShowDatePicker((prev) => !prev);
            setShowDateAdder(false);
          }}
        >
          {activeDateValue === today ? "날짜 선택" : displayDateLabel}
        </button>
        {showDatePicker && (
          <DatePicker
            selectedDate={pendingSelectDate}
            highlightedDates={availableDates}
            onSelect={(date) => {
              setActiveDate(date);
              setPendingSelectDate(date);
              setShowDatePicker(false);
            }}
            onClose={() => setShowDatePicker(false)}
          />
        )}
        <button
          type="button"
          className="checklist-date-button"
          onClick={() => {
            setPendingAddDate(today);
            setShowDateAdder((prev) => !prev);
            setShowDatePicker(false);
          }}
        >
          날짜 추가
        </button>
        {showDateAdder && (
          <div className="checklist-date-popover">
            <input
              type="date"
              value={pendingAddDate}
              onChange={(event) => setPendingAddDate(event.target.value)}
            />
            <button
              type="button"
              onClick={async () => {
                const created = await createSnapshotForDate(pendingAddDate);
                if (created) {
                  setActiveDate(pendingAddDate);
                  setRecentSnapshots((prev) => ({ ...prev, [pendingAddDate]: true }));
                }
                setShowDateAdder(false);
              }}
            >
              추가
            </button>
          </div>
        )}
        <div className="checklist-recent-dates">
          {recentDates.map((date) => {
            const hasSnapshot = recentSnapshots[date];
            if (!hasSnapshot) return null;
            return (
              <button
                key={date}
                type="button"
                className={`checklist-date-button checklist-recent-button${
                  date === activeDateValue ? " active" : ""
                }`}
                onClick={() => setActiveDate(date)}
              >
                {formatShortDate(date)}
              </button>
            );
          })}
        </div>
        {isAdmin && (
          <div className="checklist-admin-user">
            <button
              type="button"
              className="checklist-date-button"
              onClick={() => setShowAdminUserList((prev) => !prev)}
            >
              사용자 선택
            </button>
            <span className="checklist-admin-user-label">{selectedUserLabel}</span>
            {showAdminUserList && (
              <div className="checklist-admin-user-list">
                {adminUsers.length === 0 ? (
                  <div className="checklist-admin-user-empty">사용자가 없습니다.</div>
                ) : (
                  adminUsers.map((adminUser) => (
                    <button
                      type="button"
                      key={adminUser.id}
                      className={`checklist-admin-user-item${
                        adminUser.id === targetUserId ? " active" : ""
                      }`}
                      onClick={() => {
                        setTargetUserId(adminUser.id);
                        setShowAdminUserList(false);
                      }}
                    >
                      <span>{adminUser.name}</span>
                      <span className="checklist-admin-user-role">{adminUser.role}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="checklist-layout">
        <div className="checklist-left">
          <div className="checklist-box checklist-left-inner checklist-left-split">
            <div className="checklist-section">
              <div className="checklist-section-header checklist-section-header-tight">
                <h1 className="checklist-box-title">일일 업무</h1>
                <button
                  type="button"
                  className="checklist-section-button checklist-section-button-gear"
                  data-label="업무관리 설정"
                  aria-label="업무관리 설정"
                  onClick={onOpenChecklistSettings}
                >
                  <span className="checklist-section-button-icon" aria-hidden="true">⚙</span>
                </button>
              </div>
              {isLoading ? (
                <p className="checklist-box-body">불러오는 중...</p>
              ) : dailyItems.length === 0 ? (
                <p className="checklist-box-body">등록된 항목이 없습니다.</p>
              ) : (
                <div className="checklist-daily-items">
                  {groupedItems.pending.map(({ category, items }) =>
                    items.length === 0 ? null : (
                      <div key={category} className="checklist-daily-group">
                        <div className="checklist-daily-group-title">{category}</div>
                        {items.map((item, index) => (
                          <label
                            key={`${category}-${item.title}-${index}`}
                            className={`checklist-daily-item${item.done ? " done" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={item.done}
                              onChange={() => handleToggleDone(dailyItems.indexOf(item), "main")}
                            />
                            <span className="checklist-daily-item-meta">
                              {typeof item.hour === "number" && typeof item.minute === "number"
                                ? `${String(item.hour).padStart(2, "0")}:${String(item.minute).padStart(2, "0")}`
                                : "--:--"}
                            </span>
                            <span className="checklist-daily-item-title">{item.title}</span>
                          </label>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
            <div className="checklist-section-divider" aria-hidden="true" />
            <div className="checklist-section">
              <div className="checklist-section-header">
                <h1 className="checklist-box-title">추가 업무 리스트</h1>
              </div>
              <div className="checklist-extra-create">
                <input
                  type="text"
                  value={newExtraTitle}
                  onChange={(event) => setNewExtraTitle(event.target.value)}
                  placeholder="추가 업무 리스트를 입력하세요"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddExtraItem();
                    }
                  }}
                />
                <button type="button" onClick={handleAddExtraItem}>
                  추가
                </button>
              </div>
              {extraItems.length === 0 ? (
                <p className="checklist-box-body">등록된 항목이 없습니다.</p>
              ) : (
                <div className="checklist-extra-items">
                  {extraItems.filter((item) => !item.done).map((item, index) => (
                    <div key={`extra-${index}`} className="checklist-extra-item">
                      <label className={`checklist-daily-item${item.done ? " done" : ""}`}>
                        <input
                          type="checkbox"
                          checked={item.done}
                          onChange={() => handleToggleDone(index, "extra")}
                        />
                        {editingExtraIndex === index ? (
                          <input
                            type="text"
                            value={editingExtraTitle}
                            onChange={(event) => setEditingExtraTitle(event.target.value)}
                            className="checklist-extra-edit-input"
                          />
                        ) : (
                          <span className="checklist-daily-item-title">{item.title}</span>
                        )}
                      </label>
                      <div className="checklist-extra-actions">
                        {editingExtraIndex === index ? (
                          <>
                            <button type="button" onClick={() => handleSaveEditExtra(index)}>
                              저장
                            </button>
                            <button type="button" onClick={handleCancelEditExtra}>
                              취소
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => handleStartEditExtra(index)}>
                              수정
                            </button>
                            <button type="button" onClick={() => handleDeleteExtraItem(index)}>
                              삭제
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="checklist-section-divider" aria-hidden="true" />
              <div className="checklist-section-header checklist-section-header-tight">
                <h2 className="checklist-box-title">반복 업무</h2>
              </div>
              {visibleRepeatItems.length === 0 ? (
                <p className="checklist-box-body">등록된 반복 업무가 없습니다.</p>
              ) : (
                <div className="checklist-extra-items">
                  {visibleRepeatItems.map((item, index) => (
                    <div key={`repeat-${index}`} className="checklist-extra-item">
                      <label className={`checklist-daily-item${item.done ? " done" : ""}`}>
                        <input
                          type="checkbox"
                          checked={item.done}
                          onChange={() => handleToggleDone(repeatItems.indexOf(item), "repeat")}
                        />
                        <span className="checklist-daily-item-meta">
                          {formatRepeatItemTime(item.hour)}
                        </span>
                        <span className="checklist-daily-item-title">{item.title}</span>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="checklist-right">
          <div className="checklist-box checklist-complete">
            <h3 className="checklist-box-title">완료 항목</h3>
            {isLoading ? (
              <p className="checklist-box-body">불러오는 중...</p>
            ) : groupedItems.completed.length === 0 ? (
              <p className="checklist-box-body">완료된 항목이 없습니다.</p>
            ) : (
              <div className="checklist-done-items">
                {groupedItems.completed.map((item, index) => (
                  <label
                    key={`done-${item.title}-${index}`}
                    className="checklist-done-item"
                  >
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => {
                        const index = dailyItems.indexOf(item);
                        if (index === -1) {
                          const extraIndex = extraItems.indexOf(item);
                          if (extraIndex !== -1) {
                            handleToggleDone(extraIndex, "extra");
                          }
                          const repeatIndex = repeatItems.indexOf(item);
                          if (repeatIndex !== -1) {
                            handleToggleDone(repeatIndex, "repeat");
                          }
                          return;
                        }
                        handleToggleDone(index, "main");
                      }}
                    />
                    <span className="checklist-done-title">{item.title}</span>
                    <span className="checklist-done-time">
                      완료시간:{item.completedAt || "--:--"}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default ChecklistInContent;
