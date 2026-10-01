import { redirect } from "next/navigation";

// Onboarding moved to /welcome (instant inbnd.dev inbox, agent setup, subscribe).
export default function OnboardingPage() {
	redirect("/welcome");
}
