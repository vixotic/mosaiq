import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { CollectionsPage, CollectionDetailPage } from "./features/collections";
import { LibraryItemPage } from "./features/detail";
import { LibraryPage } from "./features/library";
import { SettingsPage } from "./features/settings";
import { SmartCategoriesPage } from "./features/smart-categories";

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate replace to="/library" />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/library/:itemId" element={<LibraryItemPage />} />
        <Route path="/smart-categories" element={<SmartCategoriesPage />} />
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/collections/:collectionId" element={<CollectionDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  );
}

function NotFound() {
  return (
    <div className="page not-found">
      <span className="eyebrow">Nothing here</span>
      <h1>This reference slipped away.</h1>
      <p>The page may have moved or the item may have been removed.</p>
      <a className="button button--primary" href="/library">
        Return to library
      </a>
    </div>
  );
}
