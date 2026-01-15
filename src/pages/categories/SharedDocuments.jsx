import { useRef, useState, useEffect } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, onSnapshot, serverTimestamp, Timestamp, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import DatePicker from "./DatePicker";
import "./SharedDocuments.css";

// 카테고리 이름을 Firestore 컬렉션 이름으로 매핑
const getCollectionName = (category) => {
  const mapping = {
    "전체 공지": "notices",
    "업무 지시": "instructions",
    "일일 인수인계": "handovers",
    "업무 진행사항": "progresses",
    "업무 체크리스트": "checklists",
  };
  return mapping[category] || null;
};

function SharedDocuments({ category, selectedDate, onNavigateToCategory, onDateSelect, user, profile, globalRefreshKey, onRefresh }) {
  const textareaRef = useRef(null);
  const [isWriting, setIsWriting] = useState(false);
  const [content, setContent] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showWriteDatePicker, setShowWriteDatePicker] = useState(false);
  const [writeDate, setWriteDate] = useState(null); // 작성 시 선택한 날짜
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingContent, setEditingContent] = useState("");
  const editTextareaRef = useRef(null);
  const [commentingDocumentId, setCommentingDocumentId] = useState(null);
  const [commentContent, setCommentContent] = useState("");
  const commentTextareaRef = useRef(null);
  const [editingComment, setEditingComment] = useState(null); // {documentId, commentIndex}
  const [editingCommentContent, setEditingCommentContent] = useState("");
  const editCommentTextareaRef = useRef(null);

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}월 ${day}일`;
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const hours = date.getHours();
    return `${hours}시`;
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

  const isDateView = selectedDate !== null;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [content]);

  useEffect(() => {
    if (editTextareaRef.current && editingId) {
      editTextareaRef.current.style.height = "auto";
      editTextareaRef.current.style.height = `${editTextareaRef.current.scrollHeight}px`;
    }
  }, [editingContent, editingId]);

  useEffect(() => {
    if (commentTextareaRef.current && commentingDocumentId) {
      commentTextareaRef.current.style.height = "auto";
      commentTextareaRef.current.style.height = `${commentTextareaRef.current.scrollHeight}px`;
    }
  }, [commentContent, commentingDocumentId]);

  useEffect(() => {
    if (editCommentTextareaRef.current && editingComment) {
      editCommentTextareaRef.current.style.height = "auto";
      editCommentTextareaRef.current.style.height = `${editCommentTextareaRef.current.scrollHeight}px`;
    }
  }, [editingCommentContent, editingComment]);

  // Firestore에서 문서 가져오기
  useEffect(() => {
    const collectionName = getCollectionName(category);
    if (!collectionName || !user) return;

    setIsLoading(true);
    let q;

    console.log("Fetching documents:", { category, selectedDate, collectionName });

    if (category === "업무 체크리스트") {
      // 체크리스트는 사용자별 필터링
      if (selectedDate) {
        q = query(
          collection(db, collectionName),
          where("userId", "==", user.uid),
          where("date", "==", selectedDate),
          orderBy("createdAt", "desc")
        );
      } else {
        // 단일 orderBy만 사용하고 클라이언트에서 정렬
        q = query(
          collection(db, collectionName),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc")
        );
      }
    } else if (category === "전체 공지") {
      // 전체 공지는 날짜 필드 없음
      q = query(collection(db, collectionName), orderBy("createdAt", "desc"));
    } else {
      // 나머지는 날짜 필터링
      if (selectedDate) {
        // 하위 카테고리: 정확히 해당 날짜만 필터링
        q = query(
          collection(db, collectionName),
          where("date", "==", selectedDate),
          orderBy("createdAt", "desc")
        );
      } else {
        // 상위 카테고리: 모든 문서 가져오기 (날짜 필터링 없음)
        q = query(
          collection(db, collectionName),
          orderBy("createdAt", "desc")
        );
      }
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        console.log("onSnapshot triggered:", {
          category,
          selectedDate,
          snapshotSize: snapshot.size,
        });
        
        let docs = snapshot.docs
          .map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
            };
          })
          // 플래그 문서 제외 (isDateFlag가 true인 문서는 제외)
          .filter((doc) => !doc.isDateFlag);

        // 하위 카테고리(selectedDate가 있을 때)는 이미 Firestore에서 필터링되었으므로 추가 필터링 불필요
        // 상위 카테고리(selectedDate가 없을 때)만 클라이언트에서 날짜별 정렬
        if (!selectedDate && category !== "전체 공지") {
          // 날짜별 정렬, 그 다음 생성 시간별 정렬
          docs = docs.sort((a, b) => {
            if (a.date && b.date) {
              const dateCompare = b.date.localeCompare(a.date);
              if (dateCompare !== 0) return dateCompare;
            }
            // createdAt으로 정렬
            const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return bTime - aTime;
          });
        }

        // 하위 카테고리: 정확히 해당 날짜만 필터링 (안전장치)
        if (selectedDate) {
          docs = docs.filter((doc) => doc.date === selectedDate);
        }

        console.log("Documents loaded:", {
          category,
          selectedDate,
          count: docs.length,
          dates: docs.map((d) => d.date),
          readByCounts: docs.map((d) => d.readBy?.length || 0),
        });

        // onSnapshot이 실제 문서를 받아오면 임시 문서는 자동으로 제거됨 (임시 문서는 temp-로 시작하는 ID를 가지므로)
        setDocuments(docs);
        setIsLoading(false);
      },
      (error) => {
        console.error("Error fetching documents:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        // 에러가 발생해도 리스너는 계속 작동하도록 함
        setIsLoading(false);
        // 에러가 발생해도 기존 문서는 유지
      }
    );

    return () => unsubscribe();
  }, [category, selectedDate, user, globalRefreshKey]); // globalRefreshKey만 사용

  const handleSubmit = async () => {
    if (!content.trim()) {
      setError("내용을 입력해주세요.");
      return;
    }

    if (!user) {
      setError("로그인이 필요합니다.");
      return;
    }

    if (!profile) {
      setError("프로필 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    const collectionName = getCollectionName(category);
    if (!collectionName) {
      setError("카테고리를 찾을 수 없습니다.");
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const docData = {
        content: content.trim(),
        authorId: user.uid,
        authorName: profile.name || user.displayName || "사용자",
        tagColor: profile.tagColor || "gray",
        createdAt: serverTimestamp(),
      };

      // 날짜가 필요한 카테고리면 날짜 추가
      let documentDate = null;
      if (category !== "전체 공지") {
        // 작성 시 선택한 날짜가 있으면 우선 사용, 없으면 현재 선택된 날짜, 그것도 없으면 오늘 날짜
        if (writeDate) {
          documentDate = writeDate;
        } else if (selectedDate) {
          documentDate = selectedDate;
        } else {
          // 날짜가 선택되지 않았으면 오늘 날짜 사용
          const today = new Date();
          const year = today.getFullYear();
          const month = String(today.getMonth() + 1).padStart(2, "0");
          const day = String(today.getDate()).padStart(2, "0");
          documentDate = `${year}-${month}-${day}`;
        }
        docData.date = documentDate;
      }

      // 체크리스트는 userId 추가
      if (category === "업무 체크리스트") {
        docData.userId = user.uid;
      }

      console.log("Adding document to collection:", collectionName);
      console.log("Document data:", docData);

      // 낙관적 업데이트: 즉시 로컬 상태에 추가
      const tempDoc = {
        id: `temp-${Date.now()}`,
        content: content.trim(),
        authorId: user.uid,
        authorName: profile.name || user.displayName || "사용자",
        tagColor: profile.tagColor || "gray",
        createdAt: Timestamp.now(), // 임시로 현재 시간 사용
        readBy: [],
        ...(documentDate && { date: documentDate }),
        ...(category === "업무 체크리스트" && { userId: user.uid }),
      };
      
      setDocuments((prevDocs) => {
        // 날짜 필터링 확인
        if (selectedDate && documentDate !== selectedDate) {
          return prevDocs; // 다른 날짜면 추가하지 않음
        }
        if (!selectedDate && category !== "전체 공지" && documentDate) {
          // 날짜별 정렬 필요
          const newDocs = [...prevDocs, tempDoc];
          return newDocs.sort((a, b) => {
            if (a.date && b.date) {
              const dateCompare = b.date.localeCompare(a.date);
              if (dateCompare !== 0) return dateCompare;
            }
            const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return bTime - aTime;
          });
        }
        return [tempDoc, ...prevDocs];
      });
      
      const docRef = await addDoc(collection(db, collectionName), docData);
      console.log("Document added successfully:", docRef.id);
      
      // 저장된 날짜가 현재 선택된 날짜와 다르면 해당 날짜로 이동
      if (category !== "전체 공지" && documentDate && documentDate !== selectedDate) {
        onDateSelect?.(category, documentDate);
      }
      
      // 상태 초기화
      setContent("");
      setWriteDate(null);
      setIsWriting(false);
      setError(null);
      
      // 전역 리프레시 트리거 (카드 섹션, 사이드바도 업데이트)
      onRefresh?.();
      // onSnapshot이 나중에 서버 상태와 동기화함
    } catch (error) {
      console.error("Error adding document:", error);
      console.error("Error code:", error.code);
      console.error("Error message:", error.message);
      
      let errorMessage = "문서 등록에 실패했습니다.";
      if (error.code === "permission-denied") {
        errorMessage = "권한이 없습니다. 로그인 상태를 확인해주세요.";
      } else if (error.code === "unavailable") {
        errorMessage = "네트워크 오류가 발생했습니다. 다시 시도해주세요.";
      } else if (error.message) {
        errorMessage = `오류: ${error.message}`;
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (document) => {
    setEditingId(document.id);
    setEditingContent(document.content);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingContent("");
    setError(null);
  };

  const handleUpdate = async (documentId) => {
    if (!editingContent.trim()) {
      setError("내용을 입력해주세요.");
      return;
    }

    const collectionName = getCollectionName(category);
    if (!collectionName) {
      setError("카테고리를 찾을 수 없습니다.");
      return;
    }

    // 권한 체크
    const originalDoc = documents.find((d) => d.id === documentId);
    if (!originalDoc) {
      setError("문서를 찾을 수 없습니다.");
      return;
    }

    if (!isOwner(originalDoc)) {
      setError("본인이 작성한 문서만 수정할 수 있습니다.");
      return;
    }

    setError(null);
    
    // 낙관적 업데이트: 즉시 로컬 상태 업데이트 (권한 확인 후)
    setDocuments((prevDocs) =>
      prevDocs.map((doc) =>
        doc.id === documentId
          ? { ...doc, content: editingContent.trim() }
          : doc
      )
    );

    try {
      const docRef = doc(db, collectionName, documentId);
      await updateDoc(docRef, {
        content: editingContent.trim(),
      });
      
      setEditingId(null);
      setEditingContent("");
      setError(null);
      
      // 전역 리프레시 트리거 (카드 섹션, 사이드바도 업데이트)
      onRefresh?.();
      // onSnapshot이 나중에 서버 상태와 동기화함
    } catch (error) {
      console.error("Error updating document:", error);
      
      // 에러 발생 시 로컬 상태 롤백
      setDocuments((prevDocs) =>
        prevDocs.map((doc) =>
          doc.id === documentId ? originalDoc : doc
        )
      );
      
      let errorMessage = "문서 수정에 실패했습니다.";
      if (error.code === "permission-denied") {
        errorMessage = "권한이 없습니다. 본인이 작성한 문서인지 확인해주세요.";
      } else if (error.message) {
        errorMessage = `오류: ${error.message}`;
      }
      setError(errorMessage);
    }
  };

  const handleDelete = async (documentId) => {
    if (!window.confirm("정말 이 문서를 삭제하시겠습니까?")) {
      return;
    }

    const collectionName = getCollectionName(category);
    if (!collectionName) {
      setError("카테고리를 찾을 수 없습니다.");
      return;
    }

    // 권한 체크
    const deletedDoc = documents.find((d) => d.id === documentId);
    if (!deletedDoc) {
      setError("문서를 찾을 수 없습니다.");
      return;
    }

    if (!isOwner(deletedDoc)) {
      setError("본인이 작성한 문서만 삭제할 수 있습니다.");
      return;
    }

    setError(null);
    
    // 낙관적 업데이트: 즉시 로컬 상태에서 제거 (권한 확인 후)
    setDocuments((prevDocs) => prevDocs.filter((doc) => doc.id !== documentId));

    try {
      const docRef = doc(db, collectionName, documentId);
      await deleteDoc(docRef);
      setError(null);
      
      // 전역 리프레시 트리거 (카드 섹션, 사이드바도 업데이트)
      onRefresh?.();
      // onSnapshot이 나중에 서버 상태와 동기화함
    } catch (error) {
      console.error("Error deleting document:", error);
      
      // 에러 발생 시 로컬 상태 롤백
      setDocuments((prevDocs) => {
        const newDocs = [...prevDocs, deletedDoc];
        // 정렬 복원
        if (!selectedDate && category !== "전체 공지") {
          return newDocs.sort((a, b) => {
            if (a.date && b.date) {
              const dateCompare = b.date.localeCompare(a.date);
              if (dateCompare !== 0) return dateCompare;
            }
            const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return bTime - aTime;
          });
        }
        return newDocs.sort((a, b) => {
          const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return bTime - aTime;
        });
      });
      
      let errorMessage = "문서 삭제에 실패했습니다.";
      if (error.code === "permission-denied") {
        errorMessage = "권한이 없습니다. 본인이 작성한 문서인지 확인해주세요.";
      } else if (error.message) {
        errorMessage = `오류: ${error.message}`;
      }
      setError(errorMessage);
    }
  };

  const isOwner = (document) => {
    return user && document.authorId === user.uid;
  };

  const hasRead = (document) => {
    if (!user || !document.readBy) return false;
    return document.readBy.some((reader) => reader.userId === user.uid);
  };

  const handleAddComment = (documentId) => {
    setCommentingDocumentId(documentId);
    setCommentContent("");
    setError(null);
  };

  const handleCancelComment = () => {
    setCommentingDocumentId(null);
    setCommentContent("");
    setError(null);
  };

  const handleSubmitComment = async (documentId) => {
    if (!commentContent.trim()) {
      setError("댓글 내용을 입력해주세요.");
      return;
    }

    if (!user) {
      setError("로그인이 필요합니다.");
      return;
    }

    const collectionName = getCollectionName(category);
    if (!collectionName) {
      setError("카테고리를 찾을 수 없습니다.");
      return;
    }

    setError(null);

    // 최신 프로필 정보 가져오기
    let currentProfile = profile;
    if (!currentProfile || !currentProfile.tagColor) {
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          currentProfile = userDoc.data();
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
      }
    }

    // 프로필 정보가 없으면 기본값 사용
    const userName = currentProfile?.name || user.displayName || "사용자";
    const tagColor = currentProfile?.tagColor || "gray";

    // 낙관적 업데이트: 즉시 로컬 상태에 댓글 추가
    const newComment = {
      userId: user.uid,
      userName: userName,
      tagColor: tagColor,
      content: commentContent.trim(),
      createdAt: Timestamp.now(),
    };

    setDocuments((prevDocs) =>
      prevDocs.map((doc) =>
        doc.id === documentId
          ? {
              ...doc,
              comments: [...(doc.comments || []), newComment],
            }
          : doc
      )
    );

    try {
      const docRef = doc(db, collectionName, documentId);
      
      // 현재 문서의 댓글 목록 가져오기 (낙관적 업데이트 전 상태 사용)
      const originalDoc = documents.find((d) => d.id === documentId);
      const currentComments = originalDoc?.comments || [];
      
      // serverTimestamp()는 배열 내부에서 사용할 수 없으므로 Timestamp.now() 사용
      const newCommentTimestamp = Timestamp.now();
      
      await updateDoc(docRef, {
        comments: [
          ...currentComments,
          {
            userId: user.uid,
            userName: userName,
            tagColor: tagColor,
            content: commentContent.trim(),
            createdAt: newCommentTimestamp,
          },
        ],
      });

      setCommentingDocumentId(null);
      setCommentContent("");
      setError(null);
      onRefresh?.();
    } catch (error) {
      console.error("Error adding comment:", error);
      
      // 에러 발생 시 로컬 상태 롤백
      setDocuments((prevDocs) =>
        prevDocs.map((doc) =>
          doc.id === documentId
            ? {
                ...doc,
                comments: documents.find((d) => d.id === documentId)?.comments || [],
              }
            : doc
        )
      );

      let errorMessage = "댓글 등록에 실패했습니다.";
      if (error.code === "permission-denied") {
        errorMessage = "권한이 없습니다.";
      } else if (error.message) {
        errorMessage = `오류: ${error.message}`;
      }
      setError(errorMessage);
    }
  };

  const handleEditComment = (documentId, commentIndex) => {
    const document = documents.find((d) => d.id === documentId);
    if (!document || !document.comments || !document.comments[commentIndex]) {
      return;
    }
    const comment = document.comments[commentIndex];
    if (comment.userId !== user?.uid) {
      setError("본인이 작성한 댓글만 수정할 수 있습니다.");
      return;
    }
    setEditingComment({ documentId, commentIndex });
    setEditingCommentContent(comment.content);
    setError(null);
  };

  const handleCancelEditComment = () => {
    setEditingComment(null);
    setEditingCommentContent("");
    setError(null);
  };

  const handleUpdateComment = async (documentId, commentIndex) => {
    if (!editingCommentContent.trim()) {
      setError("댓글 내용을 입력해주세요.");
      return;
    }

    if (!user) {
      setError("로그인이 필요합니다.");
      return;
    }

    const collectionName = getCollectionName(category);
    if (!collectionName) {
      setError("카테고리를 찾을 수 없습니다.");
      return;
    }

    const document = documents.find((d) => d.id === documentId);
    if (!document || !document.comments || !document.comments[commentIndex]) {
      setError("댓글을 찾을 수 없습니다.");
      return;
    }

    const comment = document.comments[commentIndex];
    if (comment.userId !== user.uid) {
      setError("본인이 작성한 댓글만 수정할 수 있습니다.");
      return;
    }

    setError(null);

    // 낙관적 업데이트: 즉시 로컬 상태 업데이트
    const updatedComments = [...(document.comments || [])];
    updatedComments[commentIndex] = {
      ...updatedComments[commentIndex],
      content: editingCommentContent.trim(),
    };

    setDocuments((prevDocs) =>
      prevDocs.map((doc) =>
        doc.id === documentId
          ? {
              ...doc,
              comments: updatedComments,
            }
          : doc
      )
    );

    try {
      const docRef = doc(db, collectionName, documentId);
      await updateDoc(docRef, {
        comments: updatedComments,
      });

      setEditingComment(null);
      setEditingCommentContent("");
      setError(null);
      onRefresh?.();
    } catch (error) {
      console.error("Error updating comment:", error);

      // 에러 발생 시 로컬 상태 롤백
      setDocuments((prevDocs) =>
        prevDocs.map((doc) =>
          doc.id === documentId
            ? {
                ...doc,
                comments: document.comments || [],
              }
            : doc
        )
      );

      let errorMessage = "댓글 수정에 실패했습니다.";
      if (error.code === "permission-denied") {
        errorMessage = "권한이 없습니다.";
      } else if (error.message) {
        errorMessage = `오류: ${error.message}`;
      }
      setError(errorMessage);
    }
  };

  const handleDeleteComment = async (documentId, commentIndex) => {
    if (!window.confirm("정말 이 댓글을 삭제하시겠습니까?")) {
      return;
    }

    if (!user) {
      setError("로그인이 필요합니다.");
      return;
    }

    const collectionName = getCollectionName(category);
    if (!collectionName) {
      setError("카테고리를 찾을 수 없습니다.");
      return;
    }

    const document = documents.find((d) => d.id === documentId);
    if (!document || !document.comments || !document.comments[commentIndex]) {
      setError("댓글을 찾을 수 없습니다.");
      return;
    }

    const comment = document.comments[commentIndex];
    if (comment.userId !== user.uid) {
      setError("본인이 작성한 댓글만 삭제할 수 있습니다.");
      return;
    }

    setError(null);

    // 낙관적 업데이트: 즉시 로컬 상태에서 제거
    const updatedComments = [...(document.comments || [])];
    updatedComments.splice(commentIndex, 1);

    setDocuments((prevDocs) =>
      prevDocs.map((doc) =>
        doc.id === documentId
          ? {
              ...doc,
              comments: updatedComments,
            }
          : doc
      )
    );

    try {
      const docRef = doc(db, collectionName, documentId);
      await updateDoc(docRef, {
        comments: updatedComments,
      });

      setError(null);
      onRefresh?.();
    } catch (error) {
      console.error("Error deleting comment:", error);

      // 에러 발생 시 로컬 상태 롤백
      setDocuments((prevDocs) =>
        prevDocs.map((doc) =>
          doc.id === documentId
            ? {
                ...doc,
                comments: document.comments || [],
              }
            : doc
        )
      );

      let errorMessage = "댓글 삭제에 실패했습니다.";
      if (error.code === "permission-denied") {
        errorMessage = "권한이 없습니다.";
      } else if (error.message) {
        errorMessage = `오류: ${error.message}`;
      }
      setError(errorMessage);
    }
  };

  const handleMarkAsRead = async (document) => {
    if (!user || !profile) {
      setError("사용자 정보가 없습니다. 다시 로그인해주세요.");
      return;
    }

    const collectionName = getCollectionName(category);
    if (!collectionName) {
      setError("카테고리를 찾을 수 없습니다.");
      return;
    }

    // 이미 확인했는지 체크
    if (hasRead(document)) {
      return;
    }

    setError(null);
    
    // 즉시 로컬 상태 업데이트 (낙관적 업데이트)
    const currentReadBy = document.readBy || [];
    const newReader = {
      userId: user.uid,
      userName: profile.name || user.displayName || "사용자",
      tagColor: profile.tagColor || "gray",
      readAt: Timestamp.now(),
    };
    
    const newReadBy = [...currentReadBy, newReader];
    
    // 로컬 상태 즉시 업데이트
    setDocuments((prevDocs) =>
      prevDocs.map((doc) =>
        doc.id === document.id
          ? { ...doc, readBy: newReadBy }
          : doc
      )
    );
    
    try {
      const docRef = doc(db, collectionName, document.id);
      
      console.log("Updating readBy:", {
        collection: collectionName,
        docId: document.id,
        currentReadByLength: currentReadBy.length,
        newReadByLength: newReadBy.length,
      });
      
      await updateDoc(docRef, {
        readBy: newReadBy,
      });
      
      console.log("Successfully marked as read - local state updated, onSnapshot will sync");
      
      // 전역 리프레시 트리거 (카드 섹션, 사이드바도 업데이트)
      onRefresh?.();
      // onSnapshot이 나중에 서버 상태와 동기화함
    } catch (error) {
      console.error("Error marking as read:", error);
      console.error("Error code:", error.code);
      console.error("Error message:", error.message);
      
      // 에러 발생 시 로컬 상태 롤백
      setDocuments((prevDocs) =>
        prevDocs.map((doc) =>
          doc.id === document.id
            ? { ...doc, readBy: currentReadBy }
            : doc
        )
      );
      
      let errorMessage = "확인 처리에 실패했습니다.";
      if (error.code === "permission-denied") {
        errorMessage = "권한이 없습니다. Firestore 규칙을 확인해주세요.";
      } else if (error.code === "unavailable") {
        errorMessage = "네트워크 오류가 발생했습니다.";
      } else {
        errorMessage = `오류: ${error.message || error.code}`;
      }
      setError(errorMessage);
    }
  };

  return (
    <section className="documents-section">
      <div className="documents-header">
        <h2 className="documents-title">문서 목록</h2>
        <div className="documents-actions">
          {isDateView && (
            <button
              type="button"
              className="view-all-button"
              onClick={() => onNavigateToCategory?.(category)}
            >
              전체보기
            </button>
          )}
          <button
            type="button"
            className="date-picker-button"
            onClick={() => setShowDatePicker(!showDatePicker)}
          >
            {isDateView ? formatDate(selectedDate) : "날짜 선택"}
          </button>
          <button
            type="button"
            className="create-button"
            onClick={() => {
              setIsWriting(!isWriting);
              setEditingId(null); // 작성 모드 진입 시 편집 모드 해제
              setContent("");
              setWriteDate(null); // 작성 모드 진입 시 날짜 초기화
              setError(null);
            }}
          >
            {isWriting ? "취소" : "작성하기"}
          </button>
        </div>
      </div>
      {showDatePicker && (
        <DatePicker
          selectedDate={selectedDate}
          onSelect={(date) => {
            onDateSelect?.(category, date);
            setShowDatePicker(false);
          }}
          onClose={() => setShowDatePicker(false)}
        />
      )}
      {isWriting && (
        <div className="write-form">
          {category !== "전체 공지" && (
            <div className="write-date-selector">
              <label className="write-date-label">작성 날짜</label>
              <button
                type="button"
                className="write-date-button"
                onClick={() => setShowWriteDatePicker(!showWriteDatePicker)}
              >
                {writeDate ? formatDate(writeDate) : selectedDate ? formatDate(selectedDate) : "날짜 선택"}
              </button>
            </div>
          )}
          <textarea
            ref={textareaRef}
            className="write-textarea"
            placeholder="내용을 입력하세요..."
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setError(null);
            }}
            rows={1}
          />
          {error && (
            <div className="error-message">{error}</div>
          )}
          <div className="write-actions">
            <button
              type="button"
              className="submit-button"
              onClick={handleSubmit}
              disabled={isLoading || !content.trim()}
            >
              {isLoading ? "등록 중..." : "등록"}
            </button>
            <button
              type="button"
              className="cancel-button"
              onClick={() => {
                setIsWriting(false);
                setContent("");
                setWriteDate(null);
                setError(null);
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}
      {showWriteDatePicker && (
        <DatePicker
          selectedDate={writeDate || selectedDate}
          onSelect={(date) => {
            setWriteDate(date);
            setShowWriteDatePicker(false);
          }}
          onClose={() => setShowWriteDatePicker(false)}
        />
      )}
      <div className="documents-list">
        {isLoading && documents.length === 0 ? (
          <div className="documents-loading">로딩 중...</div>
        ) : documents.length === 0 ? (
          <div className="documents-empty">문서가 없습니다.</div>
        ) : (
          documents.map((document) => (
            <article key={document.id} className="document-item">
              <div className="document-header">
                <div className="document-author">
                  <span
                    className="document-tag"
                    style={{
                      backgroundColor: getTagColor(document.tagColor),
                    }}
                  />
                  <span className="document-author-name">{document.authorName}</span>
                  {document.date && document.createdAt && (
                    <span className="document-date-time">
                      {formatDate(document.date)} - {formatTime(document.createdAt)}
                    </span>
                  )}
                  {!document.date && document.createdAt && (
                    <span className="document-date-time">
                      {formatTime(document.createdAt)}
                    </span>
                  )}
                  {document.readBy && document.readBy.length > 0 && (
                    <div className="document-readers">
                      {document.readBy.map((reader, index) => (
                        <span key={reader.userId || index} className="document-reader">
                          <span
                            className="document-reader-check"
                            aria-label="확인됨"
                          >
                            ✓
                          </span>
                          <span
                            className="document-reader-tag"
                            style={{
                              backgroundColor: getTagColor(reader.tagColor),
                            }}
                          />
                          <span className="document-reader-name">{reader.userName}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="document-header-right">
                  {editingId !== document.id && (
                    <button
                      type="button"
                      className="comment-button"
                      onClick={() => handleAddComment(document.id)}
                      disabled={isLoading || commentingDocumentId === document.id}
                    >
                      댓글 추가
                    </button>
                  )}
                  {!isOwner(document) && editingId !== document.id && (
                    <button
                      type="button"
                      className={`read-button ${hasRead(document) ? "read" : ""}`}
                      onClick={() => handleMarkAsRead(document)}
                      disabled={isLoading || hasRead(document)}
                    >
                      {hasRead(document) ? "확인됨" : "내용 확인"}
                    </button>
                  )}
                  {isOwner(document) && editingId !== document.id && (
                    <div className="document-actions">
                      <button
                        type="button"
                        className="edit-button"
                        onClick={() => handleEdit(document)}
                        disabled={isLoading}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => handleDelete(document.id)}
                        disabled={isLoading}
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {editingId === document.id ? (
                <div className="edit-form">
                  <textarea
                    ref={editTextareaRef}
                    className="edit-textarea"
                    value={editingContent}
                    onChange={(e) => {
                      setEditingContent(e.target.value);
                      setError(null);
                    }}
                    rows={1}
                  />
                  {error && (
                    <div className="error-message">{error}</div>
                  )}
                  <div className="edit-actions">
                    <button
                      type="button"
                      className="save-button"
                      onClick={() => handleUpdate(document.id)}
                      disabled={isLoading || !editingContent.trim()}
                    >
                      {isLoading ? "저장 중..." : "저장"}
                    </button>
                    <button
                      type="button"
                      className="cancel-edit-button"
                      onClick={handleCancelEdit}
                      disabled={isLoading}
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <div className="document-content">{document.content}</div>
              )}
              {commentingDocumentId === document.id && (
                <div className="comment-form">
                  <textarea
                    ref={commentTextareaRef}
                    className="comment-textarea"
                    placeholder="댓글을 입력하세요..."
                    value={commentContent}
                    onChange={(e) => {
                      setCommentContent(e.target.value);
                      setError(null);
                    }}
                    rows={1}
                  />
                  {error && (
                    <div className="error-message">{error}</div>
                  )}
                  <div className="comment-actions">
                    <button
                      type="button"
                      className="submit-comment-button"
                      onClick={() => handleSubmitComment(document.id)}
                      disabled={isLoading || !commentContent.trim()}
                    >
                      {isLoading ? "등록 중..." : "등록"}
                    </button>
                    <button
                      type="button"
                      className="cancel-comment-button"
                      onClick={handleCancelComment}
                      disabled={isLoading}
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
              {document.comments && document.comments.length > 0 && (
                <div className="document-comments">
                  {document.comments.map((comment, index) => {
                    const isEditing = editingComment?.documentId === document.id && editingComment?.commentIndex === index;
                    const isCommentOwner = comment.userId === user?.uid;
                    
                    return (
                      <div key={comment.createdAt?.toMillis?.() || index} className="comment-item">
                        {isEditing ? (
                          <div className="comment-edit-form">
                            <textarea
                              ref={editCommentTextareaRef}
                              className="comment-edit-textarea"
                              placeholder="댓글을 수정하세요..."
                              value={editingCommentContent}
                              onChange={(e) => {
                                setEditingCommentContent(e.target.value);
                                setError(null);
                              }}
                              rows={1}
                            />
                            {error && editingComment?.documentId === document.id && editingComment?.commentIndex === index && (
                              <div className="error-message">{error}</div>
                            )}
                            <div className="comment-edit-actions">
                              <button
                                type="button"
                                className="save-comment-button"
                                onClick={() => handleUpdateComment(document.id, index)}
                                disabled={isLoading || !editingCommentContent.trim()}
                              >
                                {isLoading ? "저장 중..." : "저장"}
                              </button>
                              <button
                                type="button"
                                className="cancel-edit-comment-button"
                                onClick={handleCancelEditComment}
                                disabled={isLoading}
                              >
                                취소
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="comment-content-wrapper">
                              <span
                                className="comment-tag"
                                style={{
                                  backgroundColor: getTagColor(comment.tagColor),
                                }}
                              />
                              <span className="comment-author">{comment.userName}:</span>
                              <span className="comment-content">{comment.content}</span>
                            </div>
                            {isCommentOwner && (
                              <div className="comment-item-actions">
                                <button
                                  type="button"
                                  className="edit-comment-button"
                                  onClick={() => handleEditComment(document.id, index)}
                                  disabled={isLoading}
                                >
                                  수정
                                </button>
                                <button
                                  type="button"
                                  className="delete-comment-button"
                                  onClick={() => handleDeleteComment(document.id, index)}
                                  disabled={isLoading}
                                >
                                  삭제
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export default SharedDocuments;
