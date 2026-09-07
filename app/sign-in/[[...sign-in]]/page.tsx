import { SignIn } from "@clerk/nextjs";
export default function Page() {
  return (
    <div className="mx-auto flex max-w-md justify-center py-16">
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/play" />
    </div>
  );
}
