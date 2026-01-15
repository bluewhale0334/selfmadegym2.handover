import { useEffect, useMemo, useState } from "react";
import { signOut } from "firebase/auth";
import { doc, getDoc, collection, query, where, orderBy, onSnapshot, addDoc, getDocs, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import DatePicker from "./categories/DatePicker";
import "./DashboardPage.css";
import DashboardContent from "./categories/DashboardContent";
import NoticeContent from "./categories/NoticeContent";
import InstructionContent from "./categories/InstructionContent";
import HandoverContent from "./categories/HandoverContent";
import ProgressContent from "./categories/ProgressContent";
import ChecklistContent from "./categories/ChecklistContent";

function DashboardPage({ user }) {
  const [profile, setProfile] = useState(null);
  const [activeCategory, setActiveCategory] = useState("대쉬보드");
  const [activeDate, setActiveDate] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerCategory, setDatePickerCategory] = useState(null);
  const [visibleDateCounts, setVisibleDateCounts] = useState({}); // 각 카테고리별 표시할 날짜 개수
  const [globalRefreshKey, setGlobalRefreshKey] = useState(0); // 전역 리프레시 키

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

  const categories = useMemo(
    () => [
      { label: "대쉬보드", type: "dashboard", hasDates: false },
      { label: "전체 공지", type: "notice", hasDates: false },
      { label: "업무 지시", type: "instruction", hasDates: true },
      { label: "일일 인수인계", type: "handover", hasDates: true },
      { label: "업무 진행사항", type: "progress", hasDates: true },
      { label: "업무 체크리스트", type: "checklist", hasDates: true },
    ],
    []
  );

  const [dateLists, setDateLists] = useState({
    "업무 지시": [],
    "일일 인수인계": [],
    "업무 진행사항": [],
    "업무 체크리스트": [],
  });

  // Firestore에서 날짜 목록 가져오기 (실시간 업데이트)
  useEffect(() => {
    if (!user) return;

    const categoryCollections = {
      "업무 지시": "instructions",
      "일일 인수인계": "handovers",
      "업무 진행사항": "progresses",
      "업무 체크리스트": "checklists",
    };

    const unsubscribes = [];

    for (const [category, collectionName] of Object.entries(categoryCollections)) {
      // globalRefreshKey가 변경되면 리스너 재구독
      try {
        let q;
        if (category === "업무 체크리스트") {
          // 체크리스트는 userId로만 필터링하고, 정렬은 클라이언트에서 처리 (인덱스 불필요)
          q = query(
            collection(db, collectionName),
            where("userId", "==", user.uid)
          );
        } else {
          q = query(collection(db, collectionName), orderBy("date", "desc"));
        }

        const unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const dates = new Set();
            snapshot.forEach((doc) => {
              const data = doc.data();
              if (data.date) {
                dates.add(data.date);
              }
            });
            setDateLists((prev) => ({
              ...prev,
              [category]: Array.from(dates).sort().reverse(),
            }));
          },
          (error) => {
            console.error(`Error fetching dates for ${category}:`, error);
            console.error("Error code:", error.code);
            console.error("Error message:", error.message);
            if (error.code === "failed-precondition") {
              console.warn(`인덱스가 필요합니다. Firebase 콘솔에서 인덱스를 생성해주세요.`);
            }
          }
        );

        unsubscribes.push(unsubscribe);
      } catch (error) {
        console.error(`Error setting up listener for ${category}:`, error);
      }
    }

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [user, globalRefreshKey]); // globalRefreshKey 추가

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}월 ${day}일`;
  };

  const handleCategoryClick = (categoryLabel) => {
    // 전체보기만 수행 (토글은 하지 않음)
    setActiveCategory(categoryLabel);
    setActiveDate(null);
  };

  const handleToggleCategory = (categoryLabel, event) => {
    // 토글만 수행 (전체보기는 하지 않음)
    event.stopPropagation();
    if (categories.find((c) => c.label === categoryLabel)?.hasDates) {
      setExpandedCategories((prev) => {
        const isExpanding = !prev[categoryLabel];
        // 카테고리를 펼칠 때 초기 표시 개수 설정 (5개)
        if (isExpanding) {
          setVisibleDateCounts((prevCounts) => ({
            ...prevCounts,
            [categoryLabel]: 5,
          }));
        }
        return {
          ...prev,
          [categoryLabel]: isExpanding,
        };
      });
    }
  };

  const handleShowMoreDates = (categoryLabel) => {
    setVisibleDateCounts((prev) => {
      const currentCount = prev[categoryLabel] || 5;
      return {
        ...prev,
        [categoryLabel]: currentCount + 5,
      };
    });
  };

  const handleShowLessDates = (categoryLabel) => {
    setVisibleDateCounts((prev) => ({
      ...prev,
      [categoryLabel]: 5,
    }));
  };

  const handleDateClick = (categoryLabel, date) => {
    setActiveCategory(categoryLabel);
    setActiveDate(date);
  };

  const handleAddDateClick = (categoryLabel, event) => {
    event.stopPropagation();
    setDatePickerCategory(categoryLabel);
    setShowDatePicker(true);
  };

  const handleDatePickerSelect = async (date) => {
    if (datePickerCategory && user) {
      const categoryCollections = {
        "업무 지시": "instructions",
        "일일 인수인계": "handovers",
        "업무 진행사항": "progresses",
        "업무 체크리스트": "checklists",
      };

      const collectionName = categoryCollections[datePickerCategory];
      
      if (collectionName) {
        try {
          // 해당 날짜에 문서가 있는지 확인
          let checkQuery;
          if (datePickerCategory === "업무 체크리스트") {
            checkQuery = query(
              collection(db, collectionName),
              where("userId", "==", user.uid),
              where("date", "==", date),
              orderBy("createdAt", "desc")
            );
          } else {
            checkQuery = query(
              collection(db, collectionName),
              where("date", "==", date),
              orderBy("createdAt", "desc")
            );
          }

          const snapshot = await getDocs(checkQuery);
          
          // 해당 날짜에 문서가 없으면 빈 플래그 문서 생성
          if (snapshot.empty) {
            const flagDoc = {
              date: date,
              isDateFlag: true, // 날짜 플래그임을 표시
              createdAt: serverTimestamp(),
            };

            if (datePickerCategory === "업무 체크리스트") {
              flagDoc.userId = user.uid;
              flagDoc.authorId = user.uid;
            } else {
              flagDoc.authorId = user.uid;
            }

            await addDoc(collection(db, collectionName), flagDoc);
            console.log("Date flag document created for:", date);
          }
        } catch (error) {
          console.error("Error creating date flag:", error);
          // 에러가 발생해도 날짜 선택은 진행
        }
      }
      
      setActiveCategory(datePickerCategory);
      setActiveDate(date);
      setExpandedCategories((prev) => ({
        ...prev,
        [datePickerCategory]: true,
      }));
      setShowDatePicker(false);
      setDatePickerCategory(null);
    }
  };

  const isDateCategoryActive = (categoryLabel, date) => {
    return activeCategory === categoryLabel && activeDate === date;
  };

  const isCategoryActive = (categoryLabel) => {
    return activeCategory === categoryLabel && activeDate === null;
  };

  const renderContent = () => {
    const currentCategory = categories.find((c) => c.label === activeCategory);
    if (!currentCategory) return <DashboardContent />;

    const handleNavigateToCategory = (categoryLabel) => {
      setActiveCategory(categoryLabel);
      setActiveDate(null);
      if (categories.find((c) => c.label === categoryLabel)?.hasDates) {
        setExpandedCategories((prev) => ({
          ...prev,
          [categoryLabel]: true,
        }));
      }
    };

    const handleDateSelect = (categoryLabel, date) => {
      setActiveCategory(categoryLabel);
      setActiveDate(date);
      setExpandedCategories((prev) => ({
        ...prev,
        [categoryLabel]: true,
      }));
    };

    const props = {
      category: activeCategory,
      selectedDate: activeDate,
      user: user,
      profile: profile,
      onNavigateToCategory: handleNavigateToCategory,
      onDateSelect: handleDateSelect,
      globalRefreshKey: globalRefreshKey,
      onRefresh: () => setGlobalRefreshKey((prev) => prev + 1),
    };

    switch (activeCategory) {
      case "대쉬보드":
        return <DashboardContent />;
      case "전체 공지":
        return <NoticeContent {...props} />;
      case "업무 지시":
        return <InstructionContent {...props} />;
      case "일일 인수인계":
        return <HandoverContent {...props} />;
      case "업무 진행사항":
        return <ProgressContent {...props} />;
      case "업무 체크리스트":
        return <ChecklistContent {...props} />;
      default:
        return <DashboardContent />;
    }
  };

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) {
        setProfile(null);
        return;
      }
      try {
        const snapshot = await getDoc(doc(db, "users", user.uid));
        if (snapshot.exists()) {
          setProfile(snapshot.data());
        }
      } catch (error) {
        console.error(error);
      }
    };

    fetchProfile();
  }, [user]);

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <h1>selfmadegym2</h1>
        <div className="dashboard-category">
          {activeDate
            ? `${activeCategory} > ${formatDate(activeDate)}`
            : activeCategory}
        </div>
        <div className="dashboard-actions">
          <button className="profile-button" type="button">
            <span
              className="profile-dot"
              style={{
                backgroundColor: tagColors[profile?.tagColor] ?? "#d9c5a5",
              }}
              aria-hidden="true"
            />
            <span>
              {profile?.name ?? user?.displayName ?? "사용자"} -{" "}
              {profile?.role ?? "직책"}
            </span>
          </button>
          <button
            className="logout-button"
            type="button"
            onClick={async () => {
              try {
                await signOut(auth);
              } catch (error) {
                console.error(error);
              }
            }}
          >
            로그아웃
          </button>
        </div>
      </header>
      <div className="dashboard-body">
        <aside className="dashboard-sidebar">
          <nav>
            {categories.map((category) => {
              const isExpanded = expandedCategories[category.label];
              const dates = dateLists[category.label] || [];
              const hasDates = category.hasDates && dates.length > 0;

              return (
                <div key={category.label} className="nav-category-group">
                  <div
                    className={[
                      "nav-item",
                      isCategoryActive(category.label) ? "active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <button
                      type="button"
                      className="nav-item-label"
                      onClick={() => handleCategoryClick(category.label)}
                    >
                      <span>{category.label}</span>
                    </button>
                    <div className="nav-item-right">
                      {hasDates && (
                        <button
                          type="button"
                          className="nav-toggle-button"
                          onClick={(e) => handleToggleCategory(category.label, e)}
                          aria-label={isExpanded ? "접기" : "펼치기"}
                        >
                          <span className="nav-expand-icon">
                            {isExpanded ? "▼" : "▶"}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                  {hasDates && isExpanded && (
                    <div className="nav-sub-items">
                      {dates
                        .slice(0, visibleDateCounts[category.label] || 5)
                        .map((date) => (
                          <button
                            key={date}
                            className={[
                              "nav-sub-item",
                              isDateCategoryActive(category.label, date)
                                ? "active"
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            type="button"
                            onClick={() => handleDateClick(category.label, date)}
                          >
                            {formatDate(date)}
                          </button>
                        ))}
                      {(dates.length > (visibleDateCounts[category.label] || 5) ||
                        (visibleDateCounts[category.label] || 5) > 5) && (
                        <div className="nav-show-buttons">
                          {dates.length > (visibleDateCounts[category.label] || 5) && (
                            <button
                              type="button"
                              className="nav-show-more-button"
                              onClick={() => handleShowMoreDates(category.label)}
                            >
                              ▼ 더보기
                            </button>
                          )}
                          {(visibleDateCounts[category.label] || 5) > 5 && (
                            <button
                              type="button"
                              className="nav-show-less-button"
                              onClick={() => handleShowLessDates(category.label)}
                            >
                              ▲ 접기
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </aside>
        {showDatePicker && (
          <DatePicker
            selectedDate={null}
            onSelect={handleDatePickerSelect}
            onClose={() => {
              setShowDatePicker(false);
              setDatePickerCategory(null);
            }}
          />
        )}
        <main className="dashboard-main">
          <section className="dashboard-content">
            {renderContent()}
          </section>
        </main>
      </div>
    </div>
  );
}

export default DashboardPage;
