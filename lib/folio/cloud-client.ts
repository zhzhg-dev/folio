import {
  CLOUD_LIMITS,
  type CloudBackup,
  type CloudLibrary,
  type CloudSession,
} from "./cloud-contract.ts";

export class CloudError extends Error {}
async function call(
  path: string,
  signal: AbortSignal,
  account?: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  if (account) headers.set("X-Folio-Account", account);
  const response = await fetch(`/api/cloud/${path}`, {
    ...init,
    headers,
    signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new CloudError(data?.error || "unavailable");
  }
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new CloudError("unavailable");
  return response;
}
export async function cloudSession(signal: AbortSignal): Promise<CloudSession> {
  return (await call("session", signal)).json();
}
export async function cloudLibrary(
  account: string,
  signal: AbortSignal,
): Promise<CloudLibrary> {
  return (await call("backups", signal, account)).json();
}
export async function uploadCloudBackup(
  blob: Blob,
  id: string,
  account: string,
  signal: AbortSignal,
): Promise<CloudBackup> {
  if (blob.size > CLOUD_LIMITS.backupBytes) throw new CloudError("too_large");
  const response = await call("backups", signal, account, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Folio-Upload-Id": id },
    body: blob,
  });
  return (await response.json()).backup;
}
export async function downloadCloudBackup(
  backup: CloudBackup,
  account: string,
  signal: AbortSignal,
) {
  const response = await call(`backups/${backup.id}`, signal, account);
  const blob = await response.blob();
  if (blob.size !== backup.bytes || blob.size > CLOUD_LIMITS.backupBytes)
    throw new CloudError("integrity");
  const digest = [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (digest !== backup.sha256) throw new CloudError("integrity");
  signal.throwIfAborted();
  return new File([blob], `${backup.id}.folio.json`, {
    type: "application/json",
  });
}
export async function deleteCloudBackup(
  id: string,
  account: string,
  signal: AbortSignal,
) {
  await call(`backups/${id}`, signal, account, { method: "DELETE" });
}
export function cloudErrorText(error: unknown, zh: boolean) {
  const code = error instanceof Error ? error.message : "unavailable";
  const messages: Record<string, [string, string]> = {
    sign_in: [
      "请登录后再访问云备份。",
      "Sign in to access your cloud backups.",
    ],
    account_changed: [
      "登录账号已改变。请刷新云备份列表后重试。",
      "Your account changed. Refresh the cloud library before continuing.",
    ],
    too_large: [
      "此备份超过 10 MB，请使用本机导出备份。",
      "This backup is over 10 MB. Use local backup export for this project.",
    ],
    quota_or_duplicate: [
      "云端容量或版本数已达上限，请刷新列表或删除旧备份。",
      "Your cloud limit was reached. Refresh the list or remove an older backup.",
    ],
    upload_in_progress: [
      "此版本仍在处理中，请稍后刷新列表。",
      "This version is still processing. Refresh the list shortly.",
    ],
    invalid_backup: [
      "这不是有效的 Folio 备份。",
      "This is not a valid Folio backup.",
    ],
    integrity: [
      "备份校验未通过，本机项目未改动。",
      "Backup verification failed. Your local projects are unchanged.",
    ],
    not_found: [
      "此备份已不存在，请刷新列表。",
      "This backup is no longer available. Refresh the list.",
    ],
  };
  return (
    messages[code]?.[zh ? 0 : 1] ||
    (zh
      ? "云端暂时不可用，本机项目仍然保留。若刚才正在保存，请刷新列表确认结果。"
      : "Cloud access is unavailable. Your local work is safe. If a save was interrupted, refresh the list to check its result.")
  );
}
