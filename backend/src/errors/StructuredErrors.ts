export class CacheMissError extends Error {
  constructor(message: string = 'Cache miss') {
    super(message);
    this.name = 'CacheMissError';
  }
}

export class CacheExpiredError extends Error {
  constructor(message: string = 'Cache expired') {
    super(message);
    this.name = 'CacheExpiredError';
  }
}

export class MetadataFetchError extends Error {
  constructor(message: string = 'Failed to fetch metadata') {
    super(message);
    this.name = 'MetadataFetchError';
  }
}

export class DatabaseError extends Error {
  constructor(message: string = 'Database operation failed') {
    super(message);
    this.name = 'DatabaseError';
  }
}
