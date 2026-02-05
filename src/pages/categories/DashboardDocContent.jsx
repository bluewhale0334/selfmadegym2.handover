import { useEffect, useMemo, useRef, useState } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../firebase";

const DEFAULT_DOC_TITLE = "새 문서";
const DEFAULT_TOGGLE_TITLE = "토글";
const EDITOR_MODULES = {
  toolbar: [
    [{ size: ["small", false, "large", "huge"] }],
    ["bold"],
    [{ list: "bullet" }],
  ],
};
const EDITOR_FORMATS = ["size", "bold", "list", "bullet"];
function DashboardDocContent({ user }) {
  const [docs, setDocs] = useState([]);
  const [activeId, setActiveId] = useState("");
  const activeIdRef = useRef("");
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftToggles, setDraftToggles] = useState([]);
  const [docError, setDocError] = useState("");
  const [collapsedToggleIds, setCollapsedToggleIds] = useState({});
  const normalizeQuillContent = (content) => {
    if (!content) return "";
    if (!content.includes("<")) return content;
    return content.replace(
      /(<p><br\s*\/?><\/p>\s*){2,}/g,
      "<p><br></p>"
    );
  };
  const normalizeToggles = (toggles, content) => {
    const safeToggles = Array.isArray(toggles) ? toggles : [];
    const normalized = safeToggles.map((toggle, index) => ({
      id: toggle.id || `toggle-${index}-${Date.now()}`,
      title: toggle.title || DEFAULT_TOGGLE_TITLE,
      content: normalizeQuillContent(toggle.content || ""),
    }));
    if (!normalized.length && content) {
      normalized.push({
        id: `toggle-legacy-${Date.now()}`,
        title: DEFAULT_TOGGLE_TITLE,
        content: normalizeQuillContent(content),
      });
    }
    return normalized;
  };
  const formatDisplayContent = (content) => {
    if (!content) return "";
    if (content.includes("<")) return content;
    return content.replace(/\n/g, "<br />");
  };
  const activeDoc = useMemo(
    () => docs.find((doc) => doc.id === activeId) || docs[0],
    [docs, activeId]
  );
  const displayToggles = useMemo(
    () => normalizeToggles(activeDoc?.toggles, activeDoc?.content),
    [activeDoc]
  );

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    if (!user) {
      setDocs([]);
      setActiveId("");
      setIsEditing(false);
      setDocError("");
      return;
    }

    const q = query(collection(db, "dashboardDocs"), orderBy("order", "asc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextDocs = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setDocs(nextDocs);
        setDocError("");
        if (!nextDocs.length) {
          setActiveId("");
          setIsEditing(false);
          return;
        }
        const hasActive = nextDocs.some(
          (docItem) => docItem.id === activeIdRef.current
        );
        if (!hasActive) {
          setActiveId(nextDocs[0].id);
        }
      },
      (error) => {
        console.error("Error loading dashboard docs:", error);
        setDocError("문서를 불러오지 못했습니다.");
      }
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!activeDoc || isEditing) return;
    setDraftTitle(activeDoc.title || DEFAULT_DOC_TITLE);
    setDraftToggles(normalizeToggles(activeDoc.toggles, activeDoc.content));
    setCollapsedToggleIds((prev) => {
      const next = { ...prev };
      const toggles = normalizeToggles(activeDoc.toggles, activeDoc.content);
      toggles.forEach((toggle) => {
        if (next[toggle.id] === undefined) {
          next[toggle.id] = true;
        }
      });
      return next;
    });
  }, [activeDoc, isEditing]);

  const startEditing = (docItem) => {
    if (!docItem) return;
    setIsEditing(true);
    setDraftTitle(docItem.title || DEFAULT_DOC_TITLE);
    setDraftToggles(normalizeToggles(docItem.toggles, docItem.content));
  };

  const handleSelectDoc = (docId) => {
    const nextDoc = docs.find((docItem) => docItem.id === docId);
    if (!nextDoc) return;
    setActiveId(docId);
    if (isEditing) {
      setDraftTitle(nextDoc.title || DEFAULT_DOC_TITLE);
      setDraftToggles(normalizeToggles(nextDoc.toggles, nextDoc.content));
    }
  };

  const handleAddDoc = async () => {
    if (!user) return;
    const nextOrder = docs.length
      ? Math.max(...docs.map((docItem) => Number(docItem.order) || 0)) + 1
      : 0;
    const initialToggle = {
      id: `toggle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: DEFAULT_TOGGLE_TITLE,
      content: "",
    };
    try {
      const docRef = await addDoc(collection(db, "dashboardDocs"), {
        title: DEFAULT_DOC_TITLE,
        content: "",
        toggles: [initialToggle],
        order: nextOrder,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user.uid,
      });
      setActiveId(docRef.id);
      setIsEditing(true);
      setDraftTitle(DEFAULT_DOC_TITLE);
      setDraftToggles([initialToggle]);
    } catch (error) {
      console.error("Error creating dashboard doc:", error);
      setDocError("문서를 추가하지 못했습니다.");
    }
  };

  const handleDeleteDoc = async () => {
    if (!activeDoc) return;
    if (docs.length === 1) return;
    try {
      await deleteDoc(doc(db, "dashboardDocs", activeDoc.id));
      setIsEditing(false);
    } catch (error) {
      console.error("Error deleting dashboard doc:", error);
      setDocError("문서를 삭제하지 못했습니다.");
    }
  };

  const handleSaveDoc = async () => {
    if (!activeDoc) return;
    const nextTitle = draftTitle.trim() || "제목 없음";
    const nextToggles = draftToggles.map((toggle) => ({
      id: toggle.id,
      title: (toggle.title || "").trim() || DEFAULT_TOGGLE_TITLE,
      content: normalizeQuillContent(toggle.content || ""),
    }));
    try {
      await updateDoc(doc(db, "dashboardDocs", activeDoc.id), {
        title: nextTitle,
        content: "",
        toggles: nextToggles,
        updatedAt: serverTimestamp(),
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Error saving dashboard doc:", error);
      setDocError("문서를 저장하지 못했습니다.");
    }
  };

  const handleAddToggle = () => {
    if (!activeDoc) return;
    if (!isEditing) {
      startEditing(activeDoc);
    }
    const nextToggle = {
      id: `toggle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: DEFAULT_TOGGLE_TITLE,
      content: "",
    };
    setDraftToggles((prev) => [...prev, nextToggle]);
    setCollapsedToggleIds((prev) => ({
      ...prev,
      [nextToggle.id]: true,
    }));
  };

  const handleToggleTitleChange = (toggleId, value) => {
    setDraftToggles((prev) =>
      prev.map((toggle) =>
        toggle.id === toggleId ? { ...toggle, title: value } : toggle
      )
    );
  };

  const handleToggleContentChange = (toggleId, value) => {
    setDraftToggles((prev) =>
      prev.map((toggle) =>
        toggle.id === toggleId ? { ...toggle, content: value } : toggle
      )
    );
  };

  const handleDeleteToggle = (toggleId) => {
    setDraftToggles((prev) => prev.filter((toggle) => toggle.id !== toggleId));
  };

  const handleToggleCollapse = (toggleId) => {
    setCollapsedToggleIds((prev) => ({
      ...prev,
      [toggleId]: !prev[toggleId],
    }));
  };

  return (
    <div className="dashboard-left-box">
      <div className="dashboard-doc-header">
        <div className="dashboard-doc-actions">
          <button
            type="button"
            className="dashboard-box-add"
            aria-label="항목 추가"
            onClick={handleAddDoc}
          >
            <img
              className="dashboard-box-add-icon"
              src="https://i.postimg.cc/7ZZtvkg8/Group-80.png"
              alt=""
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            className="dashboard-doc-action"
            onClick={() => startEditing(activeDoc)}
            disabled={!activeDoc}
          >
            수정
          </button>
          <button
            type="button"
            className={[
              "dashboard-doc-action",
              isEditing ? "is-accent" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={handleSaveDoc}
            disabled={!isEditing}
          >
            저장
          </button>
          <button
            type="button"
            className="dashboard-doc-action danger"
            onClick={handleDeleteDoc}
            disabled={!activeDoc || docs.length === 1}
          >
            삭제
          </button>
        </div>
      </div>
      <div className="dashboard-doc-tabs">
        {docs.map((doc, index) => (
          <button
            key={doc.id}
            type="button"
            className={[
              "dashboard-box-tab",
              doc.id === activeDoc?.id ? "is-active" : "",
              index === 0 ? "is-main" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => handleSelectDoc(doc.id)}
          >
            {doc.title}
          </button>
        ))}
      </div>
      <div className="dashboard-doc-content">
        {!user && <p className="dashboard-box-body">로그인이 필요합니다.</p>}
        {user && docError && <p className="dashboard-box-body">{docError}</p>}
        {isEditing ? (
          <>
            <input
              className="dashboard-doc-input"
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              placeholder="제목"
            />
            <div className="dashboard-doc-toggle-grid">
              {draftToggles.map((toggle) => (
                <div key={toggle.id} className="dashboard-doc-toggle-card is-editing">
                  <input
                    className="dashboard-doc-toggle-title-input"
                    value={toggle.title}
                    onChange={(event) =>
                      handleToggleTitleChange(toggle.id, event.target.value)
                    }
                    placeholder="토글 제목"
                  />
                  <div className="dashboard-doc-toggle-content">
                    <ReactQuill
                      className="dashboard-doc-editor"
                      theme="snow"
                      value={toggle.content}
                      onChange={(value) =>
                        handleToggleContentChange(toggle.id, value)
                      }
                      modules={EDITOR_MODULES}
                      formats={EDITOR_FORMATS}
                      placeholder="토글 내용"
                    />
                  </div>
                  <div className="dashboard-doc-toggle-actions">
                    <button
                      type="button"
                      className="dashboard-doc-toggle-delete"
                      onClick={() => handleDeleteToggle(toggle.id)}
                    >
                      토글 삭제
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="dashboard-doc-toggle-add"
                onClick={handleAddToggle}
              >
                토글 추가
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="dashboard-doc-title">
              {activeDoc?.title || DEFAULT_DOC_TITLE}
            </h3>
            <div className="dashboard-doc-toggle-grid">
              {displayToggles.map((toggle) => {
                const isCollapsed = collapsedToggleIds[toggle.id] ?? true;
                return (
                  <div key={toggle.id} className="dashboard-doc-toggle-card">
                    <div className="dashboard-doc-toggle-header">
                      <button
                        type="button"
                        className="dashboard-doc-toggle-title"
                        onClick={() => handleToggleCollapse(toggle.id)}
                      >
                        {toggle.title || DEFAULT_TOGGLE_TITLE}
                      </button>
                      <button
                        type="button"
                        className="dashboard-doc-toggle-state"
                        onClick={() => handleToggleCollapse(toggle.id)}
                      >
                        {isCollapsed ? "펼치기" : "접기"}
                      </button>
                    </div>
                    {!isCollapsed && (
                      <div className="dashboard-doc-toggle-body">
                        {toggle.content ? (
                          <div
                            dangerouslySetInnerHTML={{
                              __html: formatDisplayContent(toggle.content),
                            }}
                          />
                        ) : (
                          "내용이 없습니다."
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                className="dashboard-doc-toggle-add"
                onClick={handleAddToggle}
              >
                토글 추가
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default DashboardDocContent;
