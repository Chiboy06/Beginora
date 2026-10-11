/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Beginora calm palette — mirrors lib/theme.ts
        bg: "#F7F4EF",
        surface: "#FFFFFF",
        "surface-muted": "#EFF0EB",
        accent: "#5C7A6B",
        "accent-soft": "#C8D8D0",
        "accent-muted": "#E4EDE8",
        "user-bubble": "#5C7A6B",
        "assistant-bubble": "#EFF0EB",
        "text-primary": "#2E3028",
        "text-secondary": "#6B6E62",
        "text-muted": "#9A9D90",
        "text-placeholder": "#BEC0B5",
        border: "#DFE0D8",
        success: "#6A9E7F",
        error: "#A07060",
        warning: "#B89A5A",
      },
      fontFamily: {
        sans: ["System"],
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "18px",
        xl: "22px",
      },
    },
  },
  plugins: [],
};
