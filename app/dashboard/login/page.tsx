import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  DASHBOARD_COOKIE_NAME,
  getDashboardDevPassword,
  isDashboardAuthenticated,
  sanitizeDashboardReturnTo,
} from "@/lib/dashboard-auth";

const ERROR_MESSAGES: Record<string, string> = {
  account_not_allowed: "That Google account is not allowed to access the Peak admin dashboard.",
  callback_failed: "Sign-in failed before the dashboard session could be created.",
  config_missing: "Dashboard Google sign-in is not configured yet.",
  dev_login_disabled: "Local password sign-in is not enabled in this environment.",
  domain_not_allowed: "That Google Workspace domain is not allowed for dashboard access.",
  email_unverified: "Your Google account must have a verified email address.",
  invalid_password: "That local development password was incorrect.",
  state_mismatch: "The sign-in session expired or was interrupted. Try again.",
  token_failed: "Google sign-in could not be completed.",
  userinfo_failed: "Could not confirm your Google account details.",
};

export default async function DashboardLoginPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const returnTo = sanitizeDashboardReturnTo(
    typeof searchParams?.returnTo === "string" ? searchParams.returnTo : undefined
  );
  const errorCode =
    typeof searchParams?.error === "string" ? searchParams.error : undefined;
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : null;
  const cookieStore = cookies();

  if (
    await isDashboardAuthenticated(
      cookieStore.get(DASHBOARD_COOKIE_NAME)?.value
    )
  ) {
    redirect(returnTo);
  }

  const loginHref = `/api/dashboard/login?returnTo=${encodeURIComponent(returnTo)}`;
  const devPasswordEnabled = Boolean(getDashboardDevPassword());

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Peak Admin</h1>
        <p className="mt-2 text-sm text-gray-600">
          Sign in with an approved Peak Google account to access the dashboard.
        </p>
        {errorMessage && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}
        <Link
          href={loginHref}
          className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
        >
          Continue With Google
        </Link>
        {devPasswordEnabled && (
          <form
            action="/api/dashboard/dev-login"
            method="post"
            className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4"
          >
            <input type="hidden" name="returnTo" value={returnTo} />
            <label
              htmlFor="local-dev-password"
              className="block text-sm font-medium text-gray-700"
            >
              Local development password
            </label>
            <input
              id="local-dev-password"
              name="password"
              type="password"
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
            <button
              type="submit"
              className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Continue Locally
            </button>
          </form>
        )}
        <p className="mt-4 text-xs text-gray-500">
          Client portal links stay public. Only `/dashboard` and protected admin APIs
          require sign-in.
        </p>
      </div>
    </div>
  );
}
