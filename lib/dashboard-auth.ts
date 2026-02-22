export const DASHBOARD_COOKIE_NAME = "dashboard_auth";
export const DASHBOARD_COOKIE_VALUE = "authenticated";

export function isDashboardAuthenticated(
  cookieValue: string | undefined
): boolean {
  return cookieValue === DASHBOARD_COOKIE_VALUE;
}
