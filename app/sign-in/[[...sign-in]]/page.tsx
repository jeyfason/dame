import { SignIn } from "@clerk/nextjs";
import { Wordmark } from "@/components/dame/Wordmark";
import { clerkAppearance } from "@/components/dame/clerkTheme";

export default function Page() {
  return (
    <div className="grid min-h-[70dvh] place-items-center justify-items-center gap-6 py-10">
      <Wordmark className="text-3xl" />
      <div className="w-full max-w-md">
        <SignIn
          routing="path"
          path="/sign-in"
          signUpUrl="/sign-up"
          fallbackRedirectUrl="/play"
          appearance={clerkAppearance}
        />
      </div>
    </div>
  );
}
