import { describe, it, expect, vi } from 'vitest';
import { embed, DEFAULT_EMBEDDING_MODEL, type AiBinding } from './embed.js';

function makeAi(vectors: number[][]): AiBinding {
  return {
    run: vi.fn(() => Promise.resolve({ data: vectors })),
  };
}

const FAKE_VEC_768 = Array.from({ length: 768 }, (_, i) => i / 768);

describe('embed', () => {
  it('returns vectors, model, and dims for a single string', async () => {
    const ai = makeAi([FAKE_VEC_768]);
    const result = await embed(ai, 'hello world');
    expect(result.vectors).toHaveLength(1);
    expect(result.vectors[0]).toHaveLength(768);
    expect(result.model).toBe(DEFAULT_EMBEDDING_MODEL);
    expect(result.dims).toBe(768);
  });

  it('returns one vector per input when given an array', async () => {
    const vecs = [FAKE_VEC_768, FAKE_VEC_768.slice().reverse()];
    const ai = makeAi(vecs);
    const result = await embed(ai, ['text A', 'text B']);
    expect(result.vectors).toHaveLength(2);
    expect(result.dims).toBe(768);
  });

  it('calls ai.run with the correct model and text array', async () => {
    const runMock = vi.fn(() => Promise.resolve({ data: [FAKE_VEC_768] }));
    await embed({ run: runMock }, 'foo');
    expect(runMock).toHaveBeenCalledWith(DEFAULT_EMBEDDING_MODEL, { text: ['foo'] });
  });

  it('wraps a single string in an array before calling ai.run', async () => {
    const ai = makeAi([FAKE_VEC_768]);
    await embed(ai, 'single');
    const call = (ai.run as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { text: string[] }];
    expect(Array.isArray(call[1].text)).toBe(true);
    expect(call[1].text).toEqual(['single']);
  });

  it('uses the supplied model override', async () => {
    const customModel = '@cf/baai/bge-base-en-v1.5';
    const ai = makeAi([FAKE_VEC_768]);
    const result = await embed(ai, 'x', { model: customModel });
    expect(result.model).toBe(customModel);
    expect((ai.run as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(customModel);
  });

  it('throws when ai.run returns empty data', async () => {
    const ai: AiBinding = { run: vi.fn(() => Promise.resolve({ data: [] })) };
    await expect(embed(ai, 'test')).rejects.toThrow(/no vectors/);
  });

  it('propagates ai.run errors (caller decides to catch or not)', async () => {
    const ai: AiBinding = { run: vi.fn().mockRejectedValue(new Error('AI unavailable')) };
    await expect(embed(ai, 'test')).rejects.toThrow('AI unavailable');
  });

  it('dims matches the length of the first vector', async () => {
    const vec256 = Array.from({ length: 256 }, () => 0.1);
    const ai = makeAi([vec256]);
    const result = await embed(ai, 'small');
    expect(result.dims).toBe(256);
  });
});
