export const createAsyncQueue = <T>(init: () => T[]) => {
  let queue: T[] = init();
  let waiter: null | ((value: T[]) => void) = null;

  return {
    push: (value: T) => {
      if (waiter) {
        const wait = waiter;
        waiter = null;
        wait([value]);
      } else {
        queue.push(value);
      }
    },
    flush: (): Promise<T[]> => {
      if (queue.length) {
        const result = queue;
        queue = [];
        return Promise.resolve(result);
      } else {
        return new Promise<T[]>((resolve) => {
          waiter = resolve;
        });
      }
    },
    reset: () => {
      queue = init();
      waiter = null;
    },
  };
};
