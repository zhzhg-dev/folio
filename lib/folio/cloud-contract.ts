// Shared limits apply to the complete backup, including original files.
export const CLOUD_LIMITS = {
  backupBytes: 10 * 1024 * 1024,
  accountBytes: 100 * 1024 * 1024,
  count: 20,
} as const;
export type CloudAccount = { key: string; name: string; email: string };
export type CloudBackup = {
  id: string;
  name: string;
  bytes: number;
  sha256: string;
  createdAt: number;
};
export type CloudSession = {
  account: CloudAccount | null;
  available: boolean;
  signIn: string;
  signOut: string;
  limits: typeof CLOUD_LIMITS;
};
export type CloudLibrary = {
  backups: CloudBackup[];
  usedBytes: number;
  usedCount: number;
};
