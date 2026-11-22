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
