// PostgreSQL's code for a query cancelled by statement_timeout.
const QUERY_CANCELED = "57014";

// node-postgres throws this when no pooled connection frees up within
// connectionTimeoutMillis.
const POOL_TIMEOUT_MESSAGE = "timeout exceeded when trying to connect";

// True for errors that mean the database is overloaded rather than that
// the request is wrong. They are worth retrying later, so the API answers
// 503 instead of 500.
export const isDatabaseBusyError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const { code } = error as { code?: unknown };

  return (
    code === QUERY_CANCELED || error.message.includes(POOL_TIMEOUT_MESSAGE)
  );
};
