import { useRef, useState, useEffect } from "react";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import NoticeDocuments from "./NoticeDocuments";
import "./SharedCategoryContent.css";

const CATEGORY_ORDER = [
  "전체 공지",
  "업무 지시",
  "일일 인수인계",
  "업무 완료사항",
  "업무 체크리스트",
];

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
  };
  return colors[tagColor] || "#b0b3b8";
};

function NoticeContent({ category, selectedDate, selectedSubCategory, onNavigateToCategory, onDateSelect, onSubCategorySelect, user, profile, globalRefreshKey, onRefresh }) {
  const sliderRef = useRef(null);
  const [isCardSectionCollapsed, setIsCardSectionCollapsed] = useState(true); // 기본적으로 닫힘
  const [unreadCards, setUnreadCards] = useState([]);
  const [showNoNewContentMessage, setShowNoNewContentMessage] = useState(false);

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

      // 최대 5개로 제한 (읽지 않은 문서만)
      const finalCards = ordered.slice(0, 5);
      console.log("Unread cards fetched:", finalCards.length);
      setUnreadCards(finalCards);
      
      // 새로운 문서가 있으면 자동으로 열림, 없으면 닫힘
      if (finalCards.length > 0) {
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
            onClick={() =>
              sliderRef.current?.scrollBy({ left: -236, behavior: "smooth" })
            }
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
                        backgroundColor: getTagColor(card.tagColor),
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
            onClick={() =>
              sliderRef.current?.scrollBy({ left: 236, behavior: "smooth" })
            }
          >
            ›
          </button>
        </div>
      )}
      <NoticeDocuments
        user={user}
        profile={profile}
        selectedSubCategory={selectedSubCategory}
        onSubCategoryChange={onSubCategorySelect}
        globalRefreshKey={globalRefreshKey}
        onRefresh={onRefresh}
      />
    </div>
  );
}

export default NoticeContent;
