import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "var(--cream)",
        "cream-deep": "var(--cream-deep)",
        card: "var(--card)",
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        bronze: "var(--bronze)",
        "bronze-deep": "var(--bronze-deep)",
        ember: "var(--ember)",
        sand: "var(--sand)",
        tan: "var(--tan)",
      },
    },
  },
  plugins: [],
};
export default config;
