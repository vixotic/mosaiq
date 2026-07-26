import type { SmartCategory } from "@mosaiq/shared";
import { useQuery } from "@tanstack/react-query";
import { BrainCircuit, Layers3, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState } from "../components/ui";
import { api, mediaUrl, queryKeys } from "../lib/api";

const KIND_LABELS: Record<SmartCategory["kind"], string> = {
  domain: "Subject",
  style: "Style",
  mood: "Mood",
  useCase: "Use case",
};

export function SmartCategoriesPage() {
  const query = useQuery({
    queryKey: queryKeys.smartCategories,
    queryFn: api.listSmartCategories,
  });

  return (
    <div className="page smart-categories-page">
      <header className="page-heading page-heading--row">
        <div>
          <span className="eyebrow">Organized by visual AI</span>
          <h1>Smart categories</h1>
          <p>
            Mosaiq reads each analyzed image and gathers related references automatically—without
            moving files or changing your own tags.
          </p>
        </div>
        <div className="smart-heading__mark" aria-hidden>
          <BrainCircuit size={28} />
        </div>
      </header>

      {query.isLoading && <LoadingState label="Finding visual connections…" />}
      {query.isError && <ErrorState error={query.error} retry={() => query.refetch()} />}
      {query.data?.analyzedItemCount === 0 && (
        <EmptyState
          title="Categories will appear here"
          description="Import images and let analysis finish. Mosaiq will group them by subject, style, mood, and use case."
        />
      )}
      {query.data && query.data.analyzedItemCount > 0 && (
        <>
          <div className="smart-summary">
            <span>
              <Sparkles size={15} /> {query.data.analyzedItemCount} analyzed{" "}
              {query.data.analyzedItemCount === 1 ? "image" : "images"}
            </span>
            <span>
              <Layers3 size={15} /> {query.data.categories.length} living categories
            </span>
          </div>
          <div className="smart-category-grid">
            {query.data.categories.map((category) => (
              <CategoryCard key={`${category.kind}:${category.label}`} category={category} />
            ))}
          </div>
          {query.data.uncategorizedItemCount > 0 && (
            <p className="smart-categories__note">
              {query.data.uncategorizedItemCount} analyzed{" "}
              {query.data.uncategorizedItemCount === 1 ? "image has" : "images have"} no category
              facets yet. Reanalysis may add them.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function CategoryCard({ category }: { category: SmartCategory }) {
  return (
    <Link
      className={`smart-category-card smart-category-card--${category.kind}`}
      to={`/library?q=${encodeURIComponent(category.label)}`}
      aria-label={`Browse ${category.label}, ${category.imageCount} images`}
    >
      <div className="smart-category-card__mosaic">
        {category.coverThumbnailUrls.map((url, index) => (
          <img key={url} src={mediaUrl(url)} alt="" className={`mosaic-image-${index + 1}`} />
        ))}
        {category.coverThumbnailUrls.length === 0 && <Sparkles size={28} />}
      </div>
      <div className="smart-category-card__body">
        <span>{KIND_LABELS[category.kind]}</span>
        <h2>{category.label}</h2>
        <p>
          {category.imageCount} {category.imageCount === 1 ? "reference" : "references"}
        </p>
      </div>
    </Link>
  );
}
