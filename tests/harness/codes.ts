export const VERIFY = {
  NODE: "DEEZ-VERIFY-001",
  CHROME: "DEEZ-VERIFY-002",
  PORT: "DEEZ-VERIFY-003",
  VITE: "DEEZ-VERIFY-004",
  BROWSER: "DEEZ-VERIFY-005",
} as const;

export class DoctorError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "DoctorError";
    this.code = code;
  }
}
