import { requirePageUser } from "@/lib/page-user";
import { StyleguideView } from "./styleguide-view";

/** Server guard: this route sits outside `(app)`, whose layout resolves the real session, and
 *  `middleware.ts` only checks the cookie is present — not that it is valid. */
export default async function StyleguidePage() {
  await requirePageUser();
  return <StyleguideView />;
}
