import { useState, useMemo, useEffect } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import "./RepairContent.css";

const COLLECTION_NAME = "repairs";

const formatDateStr = (timestamp) => {
  const d = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp || Date.now());
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
};

function RepairContent({
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
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editingLabel, setEditingLabel] = useState("");

  useEffect(() => {
    if (!user) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs
          .map((docSnap) => {
            const data = docSnap.data();
            if (data.isDateFlag) return null;
            return {
              id: docSnap.id,
              label: data.label || data.content || "",
              createdAt: formatDateStr(data.createdAt),
              createdAtMs: data.createdAt?.toMillis?.() || 0,
              status: data.status || "미완료",
            };
          })
          .filter(Boolean);
        setItems(docs);
        setIsLoading(false);
      },
      (error) => {
        console.error("Error fetching repairs:", error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, globalRefreshKey]);

  const handleAddCard = async () => {
    if (!user) return;

    const docData = {
      label: "",
      status: "미완료",
      authorId: user.uid,
      authorName: profile?.name || user.displayName || "사용자",
      createdAt: serverTimestamp(),
    };

    try {
      const docRef = await addDoc(collection(db, COLLECTION_NAME), docData);
      setEditingId(docRef.id);
      setEditingLabel("");
      onRefresh?.();
    } catch (error) {
      console.error("Error adding repair card:", error);
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setEditingLabel(item.label);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !user) return;

    try {
      await updateDoc(doc(db, COLLECTION_NAME, editingId), {
        label: editingLabel.trim(),
      });
      setItems((prev) =>
        prev.map((it) =>
          it.id === editingId
            ? { ...it, label: editingLabel.trim() || it.label }
            : it
        )
      );
      setEditingId(null);
      setEditingLabel("");
      onRefresh?.();
    } catch (error) {
      console.error("Error updating repair card:", error);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingLabel("");
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`"${item.label || "이 카드"}"를 삭제하시겠습니까?`)) return;

    try {
      await deleteDoc(doc(db, COLLECTION_NAME, item.id));
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      if (editingId === item.id) {
        setEditingId(null);
        setEditingLabel("");
      }
      onRefresh?.();
    } catch (error) {
      console.error("Error deleting repair card:", error);
    }
  };

  const handleStatusChange = async (item, newStatus) => {
    try {
      await updateDoc(doc(db, COLLECTION_NAME, item.id), {
        status: newStatus,
      });
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: newStatus } : it))
      );
      onRefresh?.();
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "미완료" ? -1 : 1;
      }
      return a.createdAtMs - b.createdAtMs;
    });
  }, [items]);

  return (
    <section className="repair-content documents-section">
      <div className="documents-header">
        <h2 className="documents-title">고장&수리</h2>
        <div className="documents-actions">
          <button
            type="button"
            className="create-button"
            onClick={handleAddCard}
            disabled={!user}
          >
            카드 추가
          </button>
        </div>
      </div>
      <div className="repair-grid">
        {isLoading ? (
          <div className="repair-loading">로딩 중...</div>
        ) : sortedItems.length === 0 ? (
          <div className="repair-empty">카드가 없습니다. 카드 추가 버튼을 눌러 추가하세요.</div>
        ) : (
          sortedItems.map((item) => (
            <div key={item.id} className="repair-card">
              {editingId === item.id ? (
                <div className="repair-card-edit">
                  <div className="repair-card-top">
                    <span className="repair-card-date">
                      작성일자: {item.createdAt}
                    </span>
                    <div className="repair-card-actions">
                      <button
                        type="button"
                        className="edit-button"
                        onClick={handleSaveEdit}
                      >
                        저장
                      </button>
                      <button
                        type="button"
                        className="repair-cancel-edit-button"
                        onClick={handleCancelEdit}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                  <textarea
                    className="repair-card-edit-textarea"
                    value={editingLabel}
                    onChange={(e) => setEditingLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") handleCancelEdit();
                    }}
                    placeholder="내용을 입력하세요..."
                    autoFocus
                  />
                </div>
              ) : (
                <>
                  <div className="repair-card-top">
                    <span className="repair-card-date">
                      작성일자: {item.createdAt}
                    </span>
                    <div className="repair-card-actions">
                      <button
                        type="button"
                        className="edit-button"
                        onClick={() => handleEdit(item)}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => handleDelete(item)}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                  <span className="repair-card-label">
                    {item.label || "(내용 없음)"}
                  </span>
                  <div className="repair-card-bottom">
                    <span className="repair-status-label">수리상태:</span>
                    <div className="repair-status-buttons">
                      <button
                        type="button"
                        className={`repair-status-btn ${item.status === "미완료" ? "active" : ""}`}
                        onClick={() => handleStatusChange(item, "미완료")}
                      >
                        미완료
                      </button>
                      <button
                        type="button"
                        className={`repair-status-btn ${item.status === "완료" ? "active" : ""}`}
                        onClick={() => handleStatusChange(item, "완료")}
                      >
                        완료
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default RepairContent;
