import type {
  CreateAgentDraft,
  DraftErrors,
} from "../../../../application/usecases/agents-create/CreateAgentUseCases.js";

/** What every section of the create form receives: the draft, a way to change it, and the field errors. */
export interface SectionProps {
  readonly draft: CreateAgentDraft;
  readonly set: (patch: Partial<CreateAgentDraft>) => void;
  readonly errors: DraftErrors;
}

/** For the sections that add rows to the draft: why that is disabled for this caller (a viewer), if it is. */
export interface RowEditProps {
  readonly readOnlyReason?: string | undefined;
}
