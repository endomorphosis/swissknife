if (typeof (globalThis as any).util === 'undefined') {
  (globalThis as any).util = {};
}

if (typeof (globalThis as any).util.promisify === 'undefined') {
  (globalThis as any).util.promisify = (fn: Function) => {
    return function (...args: any[]) {
      return new Promise((resolve, reject) => {
        fn.call(this, ...args, (err: any, result: any) => {
          if (err) {
            return reject(err);
          }
          resolve(result);
        });
      });
    };
  };
}