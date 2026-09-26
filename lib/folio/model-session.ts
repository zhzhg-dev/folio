export type ReleaseReason =
  "user" | "hidden" | "navigation" | "idle" | "timeout" | "error";
export type ModelState = {
  phase: "off" | "loading" | "ready" | "running";
  reason?: ReleaseReason;
};
type Lease = { controller: AbortController; cleanup: Set<() => void> };
export type ModelContext = {
  signal: AbortSignal;
  dispose: (cleanup: () => void) => void;
};

function interrupted(reason?: ReleaseReason) {
  return new Error(
    reason === "timeout"
      ? "本地 AI 用时过长，已停止并释放资源。可重试或查找原文。 / Local AI timed out and was released. Retry or find passages."
      : "本地 AI 已停止，问题仍然保留。 / Local AI stopped. Your question is retained.",
  );
}

function untilAborted<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || interrupted());
    if (signal.aborted) {
      abort();
      task.catch(() => {});
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    task
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

// Worker ownership and async results share one lease. A canceled load can never
// overwrite a replacement session, even if its promise resolves much later.
export class ModelSession<T> {
  private lease?: Lease;
  private resource?: T;
  private loading?: Promise<T>;
  private timer?: ReturnType<typeof setTimeout>;
  private listeners = new Set<(state: ModelState) => void>();
  private state: ModelState = { phase: "off" };
  private limits: { loadMs: number; runMs: number; idleMs: number };
  constructor(limits = { loadMs: 300_000, runMs: 120_000, idleMs: 120_000 }) {
    this.limits = limits;
  }
  snapshot() {
    return this.state;
  }
  subscribe(listener: (state: ModelState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private emit(state: ModelState) {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }
  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
  private deadline(ms: number, reason: ReleaseReason) {
    this.clearTimer();
    this.timer = setTimeout(() => this.release(reason), ms);
  }
  load(factory: (context: ModelContext) => Promise<T>): Promise<T> {
    if (this.resource !== undefined) return Promise.resolve(this.resource);
    if (this.loading) return this.loading;
    const lease: Lease = {
      controller: new AbortController(),
      cleanup: new Set(),
    };
    this.lease = lease;
    this.emit({ phase: "loading" });
    this.deadline(this.limits.loadMs, "timeout");
    const context: ModelContext = {
      signal: lease.controller.signal,
      dispose: (cleanup) => {
        if (lease.controller.signal.aborted) cleanup();
        else lease.cleanup.add(cleanup);
      },
    };
    const task = untilAborted(
      Promise.resolve().then(() => {
        context.signal.throwIfAborted();
        return factory(context);
      }),
      context.signal,
    )
      .then((resource) => {
        context.signal.throwIfAborted();
        if (this.lease !== lease) throw interrupted();
        this.resource = resource;
        this.emit({ phase: "ready" });
        this.deadline(this.limits.idleMs, "idle");
        return resource;
      })
      .catch((error) => {
        if (this.lease === lease) this.release("error");
        throw error;
      })
      .finally(() => {
        if (this.lease === lease) this.loading = undefined;
      });
    this.loading = task;
    return task;
  }
  async run<R>(operation: (resource: T) => Promise<R>): Promise<R> {
    const lease = this.lease;
    const resource = this.resource;
    if (!lease || resource === undefined)
      throw new Error("请先启用本地 AI / Enable local AI first");
    if (this.state.phase === "running")
      throw new Error("上一条回答仍在生成 / Another answer is still running");
    this.emit({ phase: "running" });
    this.deadline(this.limits.runMs, "timeout");
    try {
      return await untilAborted(
        Promise.resolve().then(() => {
          lease.controller.signal.throwIfAborted();
          return operation(resource);
        }),
        lease.controller.signal,
      );
    } catch (error) {
      if (this.lease === lease) this.release("error");
      throw error;
    } finally {
      if (this.lease === lease) {
        this.emit({ phase: "ready" });
        this.deadline(this.limits.idleMs, "idle");
      }
    }
  }
  release(reason: ReleaseReason = "user") {
    this.clearTimer();
    const lease = this.lease;
    this.lease = undefined;
    this.resource = undefined;
    this.loading = undefined;
    lease?.controller.abort(interrupted(reason));
    lease?.cleanup.forEach((cleanup) => {
      try {
        cleanup();
      } catch {
        /* Continue all cleanup. */
      }
    });
    lease?.cleanup.clear();
    this.emit({ phase: "off", reason });
  }
}
