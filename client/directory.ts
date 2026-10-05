import type {
  OwnedSubscription,
  PaseoAgent,
  PaseoAgentListOptions,
  PaseoAgentListResult,
  PaseoAgentUpdate,
  PaseoApi,
} from "@getpaseo/client";

const query = {
  filter: { includeArchived: false },
  sort: [{ key: "created_at", direction: "asc" }],
  page: { limit: 200 },
} satisfies PaseoAgentListOptions;

export async function readAllAgents(
  paseo: PaseoApi,
  signal: AbortSignal,
  first?: PaseoAgentListResult,
): Promise<Map<string, PaseoAgent>> {
  let page = first ?? await paseo.agents.list({ ...query, signal, timeout: 15_000 });
  const agents = new Map<string, PaseoAgent>();
  const cursors = new Set<string>();
  while (true) {
    if (signal.aborted) throw new Error("The agent directory request was canceled.");
    for (const { agent } of page.entries) agents.set(agent.id, agent);
    if (!page.pageInfo.hasMore) return agents;
    const cursor = page.pageInfo.nextCursor;
    if (!cursor || cursors.has(cursor)) throw new Error("The agent directory could not finish paging.");
    cursors.add(cursor);
    page = await paseo.agents.list({
      ...query,
      page: { limit: 200, cursor },
      signal,
      timeout: 15_000,
    });
  }
}

function applyUpdate(agents: Map<string, PaseoAgent>, update: PaseoAgentUpdate): void {
  if (update.kind === "remove") agents.delete(update.agentId);
  else if (update.agent.archivedAt) agents.delete(update.agent.id);
  else agents.set(update.agent.id, update.agent);
}

export interface DirectoryState {
  agents: ReadonlyMap<string, PaseoAgent>;
  loading: boolean;
  error: string | null;
}

export function observeDirectory(
  paseo: PaseoApi,
  publish: (state: DirectoryState) => void,
): () => void {
  const lifetime = new AbortController();
  let state: DirectoryState = { agents: new Map(), loading: true, error: null };
  let observation: OwnedSubscription<PaseoAgentListResult> | undefined;
  let unsubscribe: (() => void) | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let hydration: AbortController | undefined;
  let buffered: Map<string, PaseoAgentUpdate> | undefined;

  function emit(patch: Partial<DirectoryState>): void {
    if (lifetime.signal.aborted) return;
    state = { ...state, ...patch };
    publish(state);
  }

  function release(): void {
    hydration?.abort();
    unsubscribe?.();
    unsubscribe = undefined;
    const old = observation;
    observation = undefined;
    void old?.release().catch(() => {});
  }

  function fail(error: unknown): void {
    if (lifetime.signal.aborted) return;
    generation++;
    buffered = undefined;
    release();
    emit({ loading: false, error: error instanceof Error ? error.message : String(error) });
    if (!lifetime.signal.aborted && !retry) {
      retry = setTimeout(() => { retry = undefined; void start(); }, 3_000);
    }
  }

  function snapshot(first: PaseoAgentListResult): void {
    const version = ++generation;
    hydration?.abort();
    const request = new AbortController();
    hydration = request;
    const updates = new Map<string, PaseoAgentUpdate>();
    buffered = updates;
    emit({ loading: true, error: null });
    void readAllAgents(paseo, request.signal, first).then((agents) => {
      if (lifetime.signal.aborted || version !== generation) return;
      // 補頁期間嘅 live 更新要最後套用，避免舊 snapshot 將已睇 chat 加返入隊。
      for (const update of updates.values()) applyUpdate(agents, update);
      buffered = undefined;
      emit({ agents, loading: false, error: null });
    }).catch((error: unknown) => {
      if (version === generation && !request.signal.aborted) fail(error);
    });
  }

  async function start(): Promise<void> {
    emit({ loading: true, error: null });
    try {
      const first = await paseo.agents.list({
        ...query, subscribe: {}, signal: lifetime.signal, timeout: 15_000,
      });
      if (lifetime.signal.aborted) { await first.subscription.release(); return; }
      observation = first.subscription;
      const remove = observation.subscribe({
        snapshot,
        update(message) {
          if (message.type !== "agent_update" || lifetime.signal.aborted) return;
          const update = message.payload;
          const id = update.kind === "remove" ? update.agentId : update.agent.id;
          if (buffered) buffered.set(id, update);
          else {
            const agents = new Map(state.agents);
            applyUpdate(agents, update);
            emit({ agents });
          }
        },
        error: fail,
      });
      if (observation === first.subscription) unsubscribe = remove;
      else remove();
    } catch (error) { fail(error); }
  }

  void start();
  return () => {
    lifetime.abort();
    generation++;
    if (retry) clearTimeout(retry);
    release();
  };
}

export function readFreshDirectory(paseo: PaseoApi, signal: AbortSignal): Promise<ReadonlyMap<string, PaseoAgent>> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error("The agent directory request was canceled.")); return; }
    let stop: (() => void) | undefined;
    const abort = () => { stop?.(); reject(new Error("The agent directory request was canceled.")); };
    signal.addEventListener("abort", abort, { once: true });
    stop = observeDirectory(paseo, (state) => {
      if (state.loading) return;
      stop?.();
      signal.removeEventListener("abort", abort);
      if (state.error) reject(new Error(state.error));
      else resolve(state.agents);
    });
  });
}
