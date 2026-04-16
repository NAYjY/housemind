import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export default getRequestConfig(async () => {
  // Locale from cookie (set on magic-link redemption from user.preferred_language)
  // Fallback: Thai (primary audience)
  const cookieStore = cookies();
  const locale = cookieStore.get("hm_locale")?.value ?? "th";
  const supported = ["th", "en"];
  const resolved = supported.includes(locale) ? locale : "th";

  return {
    locale: resolved,
    messages: (await import(`../messages/${resolved}.json`)).default,
  };
});
