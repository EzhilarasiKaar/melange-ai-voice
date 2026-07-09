export function generateInterviewToken(): string {
  // 20 hex chars — enough entropy, short enough for a shareable link
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
