function EmployeeStatsPagination({ currentPage, totalPages, onPageChange }) {
  const safeTotalPages = Math.max(1, totalPages);

  return (
    <div className="employee-stats-pagination">
      <button
        type="button"
        className="employee-stats-page-button"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
      >
        이전
      </button>
      {Array.from({ length: safeTotalPages }).map((_, index) => {
        const page = index + 1;
        return (
          <button
            key={page}
            type="button"
            className={`employee-stats-page-button${
              page === currentPage ? " active" : ""
            }`}
            onClick={() => onPageChange(page)}
          >
            {page}
          </button>
        );
      })}
      <button
        type="button"
        className="employee-stats-page-button"
        onClick={() => onPageChange(Math.min(safeTotalPages, currentPage + 1))}
        disabled={currentPage === safeTotalPages}
      >
        다음
      </button>
    </div>
  );
}

export default EmployeeStatsPagination;
