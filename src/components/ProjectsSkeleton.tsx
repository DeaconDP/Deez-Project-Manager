export function ProjectsSkeleton() {
  return (
    <div className="projects-skeleton" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading projects…</span>

      <div className="projects-skeleton-table table-wrap" aria-hidden="true">
        <div className="projects-table">
          <div className="projects-table-head">
            <div className="projects-table-header-row">
              <div className="col-drag">Custom</div>
              <div className="col-fav">★</div>
              <div className="col-platform">Platform</div>
              <div className="col-name">Name</div>
              <div>Priority</div>
              <div>Status</div>
              <div>Category</div>
              <div>GitHub</div>
              <div>Actions</div>
            </div>
          </div>
          <div className="projects-table-body">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="project-row skeleton-row">
                <div className="col-drag">
                  <span className="skeleton-bar skeleton-bar-xs" />
                </div>
                <div className="col-fav">
                  <span className="skeleton-bar skeleton-bar-xs" />
                </div>
                <div className="col-platform">
                  <span className="skeleton-bar skeleton-bar-sm" />
                </div>
                <div className="col-name">
                  <span className="skeleton-stack">
                    <span className="skeleton-bar skeleton-bar-lg" />
                    <span className="skeleton-bar skeleton-bar-md" />
                  </span>
                </div>
                <div>
                  <span className="skeleton-bar skeleton-bar-sm" />
                </div>
                <div>
                  <span className="skeleton-bar skeleton-bar-md" />
                </div>
                <div>
                  <span className="skeleton-bar skeleton-bar-md" />
                </div>
                <div>
                  <span className="skeleton-bar skeleton-bar-sm" />
                </div>
                <div className="col-actions">
                  <span className="skeleton-bar skeleton-bar-action" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
