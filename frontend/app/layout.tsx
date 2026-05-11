import type { Metadata } from "next";
import { Noto_Sans, Noto_Sans_Thai } from "next/font/google";
import { Providers } from "./providers";
import { cookies } from "next/headers";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai"],
  weight: ["400", "500", "700"],
  variable: "--font-thai",
  display: "swap",
});

const notoSans = Noto_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-latin",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HouseMind — Visual Building Decisions",
  description: "The shared workspace for building decisions",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let resolvedLocale = "th";
  try {
    const cookieStore = await cookies();
    const locale = cookieStore.get("hm_locale")?.value ?? "th";
    const supported = ["th", "en"];
    resolvedLocale = supported.includes(locale) ? locale : "th";
  } catch {
    // cookies() unavailable during static rendering — default to "th"
  }

  return (
    <html lang={resolvedLocale} className={`${notoSansThai.variable} ${notoSans.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}