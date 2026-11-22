import { Link } from "react-router";
import { Banner, Breadcrumbs, PageHeader } from "../../components/index.js";
import { ExportsCard } from "./ExportsCard.js";
import { ImportCard } from "./ImportCard.js";

/** S11 (WEB-US-21): export teams to a bundle and import one, with a dry run first. */
export function ExportImportPage() {
  return (
    <>
      <Breadcrumbs
        crumbs={[{ label: "Agent Factory", to: "/" }, { label: "Export and import" }]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader title="Export and import" infoHref="/docs/export-import" />
      <Banner>
        Bundles hold names, settings and references only; secret values are never exported or
        imported.
      </Banner>
      <ExportsCard />
      <ImportCard />
    </>
  );
}
