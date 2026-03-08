import { useRef, useState, useEffect } from "react";
import { collection, query, orderBy, limit, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import SharedDocuments from "./SharedDocuments";
import "./SharedCategoryContent.css";

const CATEGORY_ORDER = [
  "전체 공지",
  "업무 지시",
  "일일 인수인계",
  "업무 완료사항",
  "업무 리스트",
  "고장&수리",
];

// 카테고리 이름을 Firestore 컬렉션 이름으로 매핑
const getCollectionName = (category) => {
  const mapping = {
    "전체 공지": "notices",
    "업무 지시": "instructions",
    "일일 인수인계": "handovers",
    "업무 완료사항": "progresses",
    "업무 리스트": "checklists",
    "고장&수리": "repairs",
  };
  return mapping[category] || null;
};

const formatCardTime = (timestamp, dateString) => {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const year = date.getFullYear().toString().slice(-2);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  return `${year}/${month}/${day} - ${hours}시`;
};

const getTagColor = (tagColor) => {
  const colors = {
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
  };
  return colors[tagColor] || "#b0b3b8";
};

function SharedCategoryContent({
  showDocuments = true,
  category,
  selectedDate,
  onNavigateToCategory,
  onDateSelect,
  user,
  profile,
  globalRefreshKey,
  onRefresh,
  scrollTarget,
  onConsumeScrollTarget,
}) {
  const sliderRef = useRef(null);
  const [isCardSectionCollapsed, setIsCardSectionCollapsed] = useState(true); // 기본적으로 닫힘
  const [unreadCards, setUnreadCards] = useState([]);
  const [showNoNewContentMessage, setShowNoNewContentMessage] = useState(false);
  const scrollCards = (offset) => {
    const slider = sliderRef.current;
    if (!slider) return;
    if (typeof slider.scrollBy === "function") {
      slider.scrollBy({ left: offset, behavior: "smooth" });
      return;
    }
    slider.scrollLeft += offset;
  };

  // Firestore에서 최근 문서 가져오기 (NEW! 카드용)
  useEffect(() => {
    if (!user) {
      setUnreadCards([]);
      return;
    }

    console.log("Fetching unread cards, globalRefreshKey:", globalRefreshKey);

    const fetchUnreadCards = async () => {
      const collections = [
        { category: "전체 공지", collection: "notices", hasDate: false },
        { category: "업무 지시", collection: "instructions", hasDate: true },
        { category: "일일 인수인계", collection: "handovers", hasDate: true },
        { category: "업무 완료사항", collection: "progresses", hasDate: true },
        { category: "고장&수리", collection: "repairs", hasDate: true },
      ];

      const allCards = [];

      for (const { category: cat, collection: col, hasDate } of collections) {
        try {
          let q = query(collection(db, col), orderBy("createdAt", "desc"), limit(10)); // 더 많이 가져와서 필터링 후 제한
          const snapshot = await getDocs(q);
          snapshot.forEach((doc) => {
            const data = doc.data();
            
            // 사용자가 작성한 문서는 제외
            if (data.authorId === user.uid) {
              return; // 본인이 작성한 문서는 카드에 추가하지 않음
            }
            
            // 사용자가 이미 읽은 문서는 제외
            const readBy = data.readBy || [];
            const hasRead = readBy.some((reader) => reader.userId === user.uid);
            if (hasRead) {
              return; // 이 문서는 카드에 추가하지 않음
            }
            
            allCards.push({
              id: doc.id,
              category: cat,
              body: data.content || "",
              author: data.authorName || "사용자",
              tagColor: data.tagColor || "gray",
              createdAt: data.createdAt,
              date: data.date || null,
              time: formatCardTime(data.createdAt, data.date),
            });
          });
        } catch (error) {
          console.error(`Error fetching cards for ${cat}:`, error);
          console.error("Error code:", error.code);
          console.error("Error message:", error.message);
        }
      }

      // 카테고리 순, 그 다음 날짜 순으로 정렬
      const ordered = allCards.sort((a, b) => {
        const categoryDiff =
          CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
        if (categoryDiff !== 0) {
          return categoryDiff;
        }
        // 날짜가 있으면 날짜로 정렬, 없으면 createdAt으로 정렬
        if (a.date && b.date) {
          return b.date.localeCompare(a.date);
        }
        if (a.createdAt && b.createdAt) {
          const aTime = a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
          const bTime = b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
          return bTime - aTime;
        }
        return 0;
      });

      setUnreadCards(ordered);
      
      // 새로운 문서가 있으면 자동으로 열림, 없으면 닫힘
      if (ordered.length > 0) {
        setIsCardSectionCollapsed(false);
      } else {
        setIsCardSectionCollapsed(true);
      }
    };

    fetchUnreadCards();
  }, [user, globalRefreshKey]); // globalRefreshKey 추가 - 변경 시 카드 섹션 리프레시

  return (
    <div className="category-content">
      <div className="new-badge-wrapper">
        <p className="new-badge">
          {unreadCards.length > 0 ? "NEW!" : "No Event"}
        </p>
        <button
          type="button"
          className="card-toggle-button"
          onClick={() => {
            // 새로운 문서가 없고 현재 닫혀있으면 안내 메시지 표시
            if (unreadCards.length === 0 && isCardSectionCollapsed) {
              setShowNoNewContentMessage(true);
              // 2초 후 메시지 숨김
              setTimeout(() => {
                setShowNoNewContentMessage(false);
              }, 2000);
              return;
            }
            // 새로운 문서가 있으면 토글 정상 작동
            if (unreadCards.length > 0) {
              setIsCardSectionCollapsed(!isCardSectionCollapsed);
            }
          }}
          aria-label={isCardSectionCollapsed ? "카드 섹션 펼치기" : "카드 섹션 접기"}
        >
          {isCardSectionCollapsed ? "▼" : "▲"}
        </button>
      </div>
      {showNoNewContentMessage && (
        <div className="no-new-content-message">
          새로운 내용이 없습니다
        </div>
      )}
      {!isCardSectionCollapsed && (
        <div className="card-slider-wrapper">
          <button
            type="button"
            className="slider-button left"
            aria-label="이전 카드"
            onClick={() => scrollCards(-236)}
          >
            ‹
          </button>
          <div className="card-slider" ref={sliderRef}>
            {unreadCards.map((card) => (
              <article 
                key={card.id} 
                className="card"
                onClick={() => {
                  // 카테고리로 이동
                  onNavigateToCategory?.(card.category);
                  // 날짜가 있으면 해당 날짜로도 이동
                  if (card.date) {
                    onDateSelect?.(card.category, card.date);
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <div className="card-meta">{card.category}</div>
                <div className="card-header">
                  <div className="card-author">
                    <span
                      className="card-tag"
                      data-color={card.tagColor}
                      style={{
                        background: getTagColor(card.tagColor),
                      }}
                      aria-hidden="true"
                    />
                    <span>{card.author}</span>
                    <span className="card-time-inline">{card.time}</span>
                  </div>
                </div>
                <p className="card-body">{card.body}</p>
              </article>
            ))}
          </div>
          <button
            type="button"
            className="slider-button right"
            aria-label="다음 카드"
            onClick={() => scrollCards(236)}
          >
            ›
          </button>
        </div>
      )}
      {showDocuments && (
        <SharedDocuments
          category={category}
          selectedDate={selectedDate}
          onNavigateToCategory={onNavigateToCategory}
          onDateSelect={onDateSelect}
          user={user}
          profile={profile}
          globalRefreshKey={globalRefreshKey}
          onRefresh={onRefresh}
          scrollTargetId={scrollTarget?.category === category ? scrollTarget?.documentId : null}
          onConsumeScrollTarget={onConsumeScrollTarget}
        />
      )}
    </div>
  );
}

export default SharedCategoryContent;
