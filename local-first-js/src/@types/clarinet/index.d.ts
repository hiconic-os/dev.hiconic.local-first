declare module "clarinet" {
  export interface ClarinetParser {
    onopenobject: ((key?: string) => void) | null;
    onkey: ((key: string) => void) | null;
    onvalue: ((value: any) => void) | null;
    oncloseobject: (() => void) | null;
    onopenarray: (() => void) | null;
    onclosearray: (() => void) | null;
    onerror: ((error: Error) => void) | null;
    write(chunk: string): void;
    close(): void;

    /**
     * The current line number in the input (typically starting at 1).
     */
    line?: number;

    /**
     * The current column number in the input.
     */
    column?: number;

    /**
     * The overall character offset within the input stream.
     */
    position?: number;
  }

  /**
   * Creates and returns a new clarinet parser instance.
   */
  export function parser(): ClarinetParser;

  const clarinet: {
    parser: typeof parser;
  };

  export default clarinet;
}
