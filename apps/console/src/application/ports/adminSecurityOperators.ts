// Security operators (S10): people and IdP groups bound to the `security_operator` role (WEB-US-20.6).

export interface SecurityOperatorRecord {
  readonly id: string;
  readonly subjectType: string;
  readonly email?: string | undefined;
  readonly groupName?: string | undefined;
  readonly identityProviderId?: string | undefined;
  readonly userId?: string | undefined;
  readonly createdAt?: string | undefined;
}

export type AddOperatorInput =
  | { readonly subjectType: "user"; readonly email: string }
  | {
      readonly subjectType: "group";
      readonly groupName: string;
      readonly identityProviderId?: string | undefined;
    };

export interface AdminSecurityOperatorsPort {
  list(signal?: AbortSignal): Promise<readonly SecurityOperatorRecord[]>;
  add(input: AddOperatorInput): Promise<SecurityOperatorRecord>;
  remove(id: string): Promise<void>;
}
