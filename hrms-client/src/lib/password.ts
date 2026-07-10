// Password strength helpers shared across auth screens.

export interface PasswordRule {
  key: string;
  label: string;
  test: (v: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { key: "len", label: "At least 10 characters", test: (v) => v.length >= 10 },
  { key: "upper", label: "An uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { key: "lower", label: "A lowercase letter", test: (v) => /[a-z]/.test(v) },
  { key: "num", label: "A number", test: (v) => /\d/.test(v) },
  { key: "sym", label: "A symbol", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export function passwordScore(v: string): {
  score: number;
  label: string;
  tone: "destructive" | "warning" | "info" | "success";
} {
  const passed = PASSWORD_RULES.filter((r) => r.test(v)).length;
  if (!v) return { score: 0, label: "Empty", tone: "destructive" };
  if (passed <= 2) return { score: 25, label: "Weak", tone: "destructive" };
  if (passed === 3) return { score: 55, label: "Fair", tone: "warning" };
  if (passed === 4) return { score: 80, label: "Strong", tone: "info" };
  return { score: 100, label: "Excellent", tone: "success" };
}
