import { debounce } from './debounce';

describe('debounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('should call the function after the specified delay', () => {
    const fn = jest.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn();

    expect(fn).not.toBeCalled();

    jest.advanceTimersByTime(50);
    expect(fn).not.toBeCalled();

    jest.advanceTimersByTime(50);
    expect(fn).toBeCalledTimes(1);
  });

  it('should call the function only once after multiple rapid calls', () => {
    const fn = jest.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn();
    debouncedFn();
    debouncedFn();
    debouncedFn();

    jest.advanceTimersByTime(99);
    expect(fn).not.toBeCalled();

    jest.advanceTimersByTime(1);
    expect(fn).toBeCalledTimes(1);
  });

  it('should pass the latest arguments to the debounced function', () => {
    const fn = jest.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn('arg1', 'arg2');
    debouncedFn('arg3', 'arg4');

    jest.advanceTimersByTime(100);

    expect(fn).toBeCalledWith('arg3', 'arg4');
  });

  it('should reset the timer on each call', () => {
    const fn = jest.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn();

    jest.advanceTimersByTime(50);
    debouncedFn();

    jest.advanceTimersByTime(50);
    expect(fn).not.toBeCalled(); // It's been 100ms since the FIRST call, but only 50ms since the SECOND

    jest.advanceTimersByTime(50);
    expect(fn).toBeCalledTimes(1); // Now it's been 100ms since the SECOND call
  });
});
