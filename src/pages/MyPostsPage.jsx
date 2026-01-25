import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import "./MyPostsPage.css";

const COLLECTIONS = [
  { label: "전체 공지", name: "notices" },
  { label: "업무 지시", name: "instructions" },
  { label: "일일 인수인계", name: "handovers" },
  { label: "업무 완료사항", name: "progresses" },
  { label: "업무 리스트", name: "checklists" },
];

const getRangeStart = (rangeKey) => {
  const now = new Date();
  if (rangeKey === "week") {
    now.setDate(now.getDate() - 7);
  } else if (rangeKey === "month") {
    now.setMonth(now.getMonth() - 1);
  } else {
    now.setMonth(now.getMonth() - 6);
  }
  return now;
};

const extractTimestamp = (value) => {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

function MyPostsPage({ user, profile, onClose }) {
  const isAdmin = profile?.user_type === "admin";
  const [customerUsers, setCustomerUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(user?.uid || "");
  const [rangeKey, setRangeKey] = useState("week");
  const [postItems, setPostItems] = useState([]);
  const [commentItems, setCommentItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const rangeStart = useMemo(() => getRangeStart(rangeKey), [rangeKey]);

  useEffect(() => {
    if (!isAdmin) return;
    const fetchCustomers = async () => {
      const snapshot = await getDocs(
        query(collection(db, "users"), where("user_type", "==", "customer"))
      );
      const users = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        users.push({
          id: docSnap.id,
          name: data.name || "사용자",
          role: data.role || "직책",
        });
      });
      setCustomerUsers(users);
      if (!selectedUserId && users.length > 0) {
        setSelectedUserId(users[0].id);
      }
    };
    fetchCustomers();
  }, [isAdmin, selectedUserId]);

  useEffect(() => {
    if (!selectedUserId) {
      setPostItems([]);
      setCommentItems([]);
      return;
    }
    let isActive = true;
    const fetchData = async () => {
      setIsLoading(true);
      const posts = [];
      const comments = [];
      for (const target of COLLECTIONS) {
        const baseRef = collection(db, target.name);
        const snapshot =
          target.name === "checklists"
            ? await getDocs(query(baseRef, where("userId", "==", selectedUserId)))
            : await getDocs(baseRef);
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const createdAt = extractTimestamp(data.createdAt);
          if (createdAt && createdAt < rangeStart) {
            return;
          }
          const authorId = data.authorId || data.userId;
          if (authorId === selectedUserId) {
            posts.push({
              id: docSnap.id,
              category: target.label,
              content: data.content || data.title || "제목 없음",
              createdAt,
              date: data.date || "",
            });
          }
          const itemComments = Array.isArray(data.comments) ? data.comments : [];
          itemComments.forEach((comment) => {
            if (comment.userId !== selectedUserId) return;
            const commentTime = extractTimestamp(comment.createdAt);
            if (commentTime && commentTime < rangeStart) return;
            comments.push({
              id: `${docSnap.id}-${comment.createdAt?.seconds ?? ""}`,
              category: target.label,
              content: comment.content || "",
              createdAt: commentTime,
              date: data.date || "",
            });
          });
        });
      }
      if (!isActive) return;
      posts.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
      comments.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
      setPostItems(posts);
      setCommentItems(comments);
      setIsLoading(false);
    };
    fetchData();
    return () => {
      isActive = false;
    };
  }, [selectedUserId, rangeStart]);

  return (
    <div className="my-posts-page">
      <div className="my-posts-card">
        <div className="my-posts-header">
          <h2>내 글 보기</h2>
          <button type="button" className="my-posts-close" onClick={onClose}>
            닫기
          </button>
        </div>
        {isAdmin && (
          <div className="my-posts-admin-filter">
            <span className="my-posts-admin-label">사용자 선택</span>
            <select
              className="my-posts-admin-select"
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
            >
              <option value="">사용자 선택</option>
              {customerUsers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} ({customer.role})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="my-posts-filters">
          {[
            { key: "week", label: "최근 1주" },
            { key: "month", label: "최근 1달" },
            { key: "half", label: "최근 6개월" },
          ].map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`my-posts-filter-button${rangeKey === filter.key ? " active" : ""}`}
              onClick={() => setRangeKey(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="my-posts-sections">
          <section className="my-posts-section">
            <div className="my-posts-section-header">
              <h3>내 글</h3>
            </div>
            <div className="my-posts-section-body">
              {isLoading ? (
                <div className="my-posts-empty">불러오는 중...</div>
              ) : postItems.length === 0 ? (
                <div className="my-posts-empty">표시할 글이 없습니다.</div>
              ) : (
                <div className="my-posts-list">
                  {postItems.map((item) => (
                    <div key={item.id} className="my-posts-item">
                      <span className="my-posts-item-category">{item.category}</span>
                      <span className="my-posts-item-content">{item.content}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
          <section className="my-posts-section">
            <div className="my-posts-section-header">
              <h3>내 댓글</h3>
            </div>
            <div className="my-posts-section-body">
              {isLoading ? (
                <div className="my-posts-empty">불러오는 중...</div>
              ) : commentItems.length === 0 ? (
                <div className="my-posts-empty">표시할 댓글이 없습니다.</div>
              ) : (
                <div className="my-posts-list">
                  {commentItems.map((item) => (
                    <div key={item.id} className="my-posts-item">
                      <span className="my-posts-item-category">{item.category}</span>
                      <span className="my-posts-item-content">{item.content}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default MyPostsPage;
