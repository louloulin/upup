import { describe, expect, test } from 'bun:test';
import { fauxAssistantMessage, fauxProvider, fauxText } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { getPiBackgroundService } from './background-service.js';

describe('Pi background service contract', () => {
  test('executes a daemon-style task through an injected Pi session', async () => {
    const faux = fauxProvider({ provider: 'upup-background-fixture', models: [{ id: 'background-fixture-model', reasoning: false }] });
    faux.setResponses([fauxAssistantMessage([fauxText('后台 Pi 任务已完成。')])]);
    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    modelRuntime.registerNativeProvider(faux.provider);
    const service = getPiBackgroundService();
    const id = await service.start('执行后台 fixture', {
      model: 'background-fixture-model',
      modelProvider: 'upup-background-fixture',
      modelInstance: faux.getModel(),
      modelRuntime,
    });
    let task = service.get(id);
    for (let attempt = 0; attempt < 100 && (task?.status === 'pending' || task?.status === 'running'); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      task = service.get(id);
    }
    expect(task).toMatchObject({ status: 'completed', result: '后台 Pi 任务已完成。' });
  });
});
