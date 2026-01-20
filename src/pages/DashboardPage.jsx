import { useEffect, useMemo, useState, useRef } from "react";
import { signOut, signInWithEmailAndPassword } from "firebase/auth";
import { doc, collection, query, where, orderBy, onSnapshot, addDoc, getDocs, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import DatePicker from "./categories/DatePicker";
import "./DashboardPage.css";
import DashboardContent from "./categories/DashboardContent";
import NoticeContent from "./categories/NoticeContent";
import InstructionContent from "./categories/InstructionContent";
import HandoverContent from "./categories/HandoverContent";
import ProgressContent from "./categories/ProgressContent";
import ChecklistContent from "./categories/ChecklistContent";
import ProfilePage from "./ProfilePage";
import SettingsPage from "./SettingsPage";

function DashboardPage({ user, onShowAuthPage }) {
  const [profile, setProfile] = useState(null);
  const [activeCategory, setActiveCategory] = useState("대시보드");
  const [activeDate, setActiveDate] = useState(null);
  const [activeSubCategory, setActiveSubCategory] = useState(null); // 전체 공지 하위 카테고리
  const [expandedCategories, setExpandedCategories] = useState({});
  const [expandedYears, setExpandedYears] = useState({}); // 각 카테고리의 연도별 펼침 상태 { "업무 지시": { "2024": true, "2025": false } }
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerCategory, setDatePickerCategory] = useState(null);
  const [visibleDateCounts, setVisibleDateCounts] = useState({}); // 각 카테고리-연도별 표시할 날짜 개수 { "업무 지시-2024": 5 }
  const [globalRefreshKey, setGlobalRefreshKey] = useState(0); // 전역 리프레시 키

  const NOTICE_SUB_CATEGORIES = [
    "현재 공지",
    "docs~노션 공지",
  ];
  const [showProfileMenu, setShowProfileMenu] = useState(false); // 프로필 메뉴 표시 여부
  const profileMenuRef = useRef(null); // 프로필 메뉴 참조
  const [showHandoverModal, setShowHandoverModal] = useState(false); // 인수인계 모달 표시 여부
  const [customerUsers, setCustomerUsers] = useState([]); // customer 타입 사용자 목록
  const [selectedUser, setSelectedUser] = useState(null); // 선택된 사용자
  const [passwordInput, setPasswordInput] = useState(""); // 비밀번호 입력
  const [handoverError, setHandoverError] = useState(""); // 인수인계 에러 메시지
  const [showProfilePage, setShowProfilePage] = useState(false); // 프로필 페이지 표시 여부
  const [showSettingsPage, setShowSettingsPage] = useState(false); // 환경설정 페이지 표시 여부

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
      { label: "대시보드", type: "dashboard", hasDates: false },
      { label: "전체 공지", type: "notice", hasDates: false },
      { label: "업무 지시", type: "instruction", hasDates: true },
      { label: "일일 인수인계", type: "handover", hasDates: true },
      { label: "업무 완료사항", type: "progress", hasDates: true },
      { label: "업무 체크리스트", type: "checklist", hasDates: true },
    ],
    []
  );

  const [dateLists, setDateLists] = useState({
    "업무 지시": [],
    "일일 인수인계": [],
    "업무 완료사항": [],
    "업무 체크리스트": [],
  });

  // Firestore에서 날짜 목록 가져오기 (실시간 업데이트)
  useEffect(() => {
    if (!user) return;

    const categoryCollections = {
      "업무 지시": "instructions",
      "일일 인수인계": "handovers",
      "업무 완료사항": "progresses",
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

  // 날짜에서 연도 추출
  const getYearFromDate = (dateString) => {
    const date = new Date(dateString);
    return date.getFullYear().toString();
  };

  // 날짜 목록을 연도별로 그룹화
  const groupDatesByYear = (dates) => {
    const grouped = {};
    dates.forEach((date) => {
      const year = getYearFromDate(date);
      if (!grouped[year]) {
        grouped[year] = [];
      }
      grouped[year].push(date);
    });
    // 연도별로 정렬 (내림차순), 각 연도 내 날짜도 정렬 (내림차순)
    const sortedYears = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
    const result = {};
    sortedYears.forEach((year) => {
      result[year] = grouped[year].sort((a, b) => b.localeCompare(a));
    });
    return result;
  };

  // 연도 토글 핸들러
  const handleYearToggle = (categoryLabel, year, event) => {
    event.stopPropagation();
    setExpandedYears((prev) => ({
      ...prev,
      [categoryLabel]: {
        ...prev[categoryLabel],
        [year]: !prev[categoryLabel]?.[year],
      },
    }));
  };

  // 연도별 날짜 개수 관리
  const handleShowMoreDatesInYear = (categoryLabel, year) => {
    const key = `${categoryLabel}-${year}`;
    setVisibleDateCounts((prev) => ({
      ...prev,
      [key]: (prev[key] || 5) + 5,
    }));
  };

  const handleShowLessDatesInYear = (categoryLabel, year) => {
    const key = `${categoryLabel}-${year}`;
    setVisibleDateCounts((prev) => ({
      ...prev,
      [key]: Math.max(5, (prev[key] || 5) - 5),
    }));
  };

  const handleCategoryClick = (categoryLabel) => {
    // 전체보기만 수행 (토글은 하지 않음)
    setActiveCategory(categoryLabel);
    setActiveDate(null);
    // 전체 공지가 아닌 경우 하위 카테고리 초기화
    if (categoryLabel !== "전체 공지") {
      setActiveSubCategory(null);
    } else {
      // 전체 공지인 경우 기본값 "현재 공지"로 설정 및 하위 카테고리 펼치기
      setActiveSubCategory("현재 공지");
      setExpandedCategories((prev) => ({
        ...prev,
        [categoryLabel]: true,
      }));
    }
  };

  const handleSubCategoryClick = (subCategory) => {
    setActiveCategory("전체 공지");
    setActiveSubCategory(subCategory);
    setActiveDate(null);
    setExpandedCategories((prev) => ({
      ...prev,
      "전체 공지": true,
    }));
  };

  const handleToggleCategory = (categoryLabel, event) => {
    // 토글만 수행 (전체보기는 하지 않음)
    event.stopPropagation();
    const hasDates = categories.find((c) => c.label === categoryLabel)?.hasDates;
    const isNotice = categoryLabel === "전체 공지";
    if (hasDates || isNotice) {
      setExpandedCategories((prev) => {
        const isExpanding = !prev[categoryLabel];
        // 카테고리를 펼칠 때 초기 표시 개수 설정 (5개)
        if (isExpanding && hasDates) {
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
        "업무 완료사항": "progresses",
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
      setActiveSubCategory(null); // 날짜 선택 시 하위 카테고리 초기화
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
    if (categoryLabel === "전체 공지") {
      // 전체 공지가 활성화되고, 하위 카테고리가 "현재 공지"이고, 날짜가 선택되지 않은 경우
      return activeCategory === categoryLabel && activeDate === null && activeSubCategory === "현재 공지";
    }
    return activeCategory === categoryLabel && activeDate === null;
  };

  const isSubCategoryActive = (subCategory) => {
    return activeCategory === "전체 공지" && activeSubCategory === subCategory;
  };

  const renderContent = () => {
    const currentCategory = categories.find((c) => c.label === activeCategory);
    if (!currentCategory) return <DashboardContent />;

    const handleNavigateToCategory = (categoryLabel) => {
      setActiveCategory(categoryLabel);
      setActiveDate(null);
      // 전체 공지가 아닌 경우 하위 카테고리 초기화
      if (categoryLabel !== "전체 공지") {
        setActiveSubCategory(null);
      } else {
        // 전체 공지인 경우 기본값 "현재 공지"로 설정 및 하위 카테고리 펼치기
        setActiveSubCategory("현재 공지");
        setExpandedCategories((prev) => ({
          ...prev,
          [categoryLabel]: true,
        }));
      }
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
      setActiveSubCategory(null);
      setExpandedCategories((prev) => ({
        ...prev,
        [categoryLabel]: true,
      }));
    };

    const handleSubCategorySelect = (subCategory) => {
      setActiveCategory("전체 공지");
      setActiveSubCategory(subCategory);
      setActiveDate(null);
    };

    const props = {
      category: activeCategory,
      selectedDate: activeDate,
      selectedSubCategory: activeSubCategory,
      user: user,
      profile: profile,
      onNavigateToCategory: handleNavigateToCategory,
      onDateSelect: handleDateSelect,
      onSubCategorySelect: handleSubCategorySelect,
      globalRefreshKey: globalRefreshKey,
      onRefresh: () => setGlobalRefreshKey((prev) => prev + 1),
    };

    switch (activeCategory) {
      case "대시보드":
        return <DashboardContent />;
      case "전체 공지":
        return <NoticeContent {...props} />;
      case "업무 지시":
        return <InstructionContent {...props} />;
      case "일일 인수인계":
        return <HandoverContent {...props} />;
      case "업무 완료사항":
        return <ProgressContent {...props} />;
      case "업무 체크리스트":
        return <ChecklistContent {...props} />;
      default:
        return <DashboardContent />;
    }
  };

  // Firestore에서 프로필 가져오기 (실시간 업데이트)
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    const profileRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(
      profileRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const profileData = snapshot.data();
          setProfile(profileData);
          // 디버깅: role 값 확인
          console.log("Profile loaded:", profileData);
          console.log("Role:", profileData?.role);
        } else {
          console.warn("User profile not found in Firestore");
          setProfile(null);
        }
      },
      (error) => {
        console.error("Error fetching profile:", error);
        setProfile(null);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // customer 타입 사용자 목록 가져오기
  useEffect(() => {
    if (!showHandoverModal) return;

    const fetchCustomerUsers = async () => {
      try {
        console.log("Fetching customer users...");
        const q = query(
          collection(db, "users"),
          where("user_type", "==", "customer")
        );
        const snapshot = await getDocs(q);
        console.log("Snapshot size:", snapshot.size);
        const users = [];
        snapshot.forEach((docSnapshot) => {
          const data = docSnapshot.data();
          console.log("User data:", docSnapshot.id, data);
          // 현재 로그인한 사용자는 제외
          if (docSnapshot.id === user?.uid) {
            return;
          }
          users.push({
            id: docSnapshot.id,
            email: data.email,
            name: data.name || "사용자",
            role: data.role || "직책",
            tagColor: data.tagColor || "gray",
          });
        });
        console.log("Customer users found:", users.length);
        setCustomerUsers(users);
        if (users.length === 0) {
          setHandoverError("등록된 customer 타입 사용자가 없습니다.");
        } else {
          setHandoverError("");
        }
      } catch (error) {
        console.error("Error fetching customer users:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        if (error.code === "failed-precondition") {
          setHandoverError("Firestore 인덱스가 필요합니다. Firebase 콘솔에서 인덱스를 생성해주세요.");
        } else {
          setHandoverError(`사용자 목록을 불러오는데 실패했습니다: ${error.message}`);
        }
      }
    };

    fetchCustomerUsers();
  }, [showHandoverModal, user]);

  // 프로필 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    };

    if (showProfileMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showProfileMenu]);

  // 인수인계: 사용자 전환
  const handleHandover = async (targetUser) => {
    setSelectedUser(targetUser);
    setPasswordInput("");
    setHandoverError("");
  };

  // 인수인계: 비밀번호 확인 및 사용자 전환
  const handleConfirmHandover = async () => {
    if (!selectedUser || !passwordInput) {
      setHandoverError("비밀번호를 입력하세요.");
      return;
    }

    try {
      setHandoverError("");
      await signInWithEmailAndPassword(auth, selectedUser.email, passwordInput);
      // 로그인 성공 시 자동으로 사용자 전환됨 (onAuthStateChanged에서 처리)
      setShowHandoverModal(false);
      setSelectedUser(null);
      setPasswordInput("");
    } catch (error) {
      console.error("Handover error:", error);
      if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
        setHandoverError("비밀번호가 올바르지 않습니다.");
      } else if (error.code === "auth/user-not-found") {
        setHandoverError("사용자를 찾을 수 없습니다.");
      } else {
        setHandoverError("인수인계에 실패했습니다.");
      }
    }
  };

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <h1>selfmadegym2</h1>
        <div className="dashboard-category">
          {activeDate
            ? `${activeCategory} > ${getYearFromDate(activeDate)} > ${formatDate(activeDate)}`
            : activeSubCategory
            ? `${activeCategory} > ${activeSubCategory}`
            : activeCategory}
        </div>
        <div className="dashboard-actions">
          {user ? (
            <>
              <div className="profile-menu-wrapper" ref={profileMenuRef}>
                <button
                  className="profile-button"
                  type="button"
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                >
                  <span
                    className="profile-dot"
                    style={{
                      backgroundColor: tagColors[profile?.tagColor] ?? "#d9c5a5",
                    }}
                    aria-hidden="true"
                  />
                  <span>
                    {profile?.name ?? user?.displayName ?? "사용자"} -{" "}
                    {profile?.role || "직책"}
                  </span>
                </button>
                {showProfileMenu && (
                  <div className="profile-menu">
                    <button
                      type="button"
                      className="profile-menu-item"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setShowProfilePage(true);
                      }}
                    >
                      프로필
                    </button>
                    <button
                      type="button"
                      className="profile-menu-item"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setShowHandoverModal(true);
                        setSelectedUser(null);
                        setPasswordInput("");
                        setHandoverError("");
                      }}
                    >
                      인수인계
                    </button>
                    {profile?.user_type === "admin" && (
                      <button
                        type="button"
                        className="profile-menu-item"
                        onClick={() => {
                          setShowProfileMenu(false);
                          setShowSettingsPage(true);
                        }}
                      >
                        환경설정
                      </button>
                    )}
                  </div>
                )}
              </div>
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
            </>
          ) : (
            <>
              <button
                className="login-button"
                type="button"
                onClick={() => onShowAuthPage?.("login")}
              >
                로그인
              </button>
              <button
                className="signup-button"
                type="button"
                onClick={() => onShowAuthPage?.("signup")}
              >
                회원가입
              </button>
            </>
          )}
        </div>
      </header>
      <div className="dashboard-body">
        <aside className="dashboard-sidebar">
          <nav>
            {categories.map((category) => {
              const isExpanded = expandedCategories[category.label];
              const dates = dateLists[category.label] || [];
              const hasDates = category.hasDates && dates.length > 0;
              const isNotice = category.label === "전체 공지";

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
                      {(hasDates || isNotice) && (
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
                  {isNotice && isExpanded && (
                    <div className="nav-sub-items">
                      {NOTICE_SUB_CATEGORIES.map((subCat) => (
                        <button
                          key={subCat}
                          className={[
                            "nav-sub-item",
                            isSubCategoryActive(subCat) ? "active" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          type="button"
                          onClick={() => handleSubCategoryClick(subCat)}
                        >
                          {subCat}
                        </button>
                      ))}
                    </div>
                  )}
                  {hasDates && isExpanded && (() => {
                    const datesByYear = groupDatesByYear(dates);
                    const years = Object.keys(datesByYear);
                    
                    return (
                      <div className="nav-sub-items">
                        {years.map((year) => {
                          const yearDates = datesByYear[year];
                          const yearKey = `${category.label}-${year}`;
                          const isYearExpanded = expandedYears[category.label]?.[year] ?? true;
                          const visibleCount = visibleDateCounts[yearKey] || 5;
                          const visibleDates = yearDates.slice(0, visibleCount);
                          
                          return (
                            <div key={year} className="nav-year-group">
                              <button
                                type="button"
                                className="nav-year-item"
                                onClick={(e) => handleYearToggle(category.label, year, e)}
                              >
                                <span className="nav-year-toggle">
                                  {isYearExpanded ? "▼" : "▶"}
                                </span>
                                <span className="nav-year-label">{year}</span>
                              </button>
                              {isYearExpanded && (
                                <div className="nav-dates-in-year">
                                  {visibleDates.map((date) => (
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
                                  {(yearDates.length > visibleCount || visibleCount > 5) && (
                                    <div className="nav-show-buttons">
                                      {yearDates.length > visibleCount && (
                                        <button
                                          type="button"
                                          className="nav-show-more-button"
                                          onClick={() => handleShowMoreDatesInYear(category.label, year)}
                                        >
                                          ▼ 더보기
                                        </button>
                                      )}
                                      {visibleCount > 5 && (
                                        <button
                                          type="button"
                                          className="nav-show-less-button"
                                          onClick={() => handleShowLessDatesInYear(category.label, year)}
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
                      </div>
                    );
                  })()}
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
            {showProfilePage ? (
              <ProfilePage
                user={user}
                profile={profile}
                onClose={() => setShowProfilePage(false)}
              />
            ) : showSettingsPage ? (
              <SettingsPage
                user={user}
                profile={profile}
                onClose={() => setShowSettingsPage(false)}
              />
            ) : (
              renderContent()
            )}
          </section>
        </main>
      </div>
      {/* 인수인계 모달 */}
      {showHandoverModal && (
        <div className="handover-modal-overlay" onClick={() => setShowHandoverModal(false)}>
          <div className="handover-modal" onClick={(e) => e.stopPropagation()}>
            <div className="handover-modal-header">
              <h2>인수인계</h2>
              <button
                type="button"
                className="handover-modal-close"
                onClick={() => {
                  setShowHandoverModal(false);
                  setSelectedUser(null);
                  setPasswordInput("");
                  setHandoverError("");
                }}
              >
                ✕
              </button>
            </div>
            <div className="handover-modal-content">
              {!selectedUser ? (
                <>
                  <p className="handover-instruction">전환할 사용자를 선택하세요</p>
                  {handoverError && (
                    <p className="handover-error" style={{ marginBottom: "16px" }}>
                      {handoverError}
                    </p>
                  )}
                  <div className="customer-users-list">
                    {customerUsers.length === 0 && !handoverError ? (
                      <p className="handover-empty">등록된 사용자가 없습니다.</p>
                    ) : customerUsers.length > 0 ? (
                      customerUsers.map((customerUser) => (
                        <button
                          key={customerUser.id}
                          type="button"
                          className="customer-user-item"
                          onClick={() => handleHandover(customerUser)}
                        >
                          <span
                            className="customer-user-dot"
                            style={{
                              backgroundColor: tagColors[customerUser.tagColor] ?? "#d9c5a5",
                            }}
                          />
                          <div className="customer-user-info">
                            <span className="customer-user-name">{customerUser.name}</span>
                            <span className="customer-user-role">{customerUser.role}</span>
                          </div>
                        </button>
                      ))
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <div className="selected-user-info">
                    <span
                      className="selected-user-dot"
                      style={{
                        backgroundColor: tagColors[selectedUser.tagColor] ?? "#d9c5a5",
                      }}
                    />
                    <div>
                      <span className="selected-user-name">{selectedUser.name}</span>
                      <span className="selected-user-role">{selectedUser.role}</span>
                    </div>
                  </div>
                  <div className="handover-password-form">
                    <label>
                      비밀번호
                      <input
                        type="password"
                        placeholder="비밀번호를 입력하세요"
                        value={passwordInput}
                        onChange={(e) => {
                          setPasswordInput(e.target.value);
                          setHandoverError("");
                        }}
                        onKeyPress={(e) => {
                          if (e.key === "Enter") {
                            handleConfirmHandover();
                          }
                        }}
                        autoFocus
                      />
                    </label>
                    {handoverError && (
                      <p className="handover-error">{handoverError}</p>
                    )}
                    <div className="handover-actions">
                      <button
                        type="button"
                        className="handover-cancel-button"
                        onClick={() => {
                          setSelectedUser(null);
                          setPasswordInput("");
                          setHandoverError("");
                        }}
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        className="handover-confirm-button"
                        onClick={handleConfirmHandover}
                      >
                        확인
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DashboardPage;
