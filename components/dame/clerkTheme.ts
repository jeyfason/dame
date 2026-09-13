/**
 * Clerk appearance tuned to the Dame classic-premium theme (felt, brass,
 * Fraunces/Outfit). Values mirror app/dame-tokens.css — Clerk components
 * render inside their own shadow-ish scope, so raw values are used here
 * (this file is the sanctioned exception to the no-raw-hex rule).
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: "#C9A227",
    colorBackground: "#222B20",
    colorText: "#F2EDE3",
    colorTextSecondary: "#9BA694",
    colorInputBackground: "#1A2418",
    colorInputText: "#F2EDE3",
    colorBorder: "rgba(242, 237, 227, 0.14)",
    colorDanger: "#D05B4C",
    colorSuccess: "#5FBF6F",
    colorWarning: "#C9A227",
    borderRadius: "0.875rem",
    fontFamily: "var(--font-outfit), Outfit, system-ui, sans-serif",
    fontFamilyButtons: "var(--font-outfit), Outfit, system-ui, sans-serif",
  },
  elements: {
    card: {
      border: "1px solid rgba(242, 237, 227, 0.1)",
      boxShadow: "0 24px 48px -16px rgba(0, 0, 0, 0.65)",
    },
    headerTitle: {
      color: "#F2EDE3",
      fontFamily: "var(--font-fraunces), Fraunces, serif",
      fontSize: "1.4rem",
      fontWeight: 600,
    },
    headerSubtitle: { color: "#9BA694" },
    formFieldInput: {
      background: "#1A2418",
      color: "#F2EDE3",
      border: "1px solid rgba(242, 237, 227, 0.16)",
      boxShadow: "none",
    },
    formFieldLabel: { color: "#C9B08A" },
    socialButtonsBlockButton: {
      background: "#2A3327",
      borderColor: "rgba(242, 237, 227, 0.14)",
      color: "#F2EDE3",
    },
    dividerLine: { background: "rgba(242, 237, 227, 0.12)" },
    dividerText: { color: "#9BA694" },
    formButtonPrimary: {
      background: "linear-gradient(160deg, #E2C45C, #C9A227)",
      color: "#241C05",
      fontWeight: 600,
    },
    footer: { color: "#9BA694" },
    footerActionLink: { color: "#E2C45C" },
  },
} as const;
