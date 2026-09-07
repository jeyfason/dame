import { SignUp } from "@clerk/nextjs";
export default function Page() {
  return (
    <div className="mx-auto flex max-w-md justify-center py-16">
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/play" />
    </div>
  );
}
