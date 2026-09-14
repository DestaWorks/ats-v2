import { AuthChrome } from "../(auth)/auth-shell";

/**
 * Shell for the screens between sign-in and the app: a session exists, a workspace does not.
 * It shares `(auth)`'s brand surface — landing on a differently-styled page mid-flow reads as
 * "wrong site" — but deliberately not `AuthShell`, whose tab row offers "Sign In" and "Request
 * Access" to someone who is already signed in.
 */
export function GateShell({
  title,
  description,
  children,
}: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <AuthChrome>
      <header>
        <h1 className="font-serif text-xl text-ivory">{title}</h1>
        <p className="mt-1 text-[13px] text-ivory/50">{description}</p>
      </header>
      {children}
    </AuthChrome>
  );
}
