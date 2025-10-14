import puppeteer, { Page, Browser } from "puppeteer";
import { mkdir } from "node:fs/promises";
import { parseArgs } from "util";

// Configuration interfaces
interface ScraperConfig {
  maxConcurrentTabs: number;
  pageTimeout: number;
  navigationTimeout: number;
  retryAttempts: number;
  delayBetweenOperations: number;
  headless: boolean;
  outputFormat: "json" | "csv" | "sqlite";
  outputDirectory: string;
  enableMetrics: boolean;
}

interface ScrapingMetrics {
  startTime: Date;
  booksCompleted: number;
  totalBooks: number;
  versesProcessed: number;
  errorsEncountered: number;
  averageBookProcessingTime: number;
  estimatedTimeRemaining: number;
  currentOperations: Map<string, Date>;
}

interface CliArgs {
  version?: string;
  output?: string;
  config?: string;
  debug?: boolean;
  parallel?: number;
  headless?: boolean;
  help?: boolean;
  books?: string[];
  pouchdb?: boolean;
}

// Abstract interfaces for testing
interface IBrowserManager {
  launch(config: ScraperConfig): Promise<Browser>;
  createPage(browser: Browser): Promise<Page>;
  close(browser: Browser): Promise<void>;
}

interface IFileSystem {
  writeFile(path: string, content: string): Promise<void>;
  mkdir(path: string, options?: any): Promise<void>;
}

// Type definitions
interface BibleVersionIds {
  [key: string]: number;
}

interface ChapterVerseCount {
  c: number;
  v: number[];
}

interface BibleDetail {
  _id?: string;
  name: string;
  abbreviation: string;
  language: string;
  books: string[];
  books_usfm: string[];
  cv_count: { [key: number]: ChapterVerseCount };
}

interface Verse {
  id: string;
  b: number;
  c: number;
  v: number;
  t: string;
  h: string;
  o: number;
  l: string;
}

interface BookResult {
  verses: Verse[];
  cv_count: ChapterVerseCount;
  cv_v_key: { [key: number]: number };
}

interface HeaderItem {
  target_order: number;
  text: string;
}

// Constants
const BIBLE_VERSION_IDS: BibleVersionIds = {
  // Indonesian
  TB: 306, // Alkitab Terjemahan Baru
  TSI: 320, // Terjemahan Sederhana Indonesia
  FAYH: 2727, // Firman Allah Yang Hidup
  BIMK: 27, // Bahasa Indonesia Masa Kini
  AMD: 199, // Alkitab Mudah Dibaca
  PBTB2: 2863, // Perjanjian Baru Terjemahan Baru 2

  // English
  KJV: 1, // King James Version
  NKJV: 114, // New King James Version
  MSG: 97, // The Message
  NET: 107, // New English Translation
  NIV: 111, // New International Version
  NLT: 116, // New Living Translation
  AMP: 1588, // Amplified Bible
  NASB1995: 100, // New American Standard Bible, 1995
  GNT: 68, // Good News Translation, for checking JOB.3.GNT
  ESV: 59, // English Standard Version 2016
  AFV: 4253, // A Faithful Version
  CSB: 1713, // Christian Standard Bible

  // German
  HFA: 73, // Hoffnung Fur Alle

  // Chinese
  RCUV: 139, // Revised Chinese Union Version
  RCUVSS: 140, // Revised Chinese Union Version, Simplified
  "CUNP-神": 46, // Chinese Union Version with New Punctuation, Shén version
  "CUNPSS-神": 48, // Chinese Union Version with New Punctuation, Shén version, Simplified
  "CUNP-上帝": 414, // Chinese Union Version with New Punctuation, Shàngdì version
  "CUNPSS-上帝": 57, // Chinese Union Version with New Punctuation, Shàngdì version, Simplified

  // French
  PDV2017: 133, // Parole de Vie 2017 ✔️

  // Dutch
  HTB: 75, // Het Boek ✔️

  // Japanese
  聖書新共同訳: 1819, // Seisho Shinkyoudoyaku
};

// Default configuration
const DEFAULT_CONFIG: ScraperConfig = {
  maxConcurrentTabs: 4,
  pageTimeout: 30000,
  navigationTimeout: 10000,
  retryAttempts: 3,
  delayBetweenOperations: 300,
  headless: false,
  outputFormat: "json",
  outputDirectory: "./output",
  enableMetrics: true,
};

// CLI argument parser
function parseCliArguments(): CliArgs {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      version: { type: "string", short: "v" },
      output: { type: "string", short: "o" },
      config: { type: "string", short: "c" },
      debug: { type: "boolean", short: "d" },
      parallel: { type: "string", short: "p" },
      headless: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      books: { type: "string", multiple: true, short: "b" },
      pouchdb: { type: "boolean" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
Bible Scraper CLI

Usage: bun run index.ts [options]

Options:
  -v, --version <version>    Bible version to scrape (required)
  -o, --output <directory>   Output directory (default: ./output)
  -c, --config <file>        Configuration file path
  -d, --debug               Enable debug logging
  -p, --parallel <number>    Number of parallel tabs (1-10)
  -b, --books <books>        Specific books to scrape (comma-separated or multiple flags)
  --headless                Run browser in headless mode
  --pouchdb                 Output in PouchDB JSON structure format
  -h, --help                Show this help message

Available versions: ${Object.keys(BIBLE_VERSION_IDS).join(", ")}

Examples:
  bun run index.ts --version ESV
  bun run index.ts --version KJV --debug --parallel 6 --headless
  bun run index.ts --version ESV --books GEN,EXO,LEV
  bun run index.ts --version NIV -b GEN -b EXO -b MAT
  bun run index.ts --version TB --pouchdb
    `);
    process.exit(0);
  }

  // Process books argument - handle comma-separated values
  let booksToProcess: string[] | undefined;
  if (values.books) {
    const booksArray = Array.isArray(values.books)
      ? values.books
      : [values.books];
    booksToProcess = booksArray
      .flatMap((book) => book.split(",").map((b) => b.trim().toUpperCase()))
      .filter(Boolean);
  }

  return {
    version: values.version || positionals[0],
    output: values.output,
    config: values.config,
    debug: values.debug,
    parallel: values.parallel ? parseInt(values.parallel as string) : undefined,
    headless: values.headless,
    help: values.help,
    books: booksToProcess,
    pouchdb: values.pouchdb,
  } as CliArgs;
}

// Logging system
enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4,
}

class Logger {
  private static currentLevel: LogLevel = LogLevel.INFO;
  private static startTime: Date = new Date();

  static setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  private static formatMessage(
    level: string,
    message: string,
    context?: string
  ): string {
    const timestamp = new Date().toISOString();
    const elapsed = new Date().getTime() - this.startTime.getTime();
    const contextStr = context ? `[${context}] ` : "";
    return `${timestamp} [${level}] ${contextStr}${message} (+${elapsed}ms)`;
  }

  static error(message: string, context?: string, error?: Error): void {
    if (this.currentLevel >= LogLevel.ERROR) {
      console.error(this.formatMessage("ERROR", message, context));
      if (error) {
        console.error(error.stack || error.message);
      }
    }
  }

  static warn(message: string, context?: string): void {
    if (this.currentLevel >= LogLevel.WARN) {
      console.warn(this.formatMessage("WARN", message, context));
    }
  }

  static info(message: string, context?: string): void {
    if (this.currentLevel >= LogLevel.INFO) {
      console.info(this.formatMessage("INFO", message, context));
    }
  }

  static debug(message: string, context?: string): void {
    if (this.currentLevel >= LogLevel.DEBUG) {
      console.log(this.formatMessage("DEBUG", message, context));
    }
  }

  static trace(message: string, context?: string): void {
    if (this.currentLevel >= LogLevel.TRACE) {
      console.log(this.formatMessage("TRACE", message, context));
    }
  }

  static progress(
    current: number,
    total: number,
    message: string,
    context?: string
  ): void {
    const percentage = Math.round((current / total) * 100);
    const progressBar =
      "█".repeat(Math.floor(percentage / 5)) +
      "░".repeat(20 - Math.floor(percentage / 5));
    this.info(
      `[${progressBar}] ${percentage}% (${current}/${total}) ${message}`,
      context
    );
  }

  static success(message: string, context?: string): void {
    console.log(
      `\x1b[32m${this.formatMessage("SUCCESS", message, context)}\x1b[0m`
    );
  }
}

// Input validation
class InputValidator {
  static validateBibleVersion(version: string): boolean {
    if (!version || typeof version !== "string") {
      throw new Error("Bible version must be a non-empty string");
    }

    if (!BIBLE_VERSION_IDS[version]) {
      const availableVersions = Object.keys(BIBLE_VERSION_IDS).join(", ");
      throw new Error(
        `Unknown Bible version: ${version}. Available versions: ${availableVersions}`
      );
    }

    return true;
  }

  static validateConfig(config: Partial<ScraperConfig>): void {
    if (
      config.maxConcurrentTabs &&
      (config.maxConcurrentTabs < 1 || config.maxConcurrentTabs > 100)
    ) {
      throw new Error("maxConcurrentTabs must be between 1 and 100");
    }

    if (config.pageTimeout && config.pageTimeout < 1000) {
      throw new Error("pageTimeout must be at least 1000ms");
    }

    if (
      config.retryAttempts &&
      (config.retryAttempts < 1 || config.retryAttempts > 10)
    ) {
      throw new Error("retryAttempts must be between 1 and 10");
    }
  }
}

// Metrics tracking
class MetricsTracker {
  private metrics: ScrapingMetrics;
  private bookStartTimes: Map<string, Date> = new Map();

  constructor(totalBooks: number) {
    this.metrics = {
      startTime: new Date(),
      booksCompleted: 0,
      totalBooks,
      versesProcessed: 0,
      errorsEncountered: 0,
      averageBookProcessingTime: 0,
      estimatedTimeRemaining: 0,
      currentOperations: new Map(),
    };
  }

  startBook(bookUsfm: string): void {
    const startTime = new Date();
    this.bookStartTimes.set(bookUsfm, startTime);
    this.metrics.currentOperations.set(bookUsfm, startTime);
  }

  completeBook(bookUsfm: string, versesCount: number): void {
    const startTime = this.bookStartTimes.get(bookUsfm);
    if (startTime) {
      const processingTime = new Date().getTime() - startTime.getTime();
      this.updateAverageTime(processingTime);
      this.bookStartTimes.delete(bookUsfm);
      this.metrics.currentOperations.delete(bookUsfm);
    }

    this.metrics.booksCompleted++;
    this.metrics.versesProcessed += versesCount;
    this.updateEstimatedTime();

    Logger.progress(
      this.metrics.booksCompleted,
      this.metrics.totalBooks,
      `${bookUsfm} completed (${versesCount} verses) - ETA: ${Math.round(
        this.metrics.estimatedTimeRemaining / 60000
      )}min`,
      "Metrics"
    );
  }

  recordError(context: string, error: Error): void {
    this.metrics.errorsEncountered++;
    Logger.error(`Error in ${context}`, "Metrics", error);
  }

  private updateAverageTime(processingTime: number): void {
    if (this.metrics.booksCompleted === 1) {
      this.metrics.averageBookProcessingTime = processingTime;
    } else {
      this.metrics.averageBookProcessingTime =
        (this.metrics.averageBookProcessingTime *
          (this.metrics.booksCompleted - 1) +
          processingTime) /
        this.metrics.booksCompleted;
    }
  }

  private updateEstimatedTime(): void {
    const remainingBooks =
      this.metrics.totalBooks - this.metrics.booksCompleted;
    this.metrics.estimatedTimeRemaining =
      remainingBooks * this.metrics.averageBookProcessingTime;
  }

  getMetrics(): ScrapingMetrics {
    return { ...this.metrics };
  }

  getSummary(): string {
    const elapsed = new Date().getTime() - this.metrics.startTime.getTime();
    const elapsedMinutes = Math.round(elapsed / 60000);
    const etaMinutes = Math.round(this.metrics.estimatedTimeRemaining / 60000);

    return `
Scraping Metrics Summary:
========================
Books Completed: ${this.metrics.booksCompleted}/${this.metrics.totalBooks}
Verses Processed: ${this.metrics.versesProcessed}
Errors Encountered: ${this.metrics.errorsEncountered}
Elapsed Time: ${elapsedMinutes} minutes
Estimated Time Remaining: ${etaMinutes} minutes
Average Book Processing Time: ${Math.round(
      this.metrics.averageBookProcessingTime / 1000
    )}s
Success Rate: ${(
      (this.metrics.booksCompleted / this.metrics.totalBooks) *
      100
    ).toFixed(1)}%
    `;
  }
}

// Resource Management
class ResourceManager {
  private browser: Browser | null = null;
  private pages: Page[] = [];
  private isShuttingDown = false;

  async initializeBrowser(config: ScraperConfig): Promise<Browser> {
    Logger.info(
      "Initializing browser with resource management",
      "ResourceManager"
    );

    this.browser = await puppeteer.launch({
      headless: config.headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--memory-pressure-off",
      ],
    });

    // Graceful shutdown handling
    process.on("SIGINT", () => this.gracefulShutdown());
    process.on("SIGTERM", () => this.gracefulShutdown());
    process.on("uncaughtException", (error) => {
      Logger.error("Uncaught exception", "ResourceManager", error);
      this.gracefulShutdown();
    });

    return this.browser;
  }

  async createTabPool(size: number, config: ScraperConfig): Promise<Page[]> {
    if (!this.browser) {
      throw new Error("Browser not initialized");
    }

    Logger.info(`Creating managed tab pool of size ${size}`, "ResourceManager");

    for (let i = 0; i < size; i++) {
      const page = await this.browser.newPage();

      // Set reasonable defaults
      await page.setDefaultTimeout(config.pageTimeout);
      await page.setDefaultNavigationTimeout(config.navigationTimeout);

      // Add error handling
      page.on("error", (err) => {
        Logger.error(`Page error in tab ${i}`, "ResourceManager", err);
      });

      page.on("pageerror", (err) => {
        Logger.error(
          `Page script error in tab ${i}: ${err.message}`,
          "ResourceManager"
        );
      });

      page.on("console", (msg) => {
        if (msg.type() === "error") {
          Logger.debug(
            `Browser console error in tab ${i}: ${msg.text()}`,
            "ResourceManager"
          );
        }
      });

      this.pages.push(page);
    }

    return this.pages;
  }

  async gracefulShutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    Logger.info("Initiating graceful shutdown", "ResourceManager");

    try {
      // Close all pages first
      await Promise.all(
        this.pages.map((page) =>
          page
            .close()
            .catch((err) =>
              Logger.warn(
                "Error closing page during shutdown",
                "ResourceManager"
              )
            )
        )
      );

      // Then close browser
      if (this.browser) {
        await this.browser.close();
        Logger.info("Browser closed successfully", "ResourceManager");
      }
    } catch (error) {
      Logger.error("Error during shutdown", "ResourceManager", error as Error);
    }

    process.exit(0);
  }

  async cleanup(): Promise<void> {
    await this.gracefulShutdown();
  }

  /**
   * Close and recreate a tab after book processing to prevent memory leaks and stale state
   */
  async clearTab(
    page: Page,
    tabNumber: number,
    config: ScraperConfig
  ): Promise<Page> {
    try {
      Logger.debug(
        `Closing and recreating tab ${tabNumber} after book completion`,
        "ResourceManager"
      );

      if (!this.browser) {
        throw new Error("Browser not initialized");
      }

      // Find the index of this page in our pages array
      const pageIndex = this.pages.indexOf(page);

      if (pageIndex === -1) {
        Logger.warn(
          `Tab ${tabNumber} not found in pages array`,
          "ResourceManager"
        );
        return page;
      }

      // Close the old page
      await page.close();

      // Create a new page with the same configuration
      const newPage = await this.browser.newPage();

      // Set reasonable defaults (same as in createTabPool)
      await newPage.setDefaultTimeout(config.pageTimeout);
      await newPage.setDefaultNavigationTimeout(config.navigationTimeout);

      // Add error handling
      newPage.on("error", (err) => {
        Logger.error(`Page error in tab ${tabNumber}`, "ResourceManager", err);
      });

      newPage.on("pageerror", (err) => {
        Logger.error(
          `Page script error in tab ${tabNumber}: ${err.message}`,
          "ResourceManager"
        );
      });

      newPage.on("console", (msg) => {
        if (msg.type() === "error") {
          Logger.debug(
            `Browser console error in tab ${tabNumber}: ${msg.text()}`,
            "ResourceManager"
          );
        }
      });

      // Replace the old page in our pages array
      this.pages[pageIndex] = newPage;

      Logger.debug(
        `Tab ${tabNumber} closed and recreated successfully`,
        "ResourceManager"
      );
      return newPage;
    } catch (error) {
      Logger.warn(
        `Failed to close and recreate tab ${tabNumber}: ${error}`,
        "ResourceManager"
      );
      return page; // Return the original page if recreation fails
    }
  }
}

// File system implementations
class BunFileSystem implements IFileSystem {
  async writeFile(path: string, content: string): Promise<void> {
    await Bun.write(path, content);
  }

  async mkdir(path: string, options?: any): Promise<void> {
    await mkdir(path, options);
  }
}

class PuppeteerBrowserManager implements IBrowserManager {
  async launch(config: ScraperConfig): Promise<Browser> {
    return await puppeteer.launch({
      headless: config.headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
  }

  async createPage(browser: Browser): Promise<Page> {
    return await browser.newPage();
  }

  async close(browser: Browser): Promise<void> {
    await browser.close();
  }
}

// Utility functions
class BibleScraperUtils {
  /**
   * Retry mechanism with exponential backoff
   */
  static async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000,
    context: string = "Operation"
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxRetries) {
          Logger.error(
            `${context} failed after ${maxRetries} attempts`,
            "Utils",
            error as Error
          );
          throw error;
        }
        Logger.warn(
          `${context} attempt ${attempt} failed, retrying in ${
            delay * attempt
          }ms`,
          "Utils"
        );
        await this.delay(delay * attempt); // Exponential backoff
      }
    }
    throw new Error("Should never reach here");
  }

  /**
   * Safe page operation wrapper
   */
  static async safePageOperation<T>(
    page: Page,
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 2
  ): Promise<T | null> {
    try {
      return await this.retryOperation(
        operation,
        maxRetries,
        500,
        operationName
      );
    } catch (error) {
      Logger.error(
        `Page operation '${operationName}' failed`,
        "Utils",
        error as Error
      );
      return null;
    }
  }

  /**
   * Wait until all elements, including javascript are loaded on a Puppeteer page.
   */
  static async waitTillHTMLRendered(
    page: Page,
    timeout = 30000
  ): Promise<void> {
    const checkDurationMsecs = 500;
    const maxChecks = timeout / checkDurationMsecs;
    let lastHTMLSize = 0;
    let checkCounts = 1;
    let countStableSizeIterations = 0;
    const minStableSizeIterations = 3;

    while (checkCounts++ <= maxChecks) {
      const html = await page.content();
      const currentHTMLSize = html.length;

      await page.evaluate(() => document.body.innerHTML.length);

      if (lastHTMLSize != 0 && currentHTMLSize == lastHTMLSize)
        countStableSizeIterations++;
      else countStableSizeIterations = 0;

      if (countStableSizeIterations >= minStableSizeIterations) {
        break;
      }

      lastHTMLSize = currentHTMLSize;
      await new Promise((r) => setTimeout(r, checkDurationMsecs));
    }
  }

  /**
   * Clean and trim Bible.com ChapterContent css classes, return the class identifier only.
   */
  static cleanChapterContentClass(chapterContentClass: string): string {
    let result = "";
    const input = chapterContentClass.toLowerCase();
    const regexChapterContent =
      /(chaptercontent_)(\w+)(__[a-z0-9]+)(\s)?(.+)?/i;
    const regRes = input.match(regexChapterContent);

    if (regRes != null && regRes[2] != null) {
      result = regRes[2];
    }
    return result;
  }

  /**
   * Generate unique verse ID from book, chapter, and order numbers.
   */
  static getVerseId(book: number, chapter: number, order: number): string {
    return `${book}${String(chapter).padStart(3, "0")}${String(order).padStart(
      3,
      "0"
    )}`;
  }

  /**
   * Check if input string represents a heading top container.
   */
  static isHeadingTopContainer(input: string): boolean {
    const headingPatterns = [
      /mt(\d+)?/i,
      /mte(\d+)?/i,
      /ms(\d+)?/i,
      /mr/i,
      /s(\d+)?/i,
      /sr/i,
      /r/i,
      /d/i,
      /sp/i,
      /sd(\d+)?/i,
    ];

    return headingPatterns.some((pattern) => pattern.test(input));
  }

  /**
   * Extract chapter number from input string, handling special cases.
   */
  static getNumberFromChapter(input: string): number {
    const regex_extra_chapter = /(\d+)_(\d+)/;
    if (regex_extra_chapter.test(input)) {
      const extra_chapter_result = regex_extra_chapter.exec(input);
      if (extra_chapter_result) {
        return Number(extra_chapter_result[1]);
      }
    }
    return Number(input);
  }

  /**
   * Clean and normalize text content.
   */
  static cleanText(text: string): string {
    return text
      .trim()
      .split(/[\s]+/)
      .join(" ")
      .replaceAll(" .", ".")
      .replaceAll(" ,", ",");
  }

  /**
   * Add delay between operations to prevent overwhelming the page.
   */
  static async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

class BibleScraper {
  private readonly versionToGet: string;
  private readonly bibleVersionId: number;
  private readonly outputDetailFile: string;
  private readonly outputVersesFile: string;
  private readonly baseUrl: string;
  private readonly config: ScraperConfig;
  private readonly resourceManager: ResourceManager;
  private readonly metrics: MetricsTracker | null = null;
  private readonly browserManager: IBrowserManager;
  private readonly fileSystem: IFileSystem;
  private readonly specificBooks?: string[];
  private readonly pouchdbFormat: boolean;

  constructor(
    versionKey: string,
    config: Partial<ScraperConfig> = {},
    specificBooks?: string[],
    pouchdbFormat: boolean = false,
    browserManager: IBrowserManager = new PuppeteerBrowserManager(),
    fileSystem: IFileSystem = new BunFileSystem()
  ) {
    // Validate inputs
    InputValidator.validateBibleVersion(versionKey);
    InputValidator.validateConfig(config);

    this.versionToGet = versionKey;
    this.bibleVersionId = BIBLE_VERSION_IDS[versionKey];
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.specificBooks = specificBooks;
    this.pouchdbFormat = pouchdbFormat;
    this.outputDetailFile = `${this.config.outputDirectory}/${versionKey}_detail.json`;
    this.outputVersesFile = `${this.config.outputDirectory}/${versionKey}_verses.json`;
    this.baseUrl = `https://www.bible.com/bible/${this.bibleVersionId}/REV.1.${versionKey}`;
    this.resourceManager = new ResourceManager();
    this.browserManager = browserManager;
    this.fileSystem = fileSystem;
  }

  private initializeMetrics(totalBooks: number): MetricsTracker {
    return this.config.enableMetrics
      ? new MetricsTracker(totalBooks)
      : (null as any);
  }

  async initializeOutputDirectory(): Promise<void> {
    await this.fileSystem.mkdir(
      `${this.config.outputDirectory}/${this.versionToGet}`,
      { recursive: true }
    );
  }

  private async closeCookiesBanner(page: Page): Promise<void> {
    const result = await BibleScraperUtils.safePageOperation(
      page,
      async () => {
        Logger.debug("Attempting to close cookies banner", "BibleScraper");
        const cookiesBtn = await page.waitForSelector(
          "button[data-testid='close-cookie-banner']",
          { timeout: 5000 }
        );
        if (cookiesBtn) {
          await cookiesBtn.click();
          Logger.debug("Cookies banner closed successfully", "BibleScraper");
          return true;
        }
        return false;
      },
      "Close cookies banner"
    );

    if (result === null) {
      Logger.debug("No cookies banner found or already closed", "BibleScraper");
    }
  }

  /** this function is make sure the final abbreviation does not include unicode characters because pouchdb cannot handle unicode characters in its _id.  */
  private convertUnicodeAbbreviation(abbr: string): string {
    return (
      abbr
        ?.trim()
        .replaceAll(" ", "")
        .replace("神", "SHEN")
        .replace("上帝", "SHANGDI")
        .replace("聖書新共同訳", "SeishoShinkyoudoyaku")
        .replace("新共同訳", "SeishoShinkyoudoyaku")
        .toUpperCase() || ""
    );
  }

  private async getBibleDetails(page: Page): Promise<BibleDetail> {
    Logger.info("Extracting Bible metadata from page", "BibleScraper");

    const bibInfoArray = await page.$$eval(
      "main div.max-w-full.w-full a h2",
      (elements) => elements.map((el) => el.textContent)
    );

    const bibleDetail: BibleDetail = {
      name: "",
      abbreviation: "",
      language: "",
      books: [],
      books_usfm: [],
      cv_count: {},
    };

    this.parseBibleInfo(bibInfoArray, bibleDetail);
    Logger.info(
      `Bible details extracted - ${bibleDetail.name} (${bibleDetail.abbreviation}) in ${bibleDetail.language}`,
      "BibleScraper"
    );
    return bibleDetail;
  }
  private parseBibleInfo(
    bibInfoArray: (string | null)[],
    bibleDetail: BibleDetail
  ): void {
    if (!bibInfoArray) return;

    const arrayLength = bibInfoArray.length;
    let languageIndex: number;
    let versionIndex: number;

    // Determine indices based on array length
    if (arrayLength === 7) {
      languageIndex = 4;
      versionIndex = 5;
    } else if (arrayLength === 6) {
      languageIndex = 3;
      versionIndex = 4;
    } else if (arrayLength === 5) {
      languageIndex = 2;
      versionIndex = 3;
    } else {
      return; // Unsupported format
    }

    // Extract language
    if (bibInfoArray[languageIndex]) {
      bibleDetail.language = bibInfoArray[languageIndex]!.toLowerCase();
      Logger.debug(
        `Language detected: ${bibleDetail.language}`,
        "BibleScraper"
      );
    }

    // Extract name and abbreviation
    if (bibInfoArray[versionIndex]) {
      const filteredVersion = bibInfoArray[versionIndex]!.replace(
        "Version: ",
        ""
      ).split("-");

      bibleDetail.name = filteredVersion[0].trim();
      // bibleDetail.abbreviation =
      //   filteredVersion[1]
      //     ?.trim()
      //     .replaceAll(" ", "")
      //     .replace("神", "SHEN")
      //     .replace("上帝", "SHANGDI")
      //     .replace("新共同訳", "SeishoShinkyoudoyaku")
      //     .toUpperCase() || "";
      bibleDetail.abbreviation = this.convertUnicodeAbbreviation(
        filteredVersion[1]
      );

      Logger.debug(`Bible name: ${bibleDetail.name}`, "BibleScraper");
      Logger.debug(
        `Bible abbreviation: ${bibleDetail.abbreviation}`,
        "BibleScraper"
      );
    }
  }

  private async getBookList(page: Page): Promise<{
    bookNames: string[];
    bookCodes: string[];
    chapterCounts: number[];
  }> {
    Logger.info(
      "Discovering available books from Bible navigation",
      "BibleScraper"
    );
    const selectBooksButton = await page.waitForSelector(
      "button[id*='headlessui-popover-button-:r0']"
    );

    let generatedBookList: string[] = [];
    let booksArray: string[] = [];
    let chapterCountsArray: number[] = [];

    if (selectBooksButton) {
      Logger.debug("Opening book selection menu", "BibleScraper");
      await selectBooksButton.click();

      const listOfBooksUl = await page.waitForSelector(
        `div[id^="headlessui-popover-panel-"] > div[class*="overflow-y-auto"] > ul`
      );

      if (listOfBooksUl) {
        booksArray = await page.$$eval(
          `div[id^="headlessui-popover-panel-"] > div[class*="overflow-y-auto"] > ul li`,
          (elements) => elements.map((el) => el.textContent || "")
        );

        Logger.info(
          `Found ${booksArray.length} books available`,
          "BibleScraper"
        );

        const booksButtons = await page.$$(
          `div[id^="headlessui-popover-panel-"] > div[class*="overflow-y-auto"] > ul button`
        );

        for (let i = 0; i < booksButtons.length; i++) {
          // Re-select buttons because they become detached after every click
          const allButtons = await page.$$(
            `div[id^="headlessui-popover-panel-"] > div[class*="overflow-y-auto"] > ul button`
          );

          await allButtons[i].click();
          await BibleScraperUtils.delay(100);

          const allChapters = await page.$$(
            `div[id^="headlessui-popover-panel-"] > div[class*="overflow-y-auto"] > ul li`
          );

          let chapterLength = allChapters.length;

          Logger.debug(`chapters: ${chapterLength}`, "BibleScraper");

          const firstChapter = await allChapters[0].$("a");
          if (firstChapter) {
            const hrefText = await firstChapter.evaluate((el) =>
              el.getAttribute("href")
            );

            if (hrefText) {
              const segments = hrefText.split("/");
              const lastPart = segments[segments.length - 1];
              const bookCode = lastPart.split(".")[0];

              // if we detect INTRO from first chapter, then decrease the number of detected chapter by 1, as we do not include the introduction page when scraping.
              if (lastPart.split(".")[1].toLowerCase().includes("intro")) {
                chapterLength -= 1;
              }

              Logger.debug(
                `Extracted book code: ${bookCode} with ${chapterLength} chapters`,
                "BibleScraper"
              );
              generatedBookList.push(bookCode);
              chapterCountsArray.push(chapterLength);
            }
          }

          const chapterBackButton = await page.$(
            'div[id^="headlessui-popover-panel-"] > div > div > button'
          );

          if (chapterBackButton) {
            Logger.trace(
              "Navigating back from chapter selection",
              "BibleScraper"
            );
            await chapterBackButton.click();
            await BibleScraperUtils.delay(150);
          }
        }

        Logger.debug(
          `Generated book USFM list: [${generatedBookList.join(", ")}]`,
          "BibleScraper"
        );
      }
    }

    return {
      bookNames: booksArray || [],
      bookCodes: generatedBookList,
      chapterCounts: chapterCountsArray,
    };
  }

  private async processBook(
    bookUsfm: string,
    bookNumber: number,
    tabPage: Page,
    expectedChapterCount?: number
  ): Promise<BookResult> {
    Logger.info(
      `Starting processing of book: ${bookUsfm}${
        expectedChapterCount
          ? ` (expecting ${expectedChapterCount} chapters)`
          : ""
      }`,
      `Tab-${bookNumber}`
    );

    const bookResult: BookResult = {
      verses: [],
      cv_count: { c: 0, v: [] },
      cv_v_key: {},
    };

    // Navigate to first chapter of the book
    let bookUrl = `https://www.bible.com/bible/${this.bibleVersionId}/${bookUsfm}.1.${this.versionToGet}`;
    await tabPage.goto(bookUrl, { waitUntil: "networkidle2" });
    await BibleScraperUtils.waitTillHTMLRendered(tabPage);

    // Check if chapter 1 is not available and try 1_1 instead
    try {
      const notAvailable = await tabPage.waitForSelector(
        `span[class*='ChapterContent_not-avaliable']`,
        { timeout: 1000 }
      );

      if (notAvailable) {
        Logger.info(
          `Chapter 1 not available for ${bookUsfm}, trying chapter 1_1`,
          `Tab-${bookNumber}`
        );
        // Try with 1_1 format
        bookUrl = `https://www.bible.com/bible/${this.bibleVersionId}/${bookUsfm}.1_1.${this.versionToGet}`;
        await tabPage.goto(bookUrl, { waitUntil: "networkidle2" });
        await BibleScraperUtils.waitTillHTMLRendered(tabPage);
      }
    } catch (err) {
      // Chapter 1 is available, continue normally
    }

    let currentChapter = 0;
    let currentChapterString = "0";
    let nextChapterButtonFound = true;
    let chaptersProcessed = 0;

    // Process all chapters in this book
    while (nextChapterButtonFound) {
      const currentPageUrl = await tabPage.url();
      Logger.debug(
        `Processing chapter from URL: ${currentPageUrl}`,
        `Tab-${bookNumber}`
      );

      const segments = new URL(currentPageUrl).pathname.split("/");
      const lastPartOfUrl = segments.pop() || segments.pop();
      let skip = false;

      if (lastPartOfUrl) {
        const middlePart = lastPartOfUrl.split(".")[1];
        if (middlePart.length >= 5 && middlePart.slice(0, 5) === "INTRO") {
          skip = true;
          Logger.debug(
            "INTRO page detected, skipping content parsing",
            `Tab-${bookNumber}`
          );
        } else {
          currentChapter = BibleScraperUtils.getNumberFromChapter(middlePart);
          currentChapterString = middlePart;
          Logger.debug(
            `Processing chapter ${currentChapter} (${currentChapterString})`,
            `Tab-${bookNumber}`
          );
        }

        // Check for page errors
        try {
          const notAvailable = await tabPage.waitForSelector(
            `span[class*='ChapterContent_not-avaliable']`,
            { timeout: 500 }
          );

          if (notAvailable) {
            Logger.warn(
              "Chapter content not available, skipping",
              `Tab-${bookNumber}`
            );
            skip = true;
          }
        } catch (err) {
          // Content is available
        }
      }

      if (!skip) {
        const chapterContainer = await tabPage.waitForSelector(
          `div[data-usfm*='${bookUsfm}.${currentChapterString}']`,
          { timeout: 5000 }
        );

        if (chapterContainer) {
          await this.processChapterContent(
            chapterContainer,
            bookNumber,
            currentChapter,
            bookResult
          );
          chaptersProcessed++;
          await BibleScraperUtils.delay(300);
        }
      } else {
        Logger.warn(
          `Skipped page: ${bookUsfm}.${currentChapter}`,
          `Tab-${bookNumber}`
        );
      }

      // Try to navigate to next chapter
      nextChapterButtonFound = await this.navigateToNextChapter(
        tabPage,
        bookUsfm,
        bookNumber,
        currentChapter,
        bookResult
      );

      // Check if we've reached the expected chapter count
      if (expectedChapterCount && chaptersProcessed >= expectedChapterCount) {
        Logger.info(
          `Reached expected chapter count (${expectedChapterCount}) for ${bookUsfm}`,
          `Tab-${bookNumber}`
        );
        nextChapterButtonFound = false;
      }
    }

    // Validate chapter count
    if (expectedChapterCount && chaptersProcessed !== expectedChapterCount) {
      Logger.warn(
        `Book ${bookUsfm}: Expected ${expectedChapterCount} chapters but processed ${chaptersProcessed}`,
        `Tab-${bookNumber}`
      );
    }

    Logger.success(
      `Completed book ${bookUsfm} with ${bookResult.verses.length} verses (${chaptersProcessed} chapters)`,
      `Tab-${bookNumber}`
    );
    return bookResult;
  }

  private async processChapterContent(
    chapterContainer: any,
    bookNumber: number,
    currentChapter: number,
    bookResult: BookResult
  ): Promise<void> {
    const chapterChildren = await chapterContainer.$$(
      `:is(:scope > div, :scope > table)`
    );
    let lastVerseUsfm = "";
    let lastVerseLabel = "";
    let resultVerse: Verse = {
      id: "",
      b: bookNumber,
      c: 0,
      v: 0,
      t: "",
      h: "",
      o: 0,
      l: "",
    };

    let saveHeaders: HeaderItem[] = [];
    let chapterVerseOrderCounter = 0;
    let headerOrderCounter = 0;

    // Process each chapter element
    for (let i = 0; i < chapterChildren.length; i++) {
      const cc = chapterChildren[i];
      const topParentClassType = BibleScraperUtils.cleanChapterContentClass(
        await (await cc.getProperty("className")).jsonValue()
      );

      if (BibleScraperUtils.isHeadingTopContainer(topParentClassType)) {
        if (saveHeaders.length && saveHeaders[0].text !== "") {
          saveHeaders[0].text += "\n";
        }
      }

      let ccSpans = await cc.$$(`:scope > span`);
      if (topParentClassType === "table") {
        ccSpans = await cc.$$(`:scope td.cell > span`);
      }

      for (let j = 0; j < ccSpans.length; j++) {
        const ccsp = ccSpans[j];
        const parentVersesType = BibleScraperUtils.cleanChapterContentClass(
          await (await ccsp.getProperty("className")).jsonValue()
        );

        if (parentVersesType === "heading" || parentVersesType === "nd") {
          await this.processHeading(
            ccsp,
            parentVersesType,
            saveHeaders,
            headerOrderCounter
          );
        } else if (parentVersesType === "verse") {
          const processed = await this.processVerse(
            ccsp,
            lastVerseUsfm,
            lastVerseLabel,
            resultVerse,
            saveHeaders,
            chapterVerseOrderCounter,
            headerOrderCounter,
            bookNumber,
            bookResult
          );

          if (processed.newVerse) {
            lastVerseUsfm = processed.verseUsfm;
            lastVerseLabel = processed.verseLabel;
            chapterVerseOrderCounter = processed.chapterVerseOrderCounter;
            headerOrderCounter = processed.headerOrderCounter;
          }

          // Handle last verse of chapter
          if (i === chapterChildren.length - 1 && j === ccSpans.length - 1) {
            this.finalizeVerse(
              resultVerse,
              saveHeaders,
              chapterVerseOrderCounter + 1,
              bookNumber,
              currentChapter,
              bookResult
            );
          }
        }
      }

      // Handle blank paragraph at end
      if (i === chapterChildren.length - 1 && topParentClassType === "b") {
        this.finalizeVerse(
          resultVerse,
          saveHeaders,
          chapterVerseOrderCounter + 1,
          bookNumber,
          currentChapter,
          bookResult
        );
      }
    }
  }

  private async processHeading(
    ccsp: any,
    parentVersesType: string,
    saveHeaders: HeaderItem[],
    headerOrderCounter: number
  ): Promise<void> {
    const getHeadingText = await ccsp.evaluate((el: any) => el.textContent);
    if (getHeadingText) {
      const targetOrder = headerOrderCounter + 1;
      const headersExist = saveHeaders.find(
        (el) => el.target_order === targetOrder
      );

      const text =
        parentVersesType === "nd"
          ? getHeadingText.toUpperCase()
          : getHeadingText;

      if (headersExist) {
        headersExist.text += text;
      } else {
        saveHeaders.push({ target_order: targetOrder, text });
      }
    }
  }

  private async processVerse(
    ccsp: any,
    lastVerseUsfm: string,
    lastVerseLabel: string,
    resultVerse: Verse,
    saveHeaders: HeaderItem[],
    chapterVerseOrderCounter: number,
    headerOrderCounter: number,
    bookNumber: number,
    bookResult: BookResult
  ): Promise<{
    newVerse: boolean;
    verseUsfm: string;
    verseLabel: string;
    chapterVerseOrderCounter: number;
    headerOrderCounter: number;
  }> {
    const verseUsfm = await ccsp.evaluate((el: any) =>
      el.getAttribute("data-usfm")
    );

    if (!verseUsfm) {
      return {
        newVerse: false,
        verseUsfm: lastVerseUsfm,
        verseLabel: lastVerseLabel,
        chapterVerseOrderCounter,
        headerOrderCounter,
      };
    }

    // Extract the current verse label to check if it's different
    let currentLabel = "";
    const labelCheckSpans = await ccsp.$$(`:scope > span`);
    for (let k = 0; k < labelCheckSpans.length; k++) {
      const ccspsp = labelCheckSpans[k];
      const childVersesType = BibleScraperUtils.cleanChapterContentClass(
        await (await ccspsp.getProperty("className")).jsonValue()
      );

      if (childVersesType === "label") {
        const getLabelText = await ccspsp.evaluate((el: any) => el.textContent);
        if (getLabelText) {
          currentLabel = getLabelText;
          break; // Take the first label found
        }
      }
    }

    // Determine if we need to create a new verse entry
    let shouldCreateNewVerse = false;

    if (lastVerseUsfm === "") {
      // First verse
      lastVerseUsfm = verseUsfm;
      lastVerseLabel = currentLabel;
      headerOrderCounter += 1;
    } else if (verseUsfm !== lastVerseUsfm) {
      // Different USFM, definitely a new verse
      shouldCreateNewVerse = true;
    } else if (
      verseUsfm === lastVerseUsfm &&
      currentLabel !== "" &&
      currentLabel !== lastVerseLabel
    ) {
      // Same USFM but different label (e.g., "4a" vs "4b"), create new verse with incremented order
      shouldCreateNewVerse = true;
      Logger.debug(
        `Detected same USFM (${verseUsfm}) but different label: "${lastVerseLabel}" -> "${currentLabel}". Creating new verse.`,
        "BibleScraper"
      );
    }

    if (shouldCreateNewVerse) {
      chapterVerseOrderCounter += 1;
      headerOrderCounter += 1;

      resultVerse.b = bookNumber;
      resultVerse.o = chapterVerseOrderCounter;
      resultVerse.id = BibleScraperUtils.getVerseId(
        bookNumber,
        resultVerse.c,
        chapterVerseOrderCounter
      );

      // Clean text
      resultVerse.t = BibleScraperUtils.cleanText(resultVerse.t);

      // Add header
      const headersExist = saveHeaders.find(
        (el) => el.target_order === chapterVerseOrderCounter
      );
      if (headersExist) {
        resultVerse.h = headersExist.text.trim();
        saveHeaders.splice(saveHeaders.indexOf(headersExist), 1);
      }

      bookResult.verses.push(structuredClone(resultVerse));

      // Reset
      resultVerse.h = "";
      resultVerse.t = "";
      lastVerseUsfm = verseUsfm;
      lastVerseLabel = currentLabel;
    }

    const vusplit = verseUsfm.replaceAll("+", ".").split(".");
    resultVerse.c = BibleScraperUtils.getNumberFromChapter(vusplit[1]);
    resultVerse.v = Number(vusplit[2]);

    // Process verse content
    const ccspSpans = await ccsp.$$(`:scope > span`);
    for (let k = 0; k < ccspSpans.length; k++) {
      const ccspsp = ccspSpans[k];
      const childVersesType = BibleScraperUtils.cleanChapterContentClass(
        await (await ccspsp.getProperty("className")).jsonValue()
      );

      if (childVersesType === "label") {
        const getLabelText = await ccspsp.evaluate((el: any) => el.textContent);
        if (getLabelText) {
          resultVerse.l = getLabelText;
        }
      } else if (childVersesType !== "note") {
        const getContentText = await ccspsp.evaluate(
          (el: any) => el.textContent
        );
        if (getContentText) {
          if (childVersesType === "nd") {
            resultVerse.t += getContentText.toUpperCase();
          } else if (childVersesType === "sc") {
            // Small caps - uppercase and don't add space, just append directly
            resultVerse.t += getContentText.toUpperCase();
          } else {
            resultVerse.t += " " + getContentText;
          }
        }
      }
    }

    return {
      newVerse: true,
      verseUsfm,
      verseLabel: currentLabel || lastVerseLabel,
      chapterVerseOrderCounter,
      headerOrderCounter,
    };
  }

  private finalizeVerse(
    resultVerse: Verse,
    saveHeaders: HeaderItem[],
    chapterVerseOrderCounter: number,
    bookNumber: number,
    currentChapter: number,
    bookResult: BookResult
  ): void {
    resultVerse.b = bookNumber;
    resultVerse.o = chapterVerseOrderCounter;
    resultVerse.id = BibleScraperUtils.getVerseId(
      bookNumber,
      resultVerse.c,
      chapterVerseOrderCounter
    );

    if (currentChapter in bookResult.cv_v_key) {
      bookResult.cv_v_key[currentChapter] += chapterVerseOrderCounter;
    } else {
      bookResult.cv_v_key[currentChapter] = chapterVerseOrderCounter;
    }

    // Clean text
    resultVerse.t = BibleScraperUtils.cleanText(resultVerse.t);

    // Add header
    const headersExist = saveHeaders.find(
      (el) =>
        el.target_order === chapterVerseOrderCounter ||
        el.target_order === chapterVerseOrderCounter + 1
    );

    if (headersExist) {
      resultVerse.h = headersExist.text.trim();
      saveHeaders.splice(saveHeaders.indexOf(headersExist), 1);
    }

    bookResult.verses.push(structuredClone(resultVerse));

    // Reset
    resultVerse.h = "";
    resultVerse.t = "";
  }

  private async navigateToNextChapter(
    tabPage: Page,
    bookUsfm: string,
    bookNumber: number,
    currentChapter: number,
    bookResult: BookResult
  ): Promise<boolean> {
    try {
      const nextChapterAnchor = await tabPage.$eval(
        `main > div:nth-child(1) > div:nth-last-child(1) > div:nth-last-child(1) > a`,
        (anchor) => anchor.getAttribute("href")
      );

      if (nextChapterAnchor) {
        await tabPage.goto(`https://www.bible.com/${nextChapterAnchor}`, {
          waitUntil: "networkidle2",
        });
        await BibleScraperUtils.waitTillHTMLRendered(tabPage);

        // Check if we've moved to a different book
        const newPageUrl = await tabPage.url();
        const newSegments = new URL(newPageUrl).pathname.split("/");
        const newLastPartOfUrl = newSegments.pop() || newSegments.pop();

        if (newLastPartOfUrl) {
          const newUrlBook = newLastPartOfUrl.split(".")[0];

          if (newUrlBook !== bookUsfm) {
            Logger.info(
              `Book transition detected: ${bookUsfm} → ${newUrlBook}, finalizing book`,
              `Tab-${bookNumber}`
            );
            this.finalizeBooksResults(currentChapter, bookResult);
            return false;
          }
        }
        return true;
      }
    } catch (err) {
      Logger.debug(
        "No more chapters found, book completed",
        `Tab-${bookNumber}`
      );
      this.finalizeBooksResults(currentChapter, bookResult);
      return false;
    }

    return false;
  }

  private finalizeBooksResults(
    currentChapter: number,
    bookResult: BookResult
  ): void {
    const cvV: number[] = [];
    for (const key in bookResult.cv_v_key) {
      cvV.push(bookResult.cv_v_key[key]);
    }
    bookResult.cv_count = {
      c: currentChapter,
      v: cvV,
    };
  }

  async scrapeAllBooks(): Promise<void> {
    Logger.info(
      `Starting scrape process for Bible version: ${this.versionToGet}`,
      "BibleScraper"
    );

    // Initialize browser with resource management
    const browser = await this.resourceManager.initializeBrowser(this.config);

    try {
      const allPages = await browser.pages();
      const page = allPages[0];

      // Configure page settings
      await page.setDefaultTimeout(this.config.pageTimeout);
      await page.setDefaultNavigationTimeout(this.config.navigationTimeout);

      Logger.info(
        `Navigating to Bible.com page: ${this.baseUrl}`,
        "BibleScraper"
      );
      await page.goto(this.baseUrl, { waitUntil: "networkidle2" });
      await BibleScraperUtils.waitTillHTMLRendered(page);

      // Close cookies banner
      await this.closeCookiesBanner(page);

      // Get Bible details
      const bibleDetail = await this.getBibleDetails(page);
      await BibleScraperUtils.waitTillHTMLRendered(page);

      // Add _id for PouchDB format
      if (this.pouchdbFormat && bibleDetail.abbreviation) {
        bibleDetail._id = bibleDetail.abbreviation;
        Logger.debug(
          `Added _id to bibleDetail: ${bibleDetail._id}`,
          "BibleScraper"
        );
      }

      // Get book list
      const bookListResult = await this.getBookList(page);
      bibleDetail.books_usfm = bookListResult.bookCodes;
      bibleDetail.books = bookListResult.bookNames;

      // Create a map of book codes to chapter counts for easy lookup
      const chapterCountMap = new Map<string, number>();
      bookListResult.bookCodes.forEach((code, index) => {
        chapterCountMap.set(code, bookListResult.chapterCounts[index]);
      });

      // Close and recreate the first tab to clear memory after getting book list
      Logger.debug(
        "Closing first tab after book list extraction to free memory",
        "BibleScraper"
      );
      await page.close();
      const newPage = await browser.newPage();
      await newPage.setDefaultTimeout(this.config.pageTimeout);
      await newPage.setDefaultNavigationTimeout(this.config.navigationTimeout);
      Logger.debug("First tab recreated successfully", "BibleScraper");

      // Filter books if specific books are requested
      let booksToProcess = bookListResult.bookCodes;
      if (this.specificBooks && this.specificBooks.length > 0) {
        booksToProcess = bookListResult.bookCodes.filter((book) =>
          this.specificBooks!.includes(book.toUpperCase())
        );

        // Validate that all requested books exist
        const missingBooks = this.specificBooks.filter(
          (book) =>
            !bookListResult.bookCodes
              .map((b) => b.toUpperCase())
              .includes(book.toUpperCase())
        );

        if (missingBooks.length > 0) {
          Logger.warn(
            `Some requested books were not found in this Bible version: ${missingBooks.join(
              ", "
            )}`,
            "BibleScraper"
          );
          Logger.info(
            `Available books in this version: ${bookListResult.bookCodes.join(
              ", "
            )}`,
            "BibleScraper"
          );
        }

        if (booksToProcess.length === 0) {
          Logger.error(
            "None of the requested books were found in this Bible version.",
            "BibleScraper"
          );
          return;
        }

        Logger.info(
          `Processing only specified books: ${booksToProcess.join(", ")}`,
          "BibleScraper"
        );
      }

      Logger.info(
        `Total books to process: ${booksToProcess.length}`,
        "BibleScraper"
      );

      // Initialize metrics tracking
      const metrics = this.initializeMetrics(booksToProcess.length);

      // Create managed tab pool
      const tabCount = Math.min(
        this.config.maxConcurrentTabs,
        booksToProcess.length
      );
      const tabPool = await this.resourceManager.createTabPool(
        tabCount,
        this.config
      );

      // Process books in parallel chunks
      const processResults: {
        bookNumber: number;
        bookUsfm: string;
        result: BookResult;
      }[] = [];

      // Queue-based processing: each tab picks up the next book as soon as it's done
      let bookIndex = 0;
      let completedCount = 0;

      // Create worker function for each tab
      const processNextBook = async (
        tabPage: Page,
        tabId: number
      ): Promise<void> => {
        while (bookIndex < booksToProcess.length) {
          // Get the next book to process
          const currentBookIndex = bookIndex++;
          if (currentBookIndex >= booksToProcess.length) break;

          const bookUsfm = booksToProcess[currentBookIndex];
          const bookNumber = currentBookIndex + 1;
          const expectedChapterCount = chapterCountMap.get(bookUsfm);

          Logger.debug(
            `Tab ${tabId} starting book ${bookNumber}/${
              booksToProcess.length
            }: ${bookUsfm}${
              expectedChapterCount ? ` (${expectedChapterCount} chapters)` : ""
            }`,
            "BibleScraper"
          );

          // Start metrics tracking for this book
          if (metrics) metrics.startBook(bookUsfm);

          try {
            const result = await this.processBookWithRetry(
              bookUsfm,
              bookNumber,
              tabPage,
              expectedChapterCount
            );

            // Save individual book result immediately
            await this.saveIndividualBookResult(bookNumber, bookUsfm, result);

            // Close and recreate the tab after successful book processing to prevent memory leaks
            tabPage = await this.resourceManager.clearTab(
              tabPage,
              bookNumber,
              this.config
            );

            // Complete metrics tracking
            if (metrics) metrics.completeBook(bookUsfm, result.verses.length);

            // Store result
            processResults.push({ bookNumber, bookUsfm, result });
            completedCount++;

            Logger.info(
              `Tab ${tabId} completed book ${bookNumber}/${booksToProcess.length}: ${bookUsfm} (${completedCount}/${booksToProcess.length} total)`,
              "BibleScraper"
            );
          } catch (error) {
            // Close and recreate the tab even if processing failed to reset state
            tabPage = await this.resourceManager.clearTab(
              tabPage,
              bookNumber,
              this.config
            );

            if (metrics)
              metrics.recordError(
                `Processing book ${bookUsfm}`,
                error as Error
              );

            Logger.error(
              `Tab ${tabId} failed to process book ${bookNumber}: ${bookUsfm}`,
              "BibleScraper",
              error as Error
            );
            // Continue to next book even after error
          }
        }

        Logger.info(`Tab ${tabId} finished all assigned work`, "BibleScraper");
      };

      // Start all workers in parallel
      const workerPromises = tabPool.map((tabPage, index) =>
        processNextBook(tabPage, index + 1)
      );

      // Wait for all workers to complete
      await Promise.all(workerPromises);

      // Sort results by book number
      processResults.sort((a, b) => a.bookNumber - b.bookNumber);

      // Combine all results
      await this.saveResults(processResults, bibleDetail);

      // Show final metrics summary
      if (metrics) {
        Logger.info(metrics.getSummary(), "BibleScraper");
      }
    } catch (err) {
      Logger.error(
        "Browser error occurred during scraping",
        "BibleScraper",
        err as Error
      );
    } finally {
      Logger.info("Scraping completed, closing resources", "BibleScraper");
      await this.resourceManager.cleanup();
    }
  }

  private async saveIndividualBookResult(
    bookNumber: number,
    bookUsfm: string,
    result: BookResult
  ): Promise<void> {
    const bookFilePath = `${this.config.outputDirectory}/${this.versionToGet}/${bookNumber}_${bookUsfm}.json`;

    let outputData: any;

    if (this.pouchdbFormat) {
      // PouchDB format: {"_id": "VERSION.BOOKUSFM", "verses": [...]}
      // Convert verse IDs from string to number
      const versesWithNumberIds = result.verses.map((verse) => ({
        ...verse,
        id: parseInt(verse.id, 10),
      }));

      outputData = {
        _id: `${this.convertUnicodeAbbreviation(
          this.versionToGet
        )}.${bookUsfm}`,
        verses: versesWithNumberIds,
      };

      Logger.debug(
        `Writing book in PouchDB format with _id: ${outputData._id}`,
        "BibleScraper"
      );
    } else {
      // Default format: just the verses array
      outputData = result.verses;
    }

    Logger.debug(`Writing book verses to ${bookFilePath}`, "BibleScraper");
    await this.fileSystem.writeFile(
      bookFilePath,
      JSON.stringify(outputData, null, 2)
    );

    Logger.info(
      `Book ${bookUsfm} (${result.verses.length} verses) saved to ${bookFilePath}`,
      "BibleScraper"
    );
  }

  private async saveResults(
    results: { bookNumber: number; bookUsfm: string; result: BookResult }[],
    bibleDetail: BibleDetail
  ): Promise<void> {
    let finalResult: Verse[] = [];
    let cvCount: { [key: number]: ChapterVerseCount } = {};

    Logger.info(`Saving results for ${results.length} books`, "BibleScraper");

    for (const { bookNumber, bookUsfm, result } of results) {
      // Individual book files are already written by saveIndividualBookResult during parallel processing
      // No need to overwrite them here

      // Add to final result
      finalResult.push(...result.verses);
      cvCount[bookNumber] = result.cv_count;

      // Clear from memory after processing to reduce memory usage
      result.verses = [];
    }

    // Write final results
    Logger.info(
      `Writing Bible details to ${this.outputDetailFile}`,
      "BibleScraper"
    );
    bibleDetail.cv_count = cvCount;
    await this.fileSystem.writeFile(
      this.outputDetailFile,
      JSON.stringify(bibleDetail, null, 2)
    );

    Logger.info(
      `Writing consolidated verses to ${this.outputVersesFile}`,
      "BibleScraper"
    );
    await this.fileSystem.writeFile(
      this.outputVersesFile,
      JSON.stringify(finalResult)
    );

    Logger.success(`Scrape process completed successfully!`, "BibleScraper");
    Logger.success(
      `Total verses scraped: ${finalResult.length}`,
      "BibleScraper"
    );
  }

  /**
   * Process a book with retry mechanism
   */
  private async processBookWithRetry(
    bookUsfm: string,
    bookNumber: number,
    tabPage: Page,
    expectedChapterCount?: number
  ): Promise<BookResult> {
    return await BibleScraperUtils.retryOperation(
      () =>
        this.processBook(bookUsfm, bookNumber, tabPage, expectedChapterCount),
      this.config.retryAttempts,
      this.config.delayBetweenOperations,
      `Processing book ${bookUsfm}`
    );
  }

  /**
   * Extract verse data with improved error handling
   */
  async extractVerseData(element: any): Promise<Partial<Verse>> {
    try {
      // Extract verse processing logic for easier testing
      const verseUsfm = await element.evaluate((el: any) =>
        el.getAttribute("data-usfm")
      );
      const textContent = await element.evaluate((el: any) => el.textContent);

      return {
        t: textContent || "",
        // Add other verse data extraction here
      };
    } catch (error) {
      Logger.warn("Failed to extract verse data from element", "BibleScraper");
      return { t: "" };
    }
  }
}

// Configuration loading
async function loadConfiguration(
  configPath?: string
): Promise<Partial<ScraperConfig>> {
  if (!configPath) return {};

  try {
    const configFile = await Bun.file(configPath).text();
    return JSON.parse(configFile);
  } catch (error) {
    Logger.warn(`Failed to load configuration file: ${configPath}`, "Main");
    return {};
  }
}

// Main execution
async function main() {
  try {
    // Parse CLI arguments
    const args = parseCliArguments();

    if (!args.version) {
      Logger.error(
        "Bible version is required. Use --help for usage information.",
        "Main"
      );
      process.exit(1);
    }

    // Load configuration
    const fileConfig = await loadConfiguration(args.config);
    const cliConfig: Partial<ScraperConfig> = {};

    // Override with CLI arguments
    if (args.parallel) cliConfig.maxConcurrentTabs = args.parallel;
    if (args.output) cliConfig.outputDirectory = args.output;
    if (args.headless !== undefined) cliConfig.headless = args.headless;

    const finalConfig = { ...DEFAULT_CONFIG, ...fileConfig, ...cliConfig };

    // Set logging level
    const isDevelopment = process.env.NODE_ENV === "development" || args.debug;
    Logger.setLevel(isDevelopment ? LogLevel.DEBUG : LogLevel.INFO);

    Logger.info(
      `Initializing Bible scraper for version: ${args.version}`,
      "Main"
    );
    Logger.debug(
      `Configuration: ${JSON.stringify(finalConfig, null, 2)}`,
      "Main"
    );

    // Create and run scraper
    const scraper = new BibleScraper(
      args.version,
      finalConfig,
      args.books,
      args.pouchdb || false
    );
    await scraper.initializeOutputDirectory();
    await scraper.scrapeAllBooks();

    Logger.success("Bible scraping completed successfully!", "Main");
  } catch (error) {
    Logger.error("Fatal error during scraping process", "Main", error as Error);
    process.exit(1);
  }
} // Run the scraper
main();
