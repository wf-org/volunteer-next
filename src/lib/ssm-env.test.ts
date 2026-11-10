import { GetParametersCommand } from '@aws-sdk/client-ssm';
import { resolveSsmEnv } from './ssm-env';

// The SDK doesn't load under jsdom; the tests only need the command's input
jest.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: jest.fn(),
  GetParametersCommand: jest.fn().mockImplementation(function (this: object, input: object) {
    Object.assign(this, { input });
  })
}));

function fakeClient(parameters: Record<string, string>) {
  const send = jest.fn(async (command: GetParametersCommand) => {
    const names = command.input.Names ?? [];
    return {
      Parameters: names
        .filter((name) => name in parameters)
        .map((name) => ({ Name: name, Value: parameters[name] })),
      InvalidParameters: names.filter((name) => !(name in parameters))
    };
  });
  return { send } as unknown as Parameters<typeof resolveSsmEnv>[1] & { send: typeof send };
}

describe('resolveSsmEnv', () => {
  it('replaces ssm: references and leaves other values alone', async () => {
    const env: Record<string, string | undefined> = { A: 'ssm:/app/a', B: 'plain', C: 'ssm:/app/a' };
    const client = fakeClient({ '/app/a': 'secret' });

    await resolveSsmEnv(env, client);

    expect(env).toEqual({ A: 'secret', B: 'plain', C: 'secret' });
    expect(client.send).toHaveBeenCalledTimes(1);
    expect(client.send.mock.calls[0][0].input).toEqual({ Names: ['/app/a'], WithDecryption: true });
  });

  it('makes no call when nothing uses the prefix', async () => {
    const client = fakeClient({});
    await resolveSsmEnv({ A: 'plain' }, client);
    expect(client.send).not.toHaveBeenCalled();
  });

  it('requests at most 10 names per call', async () => {
    const parameters = Object.fromEntries(
      Array.from({ length: 23 }, (_, i) => [`/app/p${i}`, `v${i}`])
    );
    const env = Object.fromEntries(Object.keys(parameters).map((name, i) => [`K${i}`, `ssm:${name}`]));
    const client = fakeClient(parameters);

    await resolveSsmEnv(env, client);

    expect(client.send.mock.calls.map(([command]) => command.input.Names?.length)).toEqual([10, 10, 3]);
    expect(env.K22).toBe('v22');
  });

  it('throws without changing env when a parameter is missing', async () => {
    const env: Record<string, string | undefined> = { A: 'ssm:/app/a', B: 'ssm:/app/missing' };

    await expect(resolveSsmEnv(env, fakeClient({ '/app/a': 'secret' }))).rejects.toThrow(
      'SSM parameters not found: B (/app/missing)'
    );
    expect(env.A).toBe('ssm:/app/a');
  });
});
