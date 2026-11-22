import { Link } from "react-router";
import { Breadcrumbs, PageHeader } from "../../components/index.js";
import { ActivationBanner } from "./ActivationBanner.js";
import { sections } from "./sections.js";

/** S9 (WEB-US-19): system and service tags, spend by tag, and the one-time AWS Billing activation notice. */
export function CostTagsPage() {
  return (
    <div>
      <Breadcrumbs
        crumbs={[{ label: "Agent Factory", to: "/" }, { label: "Cost allocation tags" }]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader title="Cost allocation tags" infoHref="/docs/cost-tags" />
      <ActivationBanner />
      {sections.map((s) => (
        <s.Component key={s.id} />
      ))}
    </div>
  );
}
