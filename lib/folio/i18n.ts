import type { Language } from "./model";

export function errorMessage(error: unknown, language: Language): string {
  const message = error instanceof Error ? error.message : String(error);
  const split = message.indexOf(" / ");
  if (split >= 0 && /[\u4e00-\u9fff]/.test(message.slice(0, split))) {
    return language === "en"
      ? message.slice(split + 3)
      : message.slice(0, split);
  }
  return message;
}
