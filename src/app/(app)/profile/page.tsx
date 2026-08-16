import { getVerifiedUser } from "@/server/auth/guards";
import { userPreferencesService } from "@/server/services/user-preferences.service";
import { ProfileView } from "./profile-view";

/**
 * My Profile (RSC, Wave 5.4, legacy `ProfileView` `index.html:8934-9005`) — avatar/bio/phone/
 * location/signature/password, self-service. Open to any signed-in user (own record only).
 */
export default async function ProfilePage() {
  const user = await getVerifiedUser();

  const preferences = await userPreferencesService.getMine(user);

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">My Profile</h1>
        <p className="mt-1 text-sm text-gray">
          Your avatar, bio, contact info, email signature, and password.
        </p>
      </header>
      <ProfileView
        userName={user.name}
        userEmail={user.email}
        userRole={user.role}
        userImage={user.image ?? null}
        preferences={preferences}
      />
    </div>
  );
}
