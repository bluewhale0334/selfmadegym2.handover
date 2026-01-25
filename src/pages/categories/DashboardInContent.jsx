import { useEffect, useRef, useState } from "react";
import { collection, doc, getDoc, onSnapshot, query, updateDoc, where, Timestamp } from "firebase/firestore";
import { db } from "../../firebase";
import "./DashboardInContent.css";

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

const formatCommentTime = (timestamp) => {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const year = date.getFullYear().toString().slice(-2);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}/${month}/${day} ${hours}:${minutes}`;
};

const sortCommentItems = (items) => {
  return [...items].sort((a, b) => {
    if (a.isRead !== b.isRead) {
      return a.isRead ? 1 : -1;
    }
    const aTime = a.comment.createdAt?.toMillis ? a.comment.createdAt.toMillis() : 0;
    const bTime = b.comment.createdAt?.toMillis ? b.comment.createdAt.toMillis() : 0;
    return bTime - aTime;
  });
};

const COMMENT_SOURCES = [
  { label: "전체 공지", collection: "notices", hasDate: false },
  { label: "업무 지시", collection: "instructions", hasDate: true },
  { label: "일일 인수인계", collection: "handovers", hasDate: true },
  { label: "업무 완료사항", collection: "progresses", hasDate: true },
  { label: "업무 리스트", collection: "checklists", hasDate: true },
];

const getDocKey = (collectionName, documentId) => {
  return `${collectionName}:${documentId}`;
};

function DashboardInContent({
  user,
  onNavigateToCategory,
  onDateSelect,
  onSubCategorySelect,
  onSelectDocument,
}) {
  const [commentItems, setCommentItems] = useState([]);
  const [commentDocs, setCommentDocs] = useState({});
  const [commentError, setCommentError] = useState("");
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const sourceItemsRef = useRef({});
  const sourceDocsRef = useRef({});
  const sourceInitRef = useRef({});
  const [dailyListItems, setDailyListItems] = useState([]);
  const [weeklyMonthlyItems, setWeeklyMonthlyItems] = useState([]);
  const [checklistError, setChecklistError] = useState("");

  useEffect(() => {
    if (!user) {
      setCommentItems([]);
      setCommentDocs({});
      setCommentError("");
      setIsLoadingComments(false);
      sourceItemsRef.current = {};
      sourceDocsRef.current = {};
      sourceInitRef.current = {};
      setDailyListItems([]);
      setWeeklyMonthlyItems([]);
      setChecklistError("");
      return () => {};
    }

    setIsLoadingComments(true);
    sourceItemsRef.current = {};
    sourceDocsRef.current = {};
    sourceInitRef.current = {};

    const unsubscribes = COMMENT_SOURCES.map((source) => {
      const baseRef = collection(db, source.collection);
      const q =
        source.collection === "checklists"
          ? query(baseRef, where("userId", "==", user.uid))
          : query(baseRef);
      return onSnapshot(
        q,
        (snapshot) => {
          const docsMap = {};
          const items = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const comments = data.comments || [];
            const isAuthor = data.authorId === user.uid;
            const hasCommented = comments.some((comment) => comment.userId === user.uid);
            if (!isAuthor && !hasCommented) {
              return;
            }
            const docKey = getDocKey(source.collection, docSnap.id);
            docsMap[docKey] = comments;
            comments.forEach((comment, index) => {
              if (comment.userId === user.uid) {
                return;
              }
              const readBy = comment.readBy || [];
              const readEntry = readBy.find((reader) => reader.userId === user.uid);
              const isRead = Boolean(readEntry);
              const isHidden = Boolean(readEntry?.hiddenAt);
              items.push({
                category: source.label,
                collectionName: source.collection,
                documentId: docSnap.id,
                documentKey: docKey,
                documentContent: data.content || "",
                documentDate: data.date || "",
                documentSubCategory: data.subCategory || (source.label === "전체 공지" ? "현재 공지" : null),
                commentIndex: index,
                comment,
                isRead,
                isHidden,
              });
            });
          });

          sourceItemsRef.current[source.collection] = items;
          sourceDocsRef.current[source.collection] = docsMap;

          const mergedItems = Object.values(sourceItemsRef.current).flat();
          const mergedDocs = Object.values(sourceDocsRef.current).reduce(
            (acc, map) => ({ ...acc, ...map }),
            {}
          );

          if (!sourceInitRef.current[source.collection]) {
            sourceInitRef.current[source.collection] = true;
          }

          setCommentDocs(mergedDocs);
          setCommentItems(sortCommentItems(mergedItems));
          setCommentError("");

          const allReady = COMMENT_SOURCES.every(
            (current) => sourceInitRef.current[current.collection]
          );
          if (allReady) {
            setIsLoadingComments(false);
          }
        },
        (error) => {
          console.error(`Error fetching ${source.collection} comments:`, error);
          setCommentError("댓글을 불러오지 못했습니다.");
          setIsLoadingComments(false);
        }
      );
    });

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const loadChecklistSnapshot = async () => {
      try {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const day = String(today.getDate()).padStart(2, "0");
        const dateKey = `${year}-${month}-${day}`;
        const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];
        const todayWeekday = weekdayLabels[today.getDay()] ?? "월";
        const todayMonthDay = today.getDate();
        const snapshotRef = doc(db, "dailyChecklistSnapshots", `${user.uid}_${dateKey}`);
        const snapshotDoc = await getDoc(snapshotRef);
        if (!snapshotDoc.exists()) {
          setDailyListItems([]);
          setWeeklyMonthlyItems([]);
          return;
        }
        const data = snapshotDoc.data();
        const items = Array.isArray(data.items) ? data.items : [];
        const extras = Array.isArray(data.extraItems) ? data.extraItems : [];
        const pendingItems = items.filter((item) => !item.done);
        const pendingExtras = extras.filter((item) => !item.done);

        const sortByTime = (a, b) => {
          const aHour = typeof a.hour === "number" ? a.hour : 99;
          const bHour = typeof b.hour === "number" ? b.hour : 99;
          if (aHour !== bHour) return aHour - bHour;
          const aMin = typeof a.minute === "number" ? a.minute : 99;
          const bMin = typeof b.minute === "number" ? b.minute : 99;
          return aMin - bMin;
        };

        const daily = pendingItems
          .filter((item) => (item.category || "일일 업무") === "일일 업무")
          .sort(sortByTime);

        const weeklyMonthly = [
          ...pendingItems.filter((item) => {
            if (item.category === "주간 업무") {
              return item.weekday === todayWeekday;
            }
            if (item.category === "월간 업무") {
              return Array.isArray(item.monthDays) && item.monthDays.includes(todayMonthDay);
            }
            return false;
          }),
          ...pendingExtras.map((item) => ({ ...item, category: "추가 업무" })),
        ];

        setDailyListItems(daily);
        setWeeklyMonthlyItems(weeklyMonthly);
      } catch (error) {
        console.error("Error loading checklist snapshot:", error);
        setChecklistError("업무 리스트를 불러오지 못했습니다.");
      }
    };
    loadChecklistSnapshot();
  }, [user]);

  const unreadCount = commentItems.filter((item) => !item.isRead).length;
  const visibleCommentItems = commentItems.filter((item) => !item.isHidden);
  const shouldCompactComments =
    !isLoadingComments && !commentError && visibleCommentItems.length === 0;

  const handleCheckComment = async (item) => {
    if (!user || item.isRead) {
      return;
    }

    const currentComments = commentDocs[item.documentKey];
    if (!currentComments || !currentComments[item.commentIndex]) {
      return;
    }

    const previousComments = currentComments;
    const previousItems = commentItems;
    const updatedComments = [...currentComments];
    const targetComment = updatedComments[item.commentIndex];
    const currentReadBy = targetComment.readBy || [];
    const alreadyRead = currentReadBy.some((reader) => reader.userId === user.uid);
    if (alreadyRead) {
      return;
    }

    const newReadBy = [
      ...currentReadBy,
      {
        userId: user.uid,
        readAt: Timestamp.now(),
      },
    ];

    updatedComments[item.commentIndex] = {
      ...targetComment,
      readBy: newReadBy,
    };

    const updatedItems = sortCommentItems(
      commentItems.map((entry) =>
        entry.documentId === item.documentId && entry.commentIndex === item.commentIndex
          ? { ...entry, isRead: true }
          : entry
      )
    );

    setCommentDocs((prev) => ({ ...prev, [item.documentKey]: updatedComments }));
    setCommentItems(updatedItems);

    try {
      const docRef = doc(db, item.collectionName, item.documentId);
      await updateDoc(docRef, {
        comments: updatedComments,
      });
    } catch (error) {
      console.error("Error marking comment as read:", error);
      setCommentDocs((prev) => ({ ...prev, [item.documentKey]: previousComments }));
      setCommentItems(previousItems);
      setCommentError("댓글 읽음 처리에 실패했습니다.");
    }
  };

  const handleCommentClick = (item) => {
    handleCheckComment(item);
    onNavigateToCategory?.(item.category);
    if (item.category === "전체 공지" && item.documentSubCategory) {
      onSubCategorySelect?.(item.documentSubCategory);
    }
    if (item.documentDate) {
      onDateSelect?.(item.category, item.documentDate);
    }
    setTimeout(() => {
      onSelectDocument?.({
        category: item.category,
        documentId: item.documentId,
        date: item.documentDate || null,
        subCategory: item.documentSubCategory || null,
      });
    }, 120);
  };

  const handleClearReadNotifications = async () => {
    if (!user) return;

    const updatesByDocKey = {};
    const hiddenAt = Timestamp.now();

    commentItems.forEach((item) => {
      if (!item.isRead || item.isHidden) return;
      const currentComments = updatesByDocKey[item.documentKey] || commentDocs[item.documentKey];
      if (!currentComments || !currentComments[item.commentIndex]) return;

      const updatedComments = updatesByDocKey[item.documentKey]
        ? currentComments
        : [...currentComments];
      const targetComment = updatedComments[item.commentIndex];
      const readBy = targetComment.readBy || [];
      const readerIndex = readBy.findIndex((reader) => reader.userId === user.uid);
      if (readerIndex === -1) return;

      const updatedReadBy = [...readBy];
      const currentReader = updatedReadBy[readerIndex];
      if (currentReader.hiddenAt) return;

      updatedReadBy[readerIndex] = {
        ...currentReader,
        hiddenAt,
      };

      updatedComments[item.commentIndex] = {
        ...targetComment,
        readBy: updatedReadBy,
      };

      updatesByDocKey[item.documentKey] = updatedComments;
    });

    const updatesKeys = Object.keys(updatesByDocKey);
    if (updatesKeys.length === 0) return;

    const previousDocs = commentDocs;
    const previousItems = commentItems;

    setCommentDocs((prev) => ({ ...prev, ...updatesByDocKey }));
    setCommentItems((prevItems) =>
      prevItems.map((item) =>
        updatesByDocKey[item.documentKey] && item.isRead && !item.isHidden
          ? { ...item, isHidden: true }
          : item
      )
    );

    try {
      await Promise.all(
        updatesKeys.map((docKey) => {
          const [collectionName, documentId] = docKey.split(":");
          const docRef = doc(db, collectionName, documentId);
          return updateDoc(docRef, {
            comments: updatesByDocKey[docKey],
          });
        })
      );
    } catch (error) {
      console.error("Error hiding read comments:", error);
      setCommentDocs(previousDocs);
      setCommentItems(previousItems);
      setCommentError("읽은 댓글 숨김에 실패했습니다.");
    }
  };

  const isOverdue = (item) => {
    if (typeof item.hour !== "number" || typeof item.minute !== "number") {
      return false;
    }
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const itemMinutes = item.hour * 60 + item.minute;
    return nowMinutes > itemMinutes;
  };

  const formatItemTime = (item) => {
    if (typeof item.hour !== "number" || typeof item.minute !== "number") {
      return "--:--";
    }
    return `${String(item.hour).padStart(2, "0")}:${String(item.minute).padStart(2, "0")}`;
  };

  return (
    <section className="dashboard-overview">
      <div className="dashboard-split">
        <div className="dashboard-left">
          <div className="dashboard-left-box">
            <h3 className="dashboard-box-title">어드민 백과사전</h3>
            <p className="dashboard-box-body">내용을 추가할 예정</p>
            <p className="dashboard-box-body">Notice : 대시보드 개발중...
<br></br>현재 사용가능한 기능<br></br>
1. 전체 공지<br></br>
2. 업무 지시<br></br>
3. 일일 인수인계<br></br>
4. 업무 완료사항<br></br></p>
          </div>
        </div>
        <div className="dashboard-right">
          <div className={`dashboard-right-top${shouldCompactComments ? " is-compact" : ""}`}>
            <div className="dashboard-comment-header">
              <h3 className="dashboard-box-title">댓글 알림</h3>
              <div className="dashboard-comment-actions">
                {unreadCount === 0 && commentItems.some((item) => item.isRead && !item.isHidden) && (
                  <button
                    type="button"
                    className="dashboard-comment-clear"
                    onClick={handleClearReadNotifications}
                  >
                    읽은 댓글 지우기
                  </button>
                )}
                <span className="dashboard-comment-count">새 댓글 {unreadCount}건</span>
              </div>
            </div>
            <div className="dashboard-comment-list">
              {isLoadingComments && (
                <div className="dashboard-comment-empty">댓글을 불러오는 중...</div>
              )}
              {!isLoadingComments && commentError && (
                <div className="dashboard-comment-error">{commentError}</div>
              )}
              {!isLoadingComments && !commentError && visibleCommentItems.length === 0 && (
                <div className="dashboard-comment-empty">새 댓글이 없습니다.</div>
              )}
              {!isLoadingComments &&
                !commentError &&
                visibleCommentItems.map((item) => (
                  <button
                    key={`${item.collectionName}-${item.documentId}-${item.commentIndex}`}
                    type="button"
                    className={`dashboard-comment-item${item.isRead ? " is-read" : ""}`}
                    onClick={() => handleCommentClick(item)}
                    title="클릭하면 문서로 이동합니다."
                  >
                    <div className="dashboard-comment-meta">
                      <span className="dashboard-comment-category">{item.category}</span>
                      <span
                        className="dashboard-comment-dot"
                        style={{ backgroundColor: getTagColor(item.comment.tagColor) }}
                        aria-hidden="true"
                      />
                      <span className="dashboard-comment-author">{item.comment.userName}</span>
                      <span className="dashboard-comment-time">
                        {formatCommentTime(item.comment.createdAt)}
                      </span>
                    </div>
                    <div className="dashboard-comment-content">{item.comment.content}</div>
                    <div className="dashboard-comment-doc">
                      {item.documentDate ? `${item.documentDate} 인수인계` : "인수인계"}
                      {item.documentContent ? ` · ${item.documentContent}` : ""}
                    </div>
                  </button>
                ))}
            </div>
          </div>
          <div className="dashboard-right-bottom">
            <div className="dashboard-right-bottom-inner">
              <div className="dashboard-right-bottom-header">
                <button
                  type="button"
                  className="dashboard-checklist-link"
                  onClick={() => onNavigateToCategory?.("업무 리스트")}
                >
                  업무 리스트 바로가기
                </button>
              </div>
              <div className="dashboard-right-bottom-section">
                <h3 className="dashboard-box-title">일일 업무 리스트</h3>
                {checklistError ? (
                  <p className="dashboard-box-body">{checklistError}</p>
                ) : dailyListItems.length === 0 ? (
                  <p className="dashboard-box-body">대기 중인 업무가 없습니다.</p>
                ) : (
                  <div className="dashboard-checklist-list">
                    {dailyListItems.map((item, index) => (
                      <div
                        key={`daily-${item.title}-${index}`}
                        className={`dashboard-checklist-item${
                          isOverdue(item) ? " is-overdue" : ""
                        }`}
                      >
                        <span className="dashboard-checklist-time">{formatItemTime(item)}</span>
                        <span className="dashboard-checklist-title">{item.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="dashboard-right-bottom-divider" aria-hidden="true" />
              <div className="dashboard-right-bottom-section">
                <h3 className="dashboard-box-title">주간, 월간, 추가 업무 리스트</h3>
                {checklistError ? (
                  <p className="dashboard-box-body">{checklistError}</p>
                ) : weeklyMonthlyItems.length === 0 ? (
                  <p className="dashboard-box-body">대기 중인 업무가 없습니다.</p>
                ) : (
                  <div className="dashboard-checklist-list">
                    {weeklyMonthlyItems.map((item, index) => (
                      <div key={`weekly-${item.title}-${index}`} className="dashboard-checklist-item">
                        <span className="dashboard-checklist-tag">{item.category || "업무"}</span>
                        <span className="dashboard-checklist-time">{formatItemTime(item)}</span>
                        <span className="dashboard-checklist-title">{item.title}</span>
                      </div>
                    ))}
                  </div>
                )}
            </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default DashboardInContent;
