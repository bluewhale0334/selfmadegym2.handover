import DashboardInContent from "./DashboardInContent";

function DashboardContent({
  user,
  onNavigateToCategory,
  onDateSelect,
  onSubCategorySelect,
  onSelectDocument,
}) {
  return (
    <DashboardInContent
      user={user}
      onNavigateToCategory={onNavigateToCategory}
      onDateSelect={onDateSelect}
      onSubCategorySelect={onSubCategorySelect}
      onSelectDocument={onSelectDocument}
    />
  );
}

export default DashboardContent;
