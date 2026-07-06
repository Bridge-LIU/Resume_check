declare module "word-extractor" {
  export default class WordExtractor {
    extract(input: string | Buffer): Promise<{
      getBody(): string;
      getFootnotes(): string;
      getEndnotes(): string;
      getHeaders(options?: { includeFooters?: boolean }): string;
      getFooters(): string;
      getAnnotations(): string;
      getTextboxes(options?: { includeHeadersAndFooters?: boolean }): string;
    }>;
  }
}
