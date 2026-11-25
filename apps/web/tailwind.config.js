/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        orange: { DEFAULT: "#FB770B", dark: "#C45508" },
        saffron: "#E8A55C",
        beige: { DEFAULT: "#F3F1EC", dark: "#E6E2DA" },
        charcoal: { DEFAULT: "#1C1A17", soft: "#5E584F" },
        paper: "#F3F1EC",
        mist: "#E8E4DC",
      },
      fontFamily: {
        display: ["Sora", "Poppins", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["Poppins", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: [
          "ui-monospace",
          "Cascadia Code",
          "Segoe UI Mono",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      minHeight: { tap: "44px" },
      minWidth: { tap: "44px" },
      maxWidth: {
        prose: "40rem",
        shell: "72rem",
      },
      boxShadow: {
        soft: "0 1px 0 rgb(28 26 23 / 0.04), 0 12px 32px rgb(28 26 23 / 0.06)",
      },
      keyframes: {
        "rise-in": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "horizon-shift": {
          from: { backgroundPosition: "0% 50%" },
          to: { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        "rise-in": "rise-in 700ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "horizon-shift": "horizon-shift 18s ease-in-out infinite alternate",
      },
    },
  },
  plugins: [],
};
