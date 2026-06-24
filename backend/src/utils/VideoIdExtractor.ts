export class VideoIdExtractor {
  /**
   * Extracts the YouTube Video ID from various formats:
   * - https://www.youtube.com/watch?v=dQw4w9WgXcQ
   * - https://youtu.be/dQw4w9WgXcQ
   * - https://www.youtube.com/embed/dQw4w9WgXcQ
   * - dQw4w9WgXcQ
   */
  static extract(urlOrId: string): string | null {
    if (!urlOrId || typeof urlOrId !== 'string') return null;

    // Remove any trailing slashes or whitespace
    const cleanUrl = urlOrId.trim().replace(/\/+$/, '');

    // Common YouTube Patterns
    const patterns = [
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?(?:.*&)?v=([^&#\s]+)/,
      /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([^?#\s]+)/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([^?#\s]+)/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([^?#\s]+)/
    ];

    for (const pattern of patterns) {
      const match = cleanUrl.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    // If no pattern matched, but it's an 11-character alphanumeric string,
    // it's highly likely to be a raw video ID.
    if (/^[a-zA-Z0-9_-]{11}$/.test(cleanUrl)) {
      return cleanUrl;
    }

    // For non-youtube URLs, we can just use the URL itself as the ID,
    // though this system is primarily optimized for YouTube.
    if (cleanUrl.startsWith('http')) {
      return cleanUrl;
    }

    return null;
  }
}
