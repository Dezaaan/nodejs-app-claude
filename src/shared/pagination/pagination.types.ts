// Page-number pagination: jump to any page. The total is counted only up to
// a limit, because counting every match costs as much as reading it.
export type OffsetPaginationMeta = {
  page: number;
  pageSize: number;
  // At most the counting limit; see totalItemsCapped.
  totalItems: number;
  totalPages: number;
  // True when there are more items than were counted: show "1,000+".
  totalItemsCapped: boolean;
  // Continues after this page with cursor pagination; null on the last page.
  nextCursor: string | null;
};

// Cursor pagination: every page costs the same however deep it is, but
// there is no total and no jumping to page N.
export type CursorPaginationMeta = {
  pageSize: number;
  nextCursor: string | null;
};

export type PaginatedResult<T> = {
  items: T[];
  pagination: OffsetPaginationMeta | CursorPaginationMeta;
};
