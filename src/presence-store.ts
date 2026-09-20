import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, normalize, relative, resolve } from "node:path";

export type PresenceConfig = {
  name: string;
  avatarUrl: string;
  initialStatus: string;
  asideTtlSeconds: number;
  updateCooldownSeconds: number;
  idleAfterSeconds: number;
  idlePhraseCooldownSeconds: number;
  idlePhrases: string[];
};

type StoredPresenceState = {
  status: string;
  aside: string | null;
  detail: string | null;
  avatarUrl: string;
  updatedAt: string;
  asideExpiresAt: string | null;
};

export type PresenceSnapshot = StoredPresenceState & {
  name: string;
  asideSource: "live" | "fallback" | null;
};

export type PresenceUpdate = {
  status?: string;
  aside?: string | null;
  detail?: string | null;
  expiresAt?: string | null;
};

export type PresenceUpdateResult = {
  state: PresenceSnapshot;
  applied: boolean;
  throttled: boolean;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const normalizeShortText = (
  value: string,
  field: string,
  maxLength: number,
): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    throw new Error(`${field} cannot be empty.`);
  }
  if (normalized.length > maxLength) {
    throw new Error(`${field} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
};

const normalizeNullableText = (
  value: string | null | undefined,
  field: string,
  maxLength: number,
): string | null | undefined => {
  if (value === undefined || value === null) return value;
  if (!value.trim()) return null;
  return normalizeShortText(value, field, maxLength);
};

const parseIsoDate = (value: string, field: string): string => {
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) {
    throw new Error(`${field} must be a valid ISO-8601 date-time.`);
  }
  return new Date(millis).toISOString();
};

export async function loadPresenceConfig(
  projectRoot: string,
  configPath = join(projectRoot, "config", "presence.json"),
): Promise<PresenceConfig> {
  const raw = JSON.parse(await readFile(configPath, "utf8")) as Partial<PresenceConfig>;
  const numberField = (key: keyof PresenceConfig, fallback: number) => {
    const value = raw[key];
    return typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : fallback;
  };

  const idlePhrases = Array.isArray(raw.idlePhrases)
    ? raw.idlePhrases
        .filter((phrase): phrase is string => typeof phrase === "string")
        .map((phrase) => normalizeShortText(phrase, "idle phrase", 80))
    : [];

  return {
    name: normalizeShortText(raw.name ?? "J", "name", 24),
    avatarUrl: normalizeShortText(raw.avatarUrl ?? "", "avatarUrl", 4096),
    initialStatus: normalizeShortText(raw.initialStatus ?? "here", "initialStatus", 24),
    asideTtlSeconds: numberField("asideTtlSeconds", 180),
    updateCooldownSeconds: numberField("updateCooldownSeconds", 15),
    idleAfterSeconds: numberField("idleAfterSeconds", 900),
    idlePhraseCooldownSeconds: Math.max(
      60,
      numberField("idlePhraseCooldownSeconds", 1200),
    ),
    idlePhrases,
  };
}

async function resolveAvatarUrl(projectRoot: string, configuredUrl: string): Promise<string> {
  if (configuredUrl.startsWith("asset:")) {
    const assetPath = resolve(projectRoot, configuredUrl.slice("asset:".length));
    const relativePath = relative(projectRoot, assetPath);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new Error("Configured avatar asset must stay inside the J Presence project.");
    }
    const mime = MIME_BY_EXTENSION[extname(assetPath).toLowerCase()];
    if (!mime) throw new Error("Configured avatar asset uses an unsupported image type.");
    const contents = await readFile(assetPath);
    return `data:${mime};base64,${contents.toString("base64")}`;
  }

  if (configuredUrl.startsWith("data:image/")) return configuredUrl;
  const parsed = new URL(configuredUrl);
  if (parsed.protocol !== "https:") {
    throw new Error("avatarUrl must be an HTTPS URL, image data URL, or asset: path.");
  }
  return parsed.toString();
}

export class PresenceStore {
  private state: StoredPresenceState | undefined;
  private queue: Promise<void> = Promise.resolve();
  private readonly resolvedAvatarUrl: Promise<string>;

  constructor(
    private readonly config: PresenceConfig,
    private readonly statePath: string,
    private readonly projectRoot: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.resolvedAvatarUrl = resolveAvatarUrl(projectRoot, config.avatarUrl);
  }

  static async create(projectRoot: string): Promise<PresenceStore> {
    const config = await loadPresenceConfig(projectRoot);
    return new PresenceStore(
      config,
      join(projectRoot, "data", "presence-state.json"),
      projectRoot,
    );
  }

  getConfig(): Readonly<PresenceConfig> {
    return this.config;
  }

  getAvatarResourceDomains(): string[] {
    try {
      const url = new URL(this.config.avatarUrl);
      return url.protocol === "https:" ? [url.origin] : [];
    } catch {
      return [];
    }
  }

  async getSnapshot(): Promise<PresenceSnapshot> {
    return this.withLock(async () => {
      const state = await this.loadState();
      const now = this.now();
      let changed = false;

      if (state.asideExpiresAt && Date.parse(state.asideExpiresAt) <= now.getTime()) {
        state.aside = null;
        state.detail = null;
        state.asideExpiresAt = null;
        changed = true;
      }

      if (changed) await this.persist(state);
      return this.toSnapshot(state, now);
    });
  }

  async update(input: PresenceUpdate): Promise<PresenceUpdateResult> {
    return this.withLock(async () => {
      const state = await this.loadState();
      const now = this.now();
      const status =
        input.status === undefined
          ? state.status
          : normalizeShortText(input.status, "status", 24);
      const aside = normalizeNullableText(input.aside, "aside", 140);
      const detail = normalizeNullableText(input.detail, "detail", 100);
      const statusChanged = status !== state.status;
      const contentChanged =
        (aside !== undefined && aside !== state.aside) ||
        (detail !== undefined && detail !== state.detail);

      if (!statusChanged && !contentChanged && input.expiresAt === undefined) {
        return { state: this.toSnapshot(state, now), applied: false, throttled: false };
      }

      const elapsed = now.getTime() - Date.parse(state.updatedAt);
      const cooldown = this.config.updateCooldownSeconds * 1000;
      if (!statusChanged && elapsed < cooldown) {
        return { state: this.toSnapshot(state, now), applied: false, throttled: true };
      }

      state.status = status;
      if (aside !== undefined) state.aside = aside;
      if (detail !== undefined) state.detail = detail;

      if (state.aside) {
        state.asideExpiresAt = input.expiresAt
          ? parseIsoDate(input.expiresAt, "expiresAt")
          : new Date(now.getTime() + this.config.asideTtlSeconds * 1000).toISOString();
        if (Date.parse(state.asideExpiresAt) <= now.getTime()) {
          throw new Error("expiresAt must be in the future.");
        }
      } else {
        state.asideExpiresAt = null;
        if (aside === null) state.detail = null;
      }

      state.updatedAt = now.toISOString();
      await this.persist(state);
      return { state: this.toSnapshot(state, now), applied: true, throttled: false };
    });
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolveQueue) => {
      release = resolveQueue;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async loadState(): Promise<StoredPresenceState> {
    if (this.state) return this.state;
    const avatarUrl = await this.resolvedAvatarUrl;
    try {
      const parsed = JSON.parse(await readFile(this.statePath, "utf8")) as StoredPresenceState;
      this.state = {
        status: normalizeShortText(parsed.status, "status", 24),
        aside: normalizeNullableText(parsed.aside, "aside", 140) ?? null,
        detail: normalizeNullableText(parsed.detail, "detail", 100) ?? null,
        avatarUrl,
        updatedAt: parseIsoDate(parsed.updatedAt, "updatedAt"),
        asideExpiresAt: parsed.asideExpiresAt
          ? parseIsoDate(parsed.asideExpiresAt, "asideExpiresAt")
          : null,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.state = {
        status: this.config.initialStatus,
        aside: null,
        detail: null,
        avatarUrl,
        updatedAt: this.now().toISOString(),
        asideExpiresAt: null,
      };
      await this.persist(this.state);
    }
    return this.state;
  }

  private toSnapshot(state: StoredPresenceState, now: Date): PresenceSnapshot {
    if (state.aside) {
      return { ...state, name: this.config.name, asideSource: "live" };
    }

    const idleFor = now.getTime() - Date.parse(state.updatedAt);
    const idleAfter = this.config.idleAfterSeconds * 1000;
    if (idleFor < idleAfter || this.config.idlePhrases.length === 0) {
      return { ...state, name: this.config.name, asideSource: null };
    }

    const interval = this.config.idlePhraseCooldownSeconds * 1000;
    const index = Math.floor((idleFor - idleAfter) / interval) % this.config.idlePhrases.length;
    return {
      ...state,
      aside: this.config.idlePhrases[index] ?? null,
      detail: null,
      asideExpiresAt: null,
      name: this.config.name,
      asideSource: "fallback",
    };
  }

  private async persist(state: StoredPresenceState): Promise<void> {
    await mkdir(dirname(this.statePath), { recursive: true });
    const tempPath = `${this.statePath}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(tempPath, this.statePath);
  }
}
