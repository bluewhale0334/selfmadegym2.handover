import { useEffect, useMemo, useState } from "react";
import { algoliasearch } from "algoliasearch";
import "./SearchPage.css";

const SEARCH_INDEXES = [
  { name: "notices", label: "전체 공지" },
  { name: "instructions", label: "업무 지시" },
  { name: "handovers", label: "일일 인수인계" },
  { name: "progresses", label: "업무 완료사항" },
];

const extractHighlight = (highlight, fallback = "") => {
  if (!highlight) return fallback;
  if (typeof highlight.value === "string") return highlight.value;
  return fallback;
};

const hasMatch = (highlight) => {
  if (!highlight) return false;
  return highlight.matchLevel && highlight.matchLevel !== "none";
};

const getCommentMatchPreview = (hit) => {
  const commentHighlights = hit?._highlightResult?.comments;
  if (!Array.isArray(commentHighlights)) return "";
  const match = commentHighlights.find((item) => hasMatch(item?.content));
  if (!match) return "";
  return extractHighlight(match.content, "");
};

function SearchPage({ query, onClose }) {
  const normalized = (query || "").trim();
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const searchClient = useMemo(() => {
    const appId = import.meta.env.VITE_ALGOLIA_APP_ID;
    const searchKey = import.meta.env.VITE_ALGOLIA_SEARCH_KEY;
    if (!appId || !searchKey) {
      return null;
    }
    return algoliasearch(appId, searchKey);
  }, []);

  useEffect(() => {
    let isActive = true;
    const runSearch = async () => {
      if (!normalized) {
        setResults([]);
        setStatus("검색어를 입력해 주세요.");
        return;
      }
      if (!searchClient) {
        setResults([]);
        setStatus("Algolia 키가 설정되지 않았습니다.");
        return;
      }
      setIsLoading(true);
      setStatus("");
      try {
        const response = await searchClient.search(
          SEARCH_INDEXES.map((index) => ({
            indexName: index.name,
            query: normalized,
            params: {
              hitsPerPage: 20,
            },
          }))
        );
        if (!isActive) return;
        const merged = response.results.flatMap((group) => {
          const indexMeta = SEARCH_INDEXES.find((item) => item.name === group.index);
          return group.hits.map((hit) => {
            const contentHighlight = hit?._highlightResult?.content;
            const contentPreview = extractHighlight(contentHighlight, hit.content || "");
            const commentPreview = getCommentMatchPreview(hit);
            const labels = [];
            if (hasMatch(contentHighlight)) labels.push("본문");
            if (commentPreview) labels.push("댓글");
            if (labels.length === 0) labels.push("본문");
            return {
              key: `${group.index}:${hit.objectID}`,
              category: indexMeta?.label || group.index,
              authorName: hit.authorName || hit.author || "알 수 없음",
              contentPreview,
              commentPreview,
              labels,
            };
          });
        });
        setResults(merged);
        if (merged.length === 0) {
          setStatus("검색 결과가 없습니다.");
        }
      } catch (error) {
        console.error("Algolia search error:", error);
        if (!isActive) return;
        setResults([]);
        setStatus("검색 중 오류가 발생했습니다.");
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };
    runSearch();
    return () => {
      isActive = false;
    };
  }, [normalized, searchClient]);

  return (
    <div className="search-page">
      <div className="search-card">
        <div className="search-header">
          <h2>검색</h2>
          <button type="button" className="search-close" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="search-body">
          <div className="search-summary">
            <span className="search-label">검색어</span>
            <span className="search-value">
              {normalized ? `"${normalized}"` : "입력된 검색어가 없습니다."}
            </span>
          </div>
          {isLoading ? (
            <div className="search-placeholder">검색 중...</div>
          ) : status ? (
            <div className="search-placeholder">{status}</div>
          ) : (
            <div className="search-results">
              {results.map((item) => (
                <div key={item.key} className="search-result-card">
                  <div className="search-result-meta">
                    <span className="search-result-category">{item.category}</span>
                    <span className="search-result-author">{item.authorName}</span>
                    <div className="search-result-labels">
                      {item.labels.map((label) => (
                        <span key={label} className="search-result-label">
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                  {item.contentPreview && (
                    <div
                      className="search-result-content"
                      dangerouslySetInnerHTML={{ __html: item.contentPreview }}
                    />
                  )}
                  {item.commentPreview && (
                    <div
                      className="search-result-comment"
                      dangerouslySetInnerHTML={{ __html: item.commentPreview }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SearchPage;
