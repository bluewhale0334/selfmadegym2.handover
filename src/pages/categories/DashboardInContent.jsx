import { useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, query, updateDoc, where, Timestamp } from "firebase/firestore";
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
  { label: "업무 체크리스트", collection: "checklists", hasDate: true },
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
  const [hiddenReadKeys, setHiddenReadKeys] = useState(() => new Set());
  const sourceItemsRef = useRef({});
  const sourceDocsRef = useRef({});
  const sourceInitRef = useRef({});

  useEffect(() => {
    if (!user) {
      setCommentItems([]);
      setCommentDocs({});
      setCommentError("");
      setIsLoadingComments(false);
      setHiddenReadKeys(new Set());
      sourceItemsRef.current = {};
      sourceDocsRef.current = {};
      sourceInitRef.current = {};
      return () => {};
    }

    setIsLoadingComments(true);
    sourceItemsRef.current = {};
    sourceDocsRef.current = {};
    sourceInitRef.current = {};

    const unsubscribes = COMMENT_SOURCES.map((source) => {
      const q = query(collection(db, source.collection), where("authorId", "==", user.uid));
      return onSnapshot(
        q,
        (snapshot) => {
          const docsMap = {};
          const items = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const comments = data.comments || [];
            const docKey = getDocKey(source.collection, docSnap.id);
            docsMap[docKey] = comments;
            comments.forEach((comment, index) => {
              if (comment.userId === user.uid) {
                return;
              }
              const readBy = comment.readBy || [];
              const isRead = readBy.some((reader) => reader.userId === user.uid);
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

  const unreadCount = commentItems.filter((item) => !item.isRead).length;
  const visibleCommentItems = commentItems.filter((item) => {
    if (!item.isRead) return true;
    return !hiddenReadKeys.has(item.documentKey);
  });

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
    onSelectDocument?.({
      category: item.category,
      documentId: item.documentId,
      date: item.documentDate || null,
      subCategory: item.documentSubCategory || null,
    });
    onNavigateToCategory?.(item.category);
    if (item.category === "전체 공지" && item.documentSubCategory) {
      onSubCategorySelect?.(item.documentSubCategory);
    }
    if (item.documentDate) {
      onDateSelect?.(item.category, item.documentDate);
    }
  };

  const handleClearReadNotifications = () => {
    setHiddenReadKeys(() => {
      const next = new Set();
      commentItems.forEach((item) => {
        if (item.isRead) {
          next.add(item.documentKey);
        }
      });
      return next;
    });
  };

  return (
    <section className="dashboard-overview">
      <div className="dashboard-split">
        <div className="dashboard-left">
          <div className="dashboard-left-box">
            <h3 className="dashboard-box-title">왼쪽 박스</h3>
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
          <div className="dashboard-right-top">
            <div className="dashboard-comment-header">
              <h3 className="dashboard-box-title">댓글 알림</h3>
              <div className="dashboard-comment-actions">
                {unreadCount === 0 && commentItems.some((item) => item.isRead) && (
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
            <p className="dashboard-box-body">내 인수인계 문서에 달린 댓글</p>
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
            <div className="dashboard-right-bottom-box">
              <h3 className="dashboard-box-title">하단 좌측</h3>
              <p className="dashboard-box-body">내용을 추가할 예정</p>
            </div>
            <div className="dashboard-right-bottom-box">
              <h3 className="dashboard-box-title">하단 우측</h3>
              <p className="dashboard-box-body">내용을 추가할 예정</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default DashboardInContent;
