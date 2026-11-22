import type { RedirectPort } from "../../ports/auth.js";
import type { Session } from "./Session.js";

/** Signs out here and in other tabs, ends the provider session and lands on `/signed-out`. */
export class SignOut {
  constructor(
    private readonly session: Session,
    private readonly redirect: RedirectPort,
    private readonly origin: string,
  ) {}

  async execute(): Promise<void> {
    const url = await this.session.signOut(`${this.origin}/signed-out`);
    this.redirect.navigate(url ?? "/signed-out");
  }
}
