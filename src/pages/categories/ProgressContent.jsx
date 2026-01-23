import SharedCategoryContent from "./SharedCategoryContent";

function ProgressContent({
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
  return (
    <SharedCategoryContent
      category={category}
      selectedDate={selectedDate}
      onNavigateToCategory={onNavigateToCategory}
      onDateSelect={onDateSelect}
      user={user}
      profile={profile}
      globalRefreshKey={globalRefreshKey}
      onRefresh={onRefresh}
      scrollTarget={scrollTarget}
      onConsumeScrollTarget={onConsumeScrollTarget}
    />
  );
}

export default ProgressContent;
