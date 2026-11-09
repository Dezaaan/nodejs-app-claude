import { AsyncLocalStorage } from "node:async_hooks";

type RequestContext = {
  requestId: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = (
  context: RequestContext,
  callback: () => void,
): void => {
  storage.run(context, callback);
};

export const getRequestContext = (): RequestContext | undefined =>
  storage.getStore();
