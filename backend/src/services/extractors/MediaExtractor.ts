export interface MediaExtractor {
  /**
   * Extracts a unique ID from the URL for caching purposes.
   */
  extractId(url: string): string | null;
  
  /**
   * Fetches metadata for the given URL.
   */
  extractMetadata(url: string): Promise<any>;
}
