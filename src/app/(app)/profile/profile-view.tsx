"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { updateUser, changePassword } from "@/lib/auth-client";
import type { UserPreferencesDTO } from "@/lib/validation/user-preferences";
import { useApiForm } from "@/lib/forms/use-api-form";
import { emptyToNull } from "@/lib/forms/empty-to-null";
import { messageForFailure, patchJson, postJson } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fieldError } from "../candidates/[id]/lib/form-error";
import { SignatureEditor } from "../templates/signature-editor";

/** Square avatar, resized client-side before upload — mirrors legacy's `resizeImage` intent
 *  (small base64 payload, no server-side image processing needed). */
const AVATAR_SIZE = 160;

function resizeToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const profileFieldsSchema = z
  .object({
    bio: z.string().trim().max(1000).nullish(),
    phone: z.string().trim().max(50).nullish(),
    location: z.string().trim().max(200).nullish(),
  })
  .strict();

export function ProfileView({
  userName,
  userEmail,
  userRole,
  userImage,
  preferences,
}: {
  userName: string;
  userEmail: string;
  userRole: string;
  userImage: string | null;
  preferences: UserPreferencesDTO;
}) {
  const [signature, setSignature] = useState(preferences.emailSignature);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [image, setImage] = useState(userImage);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await resizeToDataUrl(file);
      // Wave 6 (D8): upload to object storage server-side instead of persisting the base64 data
      // URI itself — User.image ends up holding a small stable URL, not the image bytes.
      const uploadResult = await postJson<{ url: string }>("/api/me/avatar", { dataUrl });
      if (!uploadResult.ok) {
        toast.error(messageForFailure(uploadResult.failure));
        return;
      }
      const { error } = await updateUser({ image: uploadResult.data.url });
      if (error) {
        toast.error(error.message ?? "Couldn't update your avatar");
      } else {
        setImage(uploadResult.data.url);
        toast.success("Avatar updated");
      }
    } catch {
      toast.error("Couldn't process that image");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const [serverError, setServerError] = useState<string | null>(null);
  const { form, pending, onSubmit } = useApiForm(profileFieldsSchema, {
    defaultValues: {
      bio: preferences.bio,
      phone: preferences.phone,
      location: preferences.location,
    },
    submit: (values) => patchJson<UserPreferencesDTO>("/api/me/preferences", values),
    onSuccess: () => toast.success("Profile updated"),
    onFailure: setServerError,
  });

  return (
    <div className="grid w-full grid-cols-12 gap-6">
      <div className="col-span-12 flex flex-col gap-5 lg:col-span-8">
        <Card as="section" className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-5">
            <div className="relative">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element -- a user-uploaded data URI, not a static asset
                <img
                  src={image}
                  alt=""
                  className="h-20 w-20 rounded-full border-2 border-brand object-cover"
                />
              ) : (
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-navy/10 text-2xl font-bold text-navy">
                  {(userName.trim()[0] ?? "?").toUpperCase()}
                </span>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute -right-1 -bottom-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-navy text-sm font-bold text-white"
                aria-label="Change avatar"
              >
                +
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={(e) => void handleAvatarChange(e)}
                className="hidden"
              />
            </div>
            <div>
              <p className="text-xl font-bold text-charcoal">{userName}</p>
              <p className="text-sm text-gray">{userEmail}</p>
              <Badge tone="navy" size="sm">
                {userRole}
              </Badge>
            </div>
          </div>

          <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            {serverError ? <ErrorState message={serverError} /> : null}
            <Field label="Bio" htmlFor="pf-bio" error={fieldError(form, "bio")}>
              <Textarea
                id="pf-bio"
                rows={3}
                className="resize-y"
                placeholder="Tell your team about yourself…"
                {...form.register("bio", { setValueAs: emptyToNull })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" htmlFor="pf-phone" error={fieldError(form, "phone")}>
                <Input
                  id="pf-phone"
                  placeholder="+251 9XX XXX XXXX"
                  {...form.register("phone", { setValueAs: emptyToNull })}
                />
              </Field>
              <Field label="Location" htmlFor="pf-location" error={fieldError(form, "location")}>
                <Input
                  id="pf-location"
                  placeholder="Addis Ababa, Ethiopia"
                  {...form.register("location", { setValueAs: emptyToNull })}
                />
              </Field>
            </div>
            <div className="flex justify-end border-t border-black/5 pt-3">
              <Button type="submit" variant="success" loading={pending}>
                Save Profile
              </Button>
            </div>
          </form>
        </Card>

        <SignatureEditor
          recruiterName={userName}
          signature={signature}
          onSaved={(next) => setSignature(next)}
        />
      </div>

      <div className="col-span-12 lg:col-span-4">
        <ChangePasswordCard />
      </div>
    </div>
  );
}

function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!current.trim() || !next.trim()) {
      toast.error("All fields are required.");
      return;
    }
    if (next !== confirm) {
      toast.error("New passwords do not match.");
      return;
    }
    if (next.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setPending(true);
    const { error } = await changePassword({ currentPassword: current, newPassword: next });
    setPending(false);
    if (error) {
      toast.error(error.message ?? "Couldn't change your password");
    } else {
      toast.success("Password changed successfully");
      setCurrent("");
      setNext("");
      setConfirm("");
    }
  }

  return (
    <Card as="section" className="flex flex-col gap-4 p-5">
      <h2 className="text-sm font-bold text-navy">Change Password</h2>
      <div className="flex flex-col gap-4">
        <Field label="Current password" htmlFor="pw-current">
          <Input
            id="pw-current"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="New password" htmlFor="pw-new">
          <Input
            id="pw-new"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <Field label="Confirm new" htmlFor="pw-confirm">
          <Input
            id="pw-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="button" loading={pending} onClick={() => void submit()}>
          Update Password
        </Button>
      </div>
    </Card>
  );
}
