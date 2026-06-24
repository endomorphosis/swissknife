import { describe, expect, it } from '@jest/globals';

type HardwareType = 'cpu' | 'cuda' | 'rocm' | 'webgpu';

interface WorkerCapabilities {
  type: HardwareType;
  hardwareTypes: HardwareType[];
  memoryGb: number;
  browsers?: string[];
  cudaCompute?: number;
}

interface BenchmarkWorker {
  workerId: string;
  hostname: string;
  capabilities: WorkerCapabilities;
}

interface TaskRequirements {
  hardware: HardwareType[];
  browser?: string;
  minMemoryGb?: number;
}

interface BenchmarkTask {
  taskId: string;
  type: 'benchmark' | 'test' | 'command';
  priority: number;
  requirements: TaskRequirements;
}

class BenchmarkTimer {
  private startedAt = 0;
  durationMs = 0;

  start(now: number = performance.now()): void {
    this.startedAt = now;
    this.durationMs = 0;
  }

  stop(now: number = performance.now()): number {
    this.durationMs = now - this.startedAt;
    return this.durationMs;
  }
}

const workerTypes: WorkerCapabilities[] = [
  { type: 'cpu', hardwareTypes: ['cpu'], memoryGb: 8 },
  { type: 'cuda', hardwareTypes: ['cpu', 'cuda'], memoryGb: 16, cudaCompute: 7.5 },
  { type: 'rocm', hardwareTypes: ['cpu', 'rocm'], memoryGb: 16 },
  { type: 'webgpu', hardwareTypes: ['cpu', 'webgpu'], browsers: ['chrome', 'firefox'], memoryGb: 8 },
];

const taskRequirements: TaskRequirements[] = [
  { hardware: ['cpu'] },
  { hardware: ['cuda'] },
  { hardware: ['rocm'] },
  { hardware: ['webgpu'], browser: 'chrome' },
  { hardware: ['webgpu'], browser: 'firefox' },
  { hardware: ['cpu'], minMemoryGb: 12 },
];

function generateWorkers(count: number): BenchmarkWorker[] {
  return Array.from({ length: count }, (_, index) => {
    const workerType = workerTypes[index % workerTypes.length];

    return {
      workerId: `bench_worker_${index}`,
      hostname: `bench_host_${index}`,
      capabilities: {
        ...workerType,
        hardwareTypes: [...workerType.hardwareTypes],
        browsers: workerType.browsers ? [...workerType.browsers] : undefined,
        memoryGb: workerType.memoryGb + (index % 5) - 2,
      },
    };
  });
}

function generateTasks(count: number): BenchmarkTask[] {
  const taskTypes: BenchmarkTask['type'][] = ['benchmark', 'test', 'command'];

  return Array.from({ length: count }, (_, index) => ({
    taskId: `bench_task_${index}`,
    type: taskTypes[index % taskTypes.length],
    priority: (index % 10) + 1,
    requirements: taskRequirements[index % taskRequirements.length],
  }));
}

function workerMatchesTask(worker: BenchmarkWorker, task: BenchmarkTask): boolean {
  const { capabilities } = worker;
  const { requirements } = task;

  const hasHardware = requirements.hardware.every((hardware) =>
    capabilities.hardwareTypes.includes(hardware),
  );

  if (!hasHardware) {
    return false;
  }

  if (
    requirements.minMemoryGb !== undefined &&
    capabilities.memoryGb < requirements.minMemoryGb
  ) {
    return false;
  }

  if (
    requirements.browser &&
    !capabilities.browsers?.includes(requirements.browser)
  ) {
    return false;
  }

  return true;
}

function findEligibleWorkers(
  workers: BenchmarkWorker[],
  tasks: BenchmarkTask[],
): Record<string, string[]> {
  return Object.fromEntries(
    tasks.map((task) => [
      task.taskId,
      workers
        .filter((worker) => workerMatchesTask(worker, task))
        .map((worker) => worker.workerId),
    ]),
  );
}

describe('distributed framework benchmark helpers', () => {
  it('measures elapsed benchmark time', () => {
    const timer = new BenchmarkTimer();

    timer.start(10);
    const duration = timer.stop(25.5);

    expect(duration).toBe(15.5);
    expect(timer.durationMs).toBe(15.5);
  });

  it('generates benchmark workers with stable ids and capability coverage', () => {
    const workers = generateWorkers(8);

    expect(workers).toHaveLength(8);
    expect(workers.map((worker) => worker.workerId)).toEqual([
      'bench_worker_0',
      'bench_worker_1',
      'bench_worker_2',
      'bench_worker_3',
      'bench_worker_4',
      'bench_worker_5',
      'bench_worker_6',
      'bench_worker_7',
    ]);
    expect(new Set(workers.map((worker) => worker.capabilities.type))).toEqual(
      new Set(['cpu', 'cuda', 'rocm', 'webgpu']),
    );
  });

  it('generates benchmark tasks with deterministic priorities and requirements', () => {
    const tasks = generateTasks(6);

    expect(tasks).toEqual([
      {
        taskId: 'bench_task_0',
        type: 'benchmark',
        priority: 1,
        requirements: { hardware: ['cpu'] },
      },
      {
        taskId: 'bench_task_1',
        type: 'test',
        priority: 2,
        requirements: { hardware: ['cuda'] },
      },
      {
        taskId: 'bench_task_2',
        type: 'command',
        priority: 3,
        requirements: { hardware: ['rocm'] },
      },
      {
        taskId: 'bench_task_3',
        type: 'benchmark',
        priority: 4,
        requirements: { hardware: ['webgpu'], browser: 'chrome' },
      },
      {
        taskId: 'bench_task_4',
        type: 'test',
        priority: 5,
        requirements: { hardware: ['webgpu'], browser: 'firefox' },
      },
      {
        taskId: 'bench_task_5',
        type: 'command',
        priority: 6,
        requirements: { hardware: ['cpu'], minMemoryGb: 12 },
      },
    ]);
  });

  it('filters eligible workers by hardware, memory, and browser requirements', () => {
    const workers = generateWorkers(8);
    const tasks = generateTasks(6);
    const eligibleWorkers = findEligibleWorkers(workers, tasks);

    expect(eligibleWorkers.bench_task_0).toEqual([
      'bench_worker_0',
      'bench_worker_1',
      'bench_worker_2',
      'bench_worker_3',
      'bench_worker_4',
      'bench_worker_5',
      'bench_worker_6',
      'bench_worker_7',
    ]);
    expect(eligibleWorkers.bench_task_1).toEqual([
      'bench_worker_1',
      'bench_worker_5',
    ]);
    expect(eligibleWorkers.bench_task_2).toEqual([
      'bench_worker_2',
      'bench_worker_6',
    ]);
    expect(eligibleWorkers.bench_task_3).toEqual([
      'bench_worker_3',
      'bench_worker_7',
    ]);
    expect(eligibleWorkers.bench_task_4).toEqual([
      'bench_worker_3',
      'bench_worker_7',
    ]);
    expect(eligibleWorkers.bench_task_5).toEqual([
      'bench_worker_1',
      'bench_worker_2',
      'bench_worker_5',
      'bench_worker_6',
    ]);
  });
});
