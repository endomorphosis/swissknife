import { useEffect, useMemo, useState } from 'react';
import {
  getBrowserPlatform,
  type BrowserPlatform,
  type BrowserSwissKnifeConfig,
  type BrowserTask,
} from '../../platform/browser.js';

export interface BrowserPlatformSnapshot {
  readonly runtime: BrowserPlatform['runtime'];
  readonly config: BrowserSwissKnifeConfig;
  readonly providers: readonly string[];
  readonly taskCount: number;
  readonly pendingTaskCount: number;
}

function summarizeTasks(tasks: readonly BrowserTask[]): Pick<BrowserPlatformSnapshot, 'taskCount' | 'pendingTaskCount'> {
  return {
    taskCount: tasks.length,
    pendingTaskCount: tasks.filter(task => task.status === 'pending' || task.status === 'running').length,
  };
}

export function createBrowserPlatformSnapshot(platform: BrowserPlatform = getBrowserPlatform()): BrowserPlatformSnapshot {
  return {
    runtime: platform.runtime,
    config: platform.configManager.getConfig(),
    providers: platform.aiManager.getProviders().map(provider => provider.name).sort(),
    taskCount: 0,
    pendingTaskCount: 0,
  };
}

export function useBrowserPlatformSnapshot(platform: BrowserPlatform = getBrowserPlatform()): BrowserPlatformSnapshot {
  const initialSnapshot = useMemo(() => createBrowserPlatformSnapshot(platform), [platform]);
  const [snapshot, setSnapshot] = useState<BrowserPlatformSnapshot>(initialSnapshot);

  useEffect(() => {
    let active = true;

    const refresh = async (): Promise<void> => {
      const tasks = await platform.tasks.listTasks();
      if (!active) return;

      setSnapshot({
        ...createBrowserPlatformSnapshot(platform),
        ...summarizeTasks(tasks),
      });
    };

    const unsubscribeCreated = platform.eventBus.on('task:created', refresh);
    const unsubscribeUpdated = platform.eventBus.on('task:updated', refresh);
    void refresh();

    return () => {
      active = false;
      unsubscribeCreated();
      unsubscribeUpdated();
    };
  }, [platform]);

  return snapshot;
}
