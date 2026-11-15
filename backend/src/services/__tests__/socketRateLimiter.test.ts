import { createSlidingWindowRateLimiter } from '../socketRateLimiter';

describe('socketRateLimiter', () => {
  it('allows up to the limit inside the window and rejects the next attempt', () => {
    const limiter = createSlidingWindowRateLimiter({ limit: 2, windowMs: 1000 });
    expect(limiter.take('socket-a', 0)).toBe(true);
    expect(limiter.take('socket-a', 10)).toBe(true);
    expect(limiter.take('socket-a', 20)).toBe(false);
    expect(limiter.size()).toBe(1);
  });

  it('isolates attempts per socket key', () => {
    const limiter = createSlidingWindowRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.take('socket-a', 0)).toBe(true);
    expect(limiter.take('socket-a', 1)).toBe(false);
    expect(limiter.take('socket-b', 1)).toBe(true);
  });

  it('frees slots after the window and can be reset', () => {
    const limiter = createSlidingWindowRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.take('socket-a', 0)).toBe(true);
    expect(limiter.take('socket-a', 500)).toBe(false);
    expect(limiter.take('socket-a', 1000)).toBe(true);
    expect(limiter.take('socket-a', 1001)).toBe(false);
    limiter.reset('socket-a');
    expect(limiter.take('socket-a', 1002)).toBe(true);
    limiter.reset();
    expect(limiter.size()).toBe(0);
  });
});
