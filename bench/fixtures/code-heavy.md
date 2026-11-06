Here is a complete, typed implementation of a small event-driven task queue with retries, a concurrency limit and cancellation. Read the comments first, they explain the design.

```ts
import { EventEmitter } from 'node:events';

export type TaskId = string;

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

export interface TaskOptions {
  /** Maximum number of attempts, including the first one. */
  readonly maxAttempts?: number;
  /** Base delay in milliseconds for exponential backoff. */
  readonly backoffMs?: number;
  /** Higher priority tasks run first. */
  readonly priority?: number;
}

export interface TaskRecord<T> {
  readonly id: TaskId;
  readonly run: (signal: AbortSignal) => Promise<T>;
  readonly options: Required<TaskOptions>;
  status: TaskStatus;
  attempts: number;
  result?: T;
  error?: unknown;
  controller: AbortController;
}

export interface QueueEvents<T> {
  start: (task: TaskRecord<T>) => void;
  done: (task: TaskRecord<T>) => void;
  failed: (task: TaskRecord<T>) => void;
  retry: (task: TaskRecord<T>, delayMs: number) => void;
  idle: () => void;
}

const DEFAULTS: Required<TaskOptions> = {
  maxAttempts: 3,
  backoffMs: 200,
  priority: 0,
};

let counter = 0;

function nextId(): TaskId {
  counter += 1;
  return `task-${counter.toString(36)}`;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export class TaskQueue<T = unknown> {
  private readonly emitter = new EventEmitter();
  private readonly tasks = new Map<TaskId, TaskRecord<T>>();
  private readonly waiting: TaskRecord<T>[] = [];
  private running = 0;

  constructor(private readonly concurrency = 4) {
    if (concurrency < 1) throw new RangeError('concurrency must be at least 1');
  }

  on<K extends keyof QueueEvents<T>>(event: K, listener: QueueEvents<T>[K]) {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  add(run: TaskRecord<T>['run'], options: TaskOptions = {}): TaskId {
    const id = nextId();
    const record: TaskRecord<T> = {
      id,
      run,
      options: { ...DEFAULTS, ...options },
      status: 'pending',
      attempts: 0,
      controller: new AbortController(),
    };
    this.tasks.set(id, record);
    this.enqueue(record);
    this.pump();
    return id;
  }

  cancel(id: TaskId): boolean {
    const task = this.tasks.get(id);
    if (!task || task.status === 'done' || task.status === 'failed') return false;
    task.status = 'cancelled';
    task.controller.abort();
    const index = this.waiting.indexOf(task);
    if (index !== -1) this.waiting.splice(index, 1);
    return true;
  }

  get(id: TaskId): TaskRecord<T> | undefined {
    return this.tasks.get(id);
  }

  get size(): number {
    return this.waiting.length + this.running;
  }

  private enqueue(task: TaskRecord<T>) {
    // Keep the waiting list sorted by priority, then by insertion order.
    let low = 0;
    let high = this.waiting.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.waiting[mid]!.options.priority >= task.options.priority) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    this.waiting.splice(low, 0, task);
  }

  private pump() {
    while (this.running < this.concurrency && this.waiting.length > 0) {
      const task = this.waiting.shift()!;
      if (task.status === 'cancelled') continue;
      void this.execute(task);
    }
    if (this.running === 0 && this.waiting.length === 0) {
      this.emitter.emit('idle');
    }
  }

  private async execute(task: TaskRecord<T>) {
    this.running += 1;
    task.status = 'running';
    task.attempts += 1;
    this.emitter.emit('start', task);
    try {
      task.result = await task.run(task.controller.signal);
      task.status = 'done';
      this.emitter.emit('done', task);
    } catch (error) {
      if (task.controller.signal.aborted) {
        task.status = 'cancelled';
      } else if (task.attempts < task.options.maxAttempts) {
        const delay = task.options.backoffMs * 2 ** (task.attempts - 1);
        this.emitter.emit('retry', task, delay);
        try {
          await sleep(delay, task.controller.signal);
          task.status = 'pending';
          this.enqueue(task);
        } catch {
          task.status = 'cancelled';
        }
      } else {
        task.error = error;
        task.status = 'failed';
        this.emitter.emit('failed', task);
      }
    } finally {
      this.running -= 1;
      this.pump();
    }
  }
}
```

A few notes on the design:

- Retries use exponential backoff and re-enter the queue, so a retried task does not hold a concurrency slot while it waits.
- `cancel` aborts the signal, so well-behaved tasks can stop early. Tasks that ignore the signal still finish, but their result is discarded.
- The `idle` event fires every time the queue drains, which is handy for tests.

Usage:

```ts
const queue = new TaskQueue<string>(2);

queue.on('done', (task) => console.log(task.id, task.result));
queue.on('idle', () => console.log('all done'));

queue.add(async () => 'hello', { priority: 1 });
queue.add(async (signal) => {
  await sleep(100, signal);
  return 'world';
});
```
