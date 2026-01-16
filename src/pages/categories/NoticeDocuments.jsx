import { useRef, useState, useEffect } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, onSnapshot, serverTimestamp, Timestamp, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import "./SharedDocuments.css";

const CATEGORY = "전체 공지";
const COLLECTION_NAME = "notices";

const SUB_CATEGORIES = [
  "현재 공지",
  "docs~노션 공지",
];

function NoticeDocuments({ user, profile, selectedSubCategory: propSelectedSubCategory, onSubCategoryChange, globalRefreshKey, onRefresh }) {
  const textareaRef = useRef(null);
  const [isWriting, setIsWriting] = useState(false);
  const [content, setContent] = useState("");
  // prop으로 받은 값이 있으면 사용하고, 없으면 기본값 "현재 공지" 사용
  const selectedSubCategory = propSelectedSubCategory !== null && propSelectedSubCategory !== undefined 
    ? propSelectedSubCategory 
    : "현재 공지";
  const [showSubCategoryMenu, setShowSubCategoryMenu] = useState(false);
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
  const subCategoryMenuRef = useRef(null);

  // createdAt에서 날짜 추출 (YYYY-MM-DD 형식)
  const formatDateFromTimestamp = (timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}월 ${day}일`;
  };

  // createdAt에서 시간 추출
  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const hours = date.getHours();
    return `${hours}시`;
  };

  // 작성자 - 날짜 - 시간 형식
  const formatAuthorDateTime = (document) => {
    if (!document.createdAt) return document.authorName || "사용자";
    const dateStr = formatDateFromTimestamp(document.createdAt);
    const timeStr = formatTime(document.createdAt);
    return `${document.authorName || "사용자"} - ${dateStr} - ${timeStr}`;
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
    if (!user) {
      setDocuments([]);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    let unsubscribe = null;

    const setupListener = () => {
      setIsLoading(true);

      try {
        const q = query(collection(db, COLLECTION_NAME), orderBy("createdAt", "desc"));

        // 이전 리스너가 있으면 먼저 정리
        if (unsubscribe) {
          try {
            unsubscribe();
          } catch (err) {
            console.warn("Error cleaning up previous listener:", err);
          }
          unsubscribe = null;
        }

        // 새로운 리스너 설정
        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            if (!isMounted) return;

            try {
              // 스냅샷이 유효한지 확인
              if (!snapshot || !snapshot.docs) {
                console.warn("Invalid snapshot received");
                return;
              }

              console.log("onSnapshot triggered:", {
                category: CATEGORY,
                snapshotSize: snapshot.size,
                fromCache: snapshot.metadata?.fromCache,
              });
              
              let docs = snapshot.docs
                .map((doc) => {
                  try {
                    const data = doc.data();
                    return {
                      id: doc.id,
                      ...data,
                    };
                  } catch (err) {
                    console.error("Error processing document:", doc.id, err);
                    return null;
                  }
                })
                .filter((doc) => doc !== null)
                // 플래그 문서 제외 (isDateFlag가 true인 문서는 제외)
                .filter((doc) => !doc.isDateFlag);

              // 하위 카테고리별 필터링
              if (selectedSubCategory) {
                docs = docs.filter((doc) => doc.subCategory === selectedSubCategory);
              } else {
                // subCategory가 없는 문서는 "현재 공지"로 간주 (기존 문서 호환성)
                docs = docs.filter((doc) => !doc.subCategory || doc.subCategory === "현재 공지");
              }

              console.log("Documents loaded:", {
                category: CATEGORY,
                subCategory: selectedSubCategory,
                count: docs.length,
                readByCounts: docs.map((d) => d.readBy?.length || 0),
              });

              if (isMounted) {
                setDocuments(docs);
                setIsLoading(false);
                setError(null);
              }
            } catch (err) {
              console.error("Error processing snapshot:", err);
              if (isMounted) {
                setError(`문서를 처리하는 중 오류가 발생했습니다: ${err.message}`);
                setIsLoading(false);
              }
            }
          },
          (error) => {
            if (!isMounted) return;

            console.error("Error fetching documents:", error);
            console.error("Error code:", error.code);
            console.error("Error message:", error.message);
            
            // INTERNAL ASSERTION 오류는 조용히 처리 (콘솔에만 로그)
            if (error.message && error.message.includes("INTERNAL ASSERTION")) {
              console.warn("Firestore internal assertion error - this is usually non-critical and may resolve automatically.");
              // 에러를 UI에 표시하지 않고 조용히 처리
              if (isMounted) {
                setIsLoading(false);
              }
              return;
            }
            
            // 특정 에러 코드에 대한 처리
            if (error.code === "failed-precondition") {
              if (isMounted) {
                setError(`쿼리 인덱스가 필요합니다. Firebase 콘솔에서 인덱스를 생성해주세요.`);
              }
            } else if (error.code === "permission-denied") {
              if (isMounted) {
                setError(`권한이 없습니다. 다시 로그인해주세요.`);
              }
            } else {
              if (isMounted) {
                setError(`문서를 불러오는 중 오류가 발생했습니다: ${error.message || "알 수 없는 오류"}`);
              }
            }
            
            if (isMounted) {
              setIsLoading(false);
            }
          }
        );
      } catch (err) {
        console.error("Error setting up onSnapshot:", err);
        if (isMounted) {
          setError(`리스너 설정 중 오류가 발생했습니다: ${err.message}`);
          setIsLoading(false);
          setDocuments([]);
        }
      }
    };

    // 약간의 지연을 두고 리스너 설정 (이전 리스너가 완전히 cleanup되도록)
    const timeoutId = setTimeout(() => {
      setupListener();
    }, 0);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch (err) {
          console.warn("Error unsubscribing:", err);
        }
        unsubscribe = null;
      }
    };
  }, [user, globalRefreshKey, selectedSubCategory]); // selectedSubCategory 추가

  // 외부 클릭 시 서브 카테고리 메뉴 닫기
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (subCategoryMenuRef.current && !subCategoryMenuRef.current.contains(event.target)) {
        setShowSubCategoryMenu(false);
      }
    };

    if (showSubCategoryMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showSubCategoryMenu]);

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

    setIsLoading(true);
    setError(null);
    
    try {
      const docData = {
        content: content.trim(),
        authorId: user.uid,
        authorName: profile.name || user.displayName || "사용자",
        tagColor: profile.tagColor || "gray",
        subCategory: selectedSubCategory || "현재 공지", // 하위 카테고리 추가
        createdAt: serverTimestamp(),
      };

      console.log("Adding document to collection:", COLLECTION_NAME);
      console.log("Document data:", docData);

      // 낙관적 업데이트: 즉시 로컬 상태에 추가
      const tempDocId = `temp-${Date.now()}`;
      const tempDoc = {
        id: tempDocId,
        content: content.trim(),
        authorId: user.uid,
        authorName: profile.name || user.displayName || "사용자",
        tagColor: profile.tagColor || "gray",
        subCategory: selectedSubCategory || "현재 공지", // 하위 카테고리 추가
        createdAt: Timestamp.now(), // 임시로 현재 시간 사용
        readBy: [],
      };
      
      setDocuments((prevDocs) => [tempDoc, ...prevDocs]);
      
      try {
        const docRef = await addDoc(collection(db, COLLECTION_NAME), docData);
        console.log("Document added successfully:", docRef.id);
        
        // 상태 초기화
        setContent("");
        setIsWriting(false);
        setError(null);
        
        // 전역 리프레시 트리거 (카드 섹션, 사이드바도 업데이트)
        onRefresh?.();
        // onSnapshot이 나중에 서버 상태와 동기화함
      } catch (addError) {
        // 문서 생성 실패 시 낙관적 업데이트 롤백
        setDocuments((prevDocs) => {
          return prevDocs.filter((doc) => doc.id !== tempDocId);
        });
        
        throw addError; // 에러를 다시 던져서 외부 catch 블록에서 처리
      }
    } catch (error) {
      console.error("Error adding document:", error);
      console.error("Error code:", error.code);
      console.error("Error message:", error.message);
      
      let errorMessage = "문서 등록에 실패했습니다.";
      if (error.code === "permission-denied") {
        errorMessage = "권한이 없습니다. 로그인 상태를 확인해주세요.";
      } else if (error.code === "unavailable") {
        errorMessage = "네트워크 오류가 발생했습니다. 다시 시도해주세요.";
      } else if (error.message && error.message.includes("INTERNAL ASSERTION")) {
        errorMessage = "데이터베이스 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
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

    // 권한 체크
    const originalDoc = documents.find((d) => d.id === documentId);
    if (!originalDoc) {
      setError("문서를 찾을 수 없습니다.");
      return;
    }

    if (!isOwner(originalDoc) && !isAdmin()) {
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
      const docRef = doc(db, COLLECTION_NAME, documentId);
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

    // 권한 체크
    const deletedDoc = documents.find((d) => d.id === documentId);
    if (!deletedDoc) {
      setError("문서를 찾을 수 없습니다.");
      return;
    }

    if (!isOwner(deletedDoc) && !isAdmin()) {
      setError("본인이 작성한 문서만 삭제할 수 있습니다.");
      return;
    }

    setError(null);
    setIsLoading(true);
    
    // 낙관적 업데이트: 즉시 로컬 상태에서 제거 (권한 확인 후)
    setDocuments((prevDocs) => prevDocs.filter((doc) => doc.id !== documentId));

    try {
      const docRef = doc(db, COLLECTION_NAME, documentId);
      
      // deleteDoc 호출을 try-catch로 감싸서 INTERNAL ASSERTION 오류 처리
      try {
        await deleteDoc(docRef);
      } catch (deleteError) {
        // INTERNAL ASSERTION 오류는 실제로는 삭제가 성공했을 수 있음
        // onSnapshot이 나중에 동기화하므로 일단 성공으로 간주
        if (deleteError.message && deleteError.message.includes("INTERNAL ASSERTION")) {
          console.warn("Firestore internal assertion error during delete - deletion may have succeeded. onSnapshot will sync.");
          // 에러를 무시하고 계속 진행 (onSnapshot이 실제 상태를 동기화함)
        } else {
          // 다른 에러는 다시 던짐
          throw deleteError;
        }
      }
      
      setError(null);
      
      // 전역 리프레시 트리거 (카드 섹션, 사이드바도 업데이트)
      onRefresh?.();
      // onSnapshot이 나중에 서버 상태와 동기화함
    } catch (error) {
      console.error("Error deleting document:", error);
      
      // INTERNAL ASSERTION이 아닌 경우에만 롤백
      if (!error.message || !error.message.includes("INTERNAL ASSERTION")) {
        // 에러 발생 시 로컬 상태 롤백
        setDocuments((prevDocs) => {
          return [...prevDocs, deletedDoc].sort((a, b) => {
            const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return bTime - aTime;
          });
        });
        
        let errorMessage = "문서 삭제에 실패했습니다.";
        if (error.code === "permission-denied") {
          errorMessage = "권한이 없습니다. 본인이 작성한 문서인지 확인해주세요.";
        } else if (error.code === "unavailable") {
          errorMessage = "네트워크 오류가 발생했습니다. 다시 시도해주세요.";
        } else if (error.message) {
          errorMessage = `오류: ${error.message}`;
        }
        setError(errorMessage);
      } else {
        // INTERNAL ASSERTION 오류는 조용히 처리 (삭제는 성공했을 가능성이 높음)
        setError(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isOwner = (document) => {
    return user && document.authorId === user.uid;
  };

  const isAdmin = () => {
    return profile?.user_type === "admin";
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
      const docRef = doc(db, COLLECTION_NAME, documentId);
      
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
      const docRef = doc(db, COLLECTION_NAME, documentId);
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
      const docRef = doc(db, COLLECTION_NAME, documentId);
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
      const docRef = doc(db, COLLECTION_NAME, document.id);
      
      console.log("Updating readBy:", {
        collection: COLLECTION_NAME,
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
          <div className="sub-category-selector" ref={subCategoryMenuRef} style={{ position: "relative" }}>
            <button
              type="button"
              className="date-picker-button"
              onClick={() => setShowSubCategoryMenu(!showSubCategoryMenu)}
            >
              {selectedSubCategory || "카테고리 설정"}
            </button>
            {showSubCategoryMenu && (
              <div className="sub-category-menu" style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: "4px",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                zIndex: 1000,
                minWidth: "150px",
              }}>
                {SUB_CATEGORIES.map((subCat) => (
                  <button
                    key={subCat}
                    type="button"
                      onClick={() => {
                        onSubCategoryChange?.(subCat);
                        setShowSubCategoryMenu(false);
                      }}
                    style={{
                      width: "100%",
                      padding: "10px 16px",
                      textAlign: "left",
                      border: "none",
                      background: selectedSubCategory === subCat ? "rgba(0, 0, 0, 0.05)" : "transparent",
                      cursor: "pointer",
                      fontSize: "14px",
                      color: "var(--text)",
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (selectedSubCategory !== subCat) {
                        e.currentTarget.style.background = "rgba(0, 0, 0, 0.02)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedSubCategory !== subCat) {
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    {subCat}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="create-button"
            onClick={() => {
              setIsWriting(!isWriting);
              setEditingId(null); // 작성 모드 진입 시 편집 모드 해제
              setContent("");
              setError(null);
            }}
          >
            {isWriting ? "취소" : "작성하기"}
          </button>
        </div>
      </div>
      {isWriting && (
        <div className="write-form">
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
                setError(null);
              }}
            >
              취소
            </button>
          </div>
        </div>
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
                  <span className="document-author-name">
                    {formatAuthorDateTime(document)}
                  </span>
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
                  {(isOwner(document) || isAdmin()) && editingId !== document.id && (
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

export default NoticeDocuments;
