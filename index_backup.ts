import puppeteer, { Page } from "puppeteer";
import { mkdir } from "node:fs/promises";

(async function main() {
  // contains supported BIBLE_VERSION_ID taken from Bible.com URL.
  const BIBLE_VERSION_IDS: { [key: string]: number } = {
    // indonesian
    TB: 306, // Alkitab Terjemahan Baru ✔️✔️
    TSI: 320, // Terjemahan Sederhana Indonesia ✔️
    FAYH: 2727, // Firman Allah Yang Hidup ✔️
    BIMK: 27, // Bahasa Indonesia Masa Kini ✔️
    AMD: 199, // Alkitab Mudah Dibaca
    PBTB2: 2863, // Perjanjian Baru Terjemahan Baru 2

    // english
    KJV: 1, // ✔️✔️ fixed blank page on the end (ex. PSA.84.KJV) => not inserted
    NKJV: 114, // New King James Version ✔️✔️
    MSG: 97, // The Message ✔️
    NET: 107, // New English Translation
    NIV: 111, // New International Version ✔️
    NLT: 116, // New Living Translation ✔️
    AMP: 1588, // Amplified Bible ✔️✔️
    NASB1995: 100, // New American Standard Bible, 1995 ✔️
    GNT: 68, // Good News Translation, for checking JOB.3.GNT
    ESV: 59, // English Standard Version 2016

    // deutsch
    HFA: 73, // Hoffnung Fur Alle ✔️

    // chinese
    RCUV: 139, // Revised Chinese Union Version ✔️✔️
    RCUVSS: 140, // Revised Chinese Union Version, Simplified ✔️
    "CUNP-神": 46, // Chinese Union Version with New Punctuation, Shén version ✔️
    "CUNPSS-神": 48, // Chinese Union Version with New Punctuation, Shén version, Simplified
    "CUNP-上帝": 414, // Chinese Union Version with New Punctuation, Shàngdì version
    "CUNPSS-上帝": 57, // Chinese Union Version with New Punctuation, Shàngdì version, Simplified

    // france
    PDV2017: 133, // Parole de Vie 2017 ✔️

    // nederlands
    HTB: 75, // Het Boek ✔️
  };

  const VERSION_TO_GET = "ESV";
  const OUTPUT_FILE_DETAIL = `output/${VERSION_TO_GET}_detail.json`;
  const OUTPUT_FILE_VERSES = `output/${VERSION_TO_GET}_verses.json`;

  // prepare directory for output
  await mkdir(`output/${VERSION_TO_GET}`, { recursive: true });

  const BASE_SCRAPE_URL = `https://www.bible.com/bible/${
    BIBLE_VERSION_IDS[`${VERSION_TO_GET}`]
  }/REV.1.${VERSION_TO_GET}`;

  /**
   * Wait until all elements, including javascript are loaded on a Puppeteer page.
   */
  const waitTillHTMLRendered = async (page: Page, timeout = 30000) => {
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
  };

  /**
   *  Clean and trim Bible.com ChapterContent css classes, return the class identifier only.
   */
  function cleanChapCon(chapterContentClass: string) {
    let result = "";
    const input = chapterContentClass.toLowerCase();
    const regexChapterContent =
      /(chaptercontent_)(\w+)(__[a-z0-9]+)(\s)?(.+)?/i;
    const regRes = input.match(regexChapterContent);

    if (regRes != null) {
      if (regRes[2] != null) {
        result = regRes[2];
      }
    }
    return result;
  }

  /**
   * function to get VerseId.
   */
  function getVerseId(book: number, chapter: number, order: number) {
    return `${book}${String(chapter).padStart(3, "0")}${String(order).padStart(
      3,
      "0"
    )}`;
  }

  function isHeadingTopContainer(input: string) {
    let result = false;
    if (/mt(\d+)?/i.test(input)) {
      result = true;
    } else if (/mte(\d+)?/i.test(input)) {
      result = true;
    } else if (/ms(\d+)?/i.test(input)) {
      result = true;
    } else if (/mr/i.test(input)) {
      result = true;
    } else if (/s(\d+)?/i.test(input)) {
      result = true;
    } else if (/sr/i.test(input)) {
      result = true;
    } else if (/r/i.test(input)) {
      result = true;
    } else if (/d/i.test(input)) {
      result = true;
    } else if (/sp/i.test(input)) {
      result = true;
    } else if (/sd(\d+)?/i.test(input)) {
      result = true;
    }
    return result;
  }

  function getNumberFromChapter(input: string) {
    let result: number = 0;
    const regex_extra_chapter = /(\d+)_(\d+)/;
    if (regex_extra_chapter.test(input)) {
      const extra_chapter_result = regex_extra_chapter.exec(input);
      if (extra_chapter_result) {
        result = Number(extra_chapter_result[1]);
      }
    } else {
      result = Number(input);
    }
    return result;
  }

  interface ChapterVerseCount {
    c: number;
    v: number[];
  }

  console.log(`starting scrape process for Book ${VERSION_TO_GET}..`);

  const browser = await puppeteer.launch({ headless: false });

  try {
    const allPages = await browser.pages();
    const page = allPages[0];

    console.log(`  opening page ${BASE_SCRAPE_URL}`);
    await page.goto(BASE_SCRAPE_URL, { waitUntil: "networkidle2" });
    await waitTillHTMLRendered(page);

    // CLOSE COOKIES
    console.log(`    closing cookies button..`);
    const cookies_btn = await page.waitForSelector(
      "button[data-testid='close-cookie-banner']"
    );
    if (cookies_btn) {
      cookies_btn.click();
    }

    // GET BIBLE DETAIL
    console.log(`    getting bible details..`);
    console.log(`      getting bible language info..`);
    const bib_info_arr = await page.$$eval(
      "main div.max-w-full.w-full a h2",
      (el) => {
        return el.map((op) => op.textContent);
      }
    );

    let result_detail: {
      name: string;
      abbreviation: string;
      language: string;
      books: any[];
      books_usfm: any[];
      cv_count: { [key: number]: ChapterVerseCount };
    } = {
      name: "",
      abbreviation: "",
      language: "",
      books: new Array(),
      books_usfm: new Array(),
      cv_count: {},
    };

    // Parse bible info from the page
    if (bib_info_arr != null) {
      if (bib_info_arr.length == 7) {
        if (bib_info_arr[4] != null) {
          result_detail.language = bib_info_arr[4].toLowerCase();
          console.log(`        BIBLE LANG: ${result_detail.language}`);
        }
        if (bib_info_arr[5] != null) {
          let filteredversion = bib_info_arr[5]
            .replace("Version: ", "")
            .split("-");
          result_detail.name = filteredversion[0].trim();
          result_detail.abbreviation = filteredversion[1]
            .trim()
            .replaceAll(" ", "")
            .replace("神", "SHEN")
            .replace("上帝", "SHANGDI")
            .toUpperCase();
          console.log(`        BIBLE NAME: ${result_detail.name}`);
          console.log(`        BIBLE ABBV: ${result_detail.abbreviation}`);
        }
      } else if (bib_info_arr.length == 6) {
        if (bib_info_arr[3] != null) {
          result_detail.language = bib_info_arr[3].toLowerCase();
          console.log(`        BIBLE LANG: ${result_detail.language}`);
        }
        if (bib_info_arr[4] != null) {
          let filteredversion = bib_info_arr[4]
            .replace("Version: ", "")
            .split("-");
          result_detail.name = filteredversion[0].trim();
          result_detail.abbreviation = filteredversion[1]
            .trim()
            .replaceAll(" ", "")
            .replace("神", "SHEN")
            .replace("上帝", "SHANGDI")
            .toUpperCase();
          console.log(`        BIBLE NAME: ${result_detail.name}`);
          console.log(`        BIBLE ABBV: ${result_detail.abbreviation}`);
        }
      } else if (bib_info_arr.length == 5) {
        if (bib_info_arr[2] != null) {
          result_detail.language = bib_info_arr[2].toLowerCase();
          console.log(`        BIBLE LANG: ${result_detail.language}`);
        }
        if (bib_info_arr[3] != null) {
          let filteredversion = bib_info_arr[3]
            .replace("Version: ", "")
            .split("-");
          result_detail.name = filteredversion[0].trim();
          result_detail.abbreviation = filteredversion[1].trim().toUpperCase();
          console.log(`        BIBLE NAME: ${result_detail.name}`);
          console.log(`        BIBLE ABBV: ${result_detail.abbreviation}`);
        }
      }
    }

    await waitTillHTMLRendered(page);

    console.log("      waiting select books button..");
    const selectBooksButton = await page.waitForSelector(
      "button[id*='headlessui-popover-button-:r0']"
    );

    let generatedBookList: string[] = [];

    if (selectBooksButton != null) {
      console.log("        clicking select books button..");
      await selectBooksButton.click();

      const listOfBooksUl = await page.waitForSelector(
        `div[id^="headlessui-popover-panel-"] > div[class*="overflow-y-auto"] > ul`
      );
      if (listOfBooksUl != null) {
        const books_array = await page.$$eval(
          `div[id^="headlessui-popover-panel-"] > div[class*="overflow-y-auto"] > ul li`,
          (el) => {
            return el.map((op) => `${op.textContent}`);
          }
        );
        result_detail.books = books_array;
        console.log(`      number of books: ${books_array.length}`);

        const books_buttons = await page.$$(
          `div[id^="headlessui-popover-panel-"] > div[class*="overflow-y-auto"] > ul button`
        );

        for (let i = 0; i < books_buttons.length; i++) {
          // select again because the node is detached after every click (interactive menu using JS)
          const allButtons = await page.$$(
            `div[id^="headlessui-popover-panel-"] > div[class*="overflow-y-auto"] > ul button`
          );

          await allButtons[i].click();
          await new Promise((r) => setTimeout(r, 100)); // Small delay to prevent overwhelming the page

          const allChapters = await page.$$(
            `div[id^="headlessui-popover-panel-"] > div[class*="overflow-y-auto"] > ul li`
          );

          const firstChapter = await allChapters[0].$("a");
          if (firstChapter) {
            const hrefText = await firstChapter.evaluate((el) =>
              el.getAttribute("href")
            );
            console.log(`First chapter href: ${hrefText}`);

            // Extract book code from href like "/bible/59/GEN.1.ESV" -> "GEN"
            if (hrefText) {
              const segments = hrefText.split("/");
              const lastPart = segments[segments.length - 1]; // "GEN.1.ESV"
              const bookCode = lastPart.split(".")[0]; // "GEN"

              console.log("extracted book code: ", bookCode);
              generatedBookList.push(bookCode);
            }
          }

          const chapterBackButton = await page.$(
            'div[id^="headlessui-popover-panel-"] > div > div > button'
          );
          if (chapterBackButton) {
            console.log("clicking back button on chapter select..");
            await chapterBackButton.click();
            await new Promise((r) => setTimeout(r, 150)); // Small delay to prevent overwhelming the page
          }
        }

        console.log("generated book usfm list:");
        console.log(generatedBookList);

        // console.log(`total generated book list: ${generatedBookList.length}`);
      }
    }

    // TODO: instead of using predefined book list, we should get the list using loop,
    // by clicking the menu > book > chapter 1 > a href == "/bible/59/GEN.1.ESV" --> we should get the "GEN" part
    // Use predefined book list to avoid DOM manipulation issues
    // console.log("  Using predefined book list...");
    // const bookList: string[] = [
    //   "GEN",
    //   "EXO",
    //   "LEV",
    //   "NUM",
    //   "DEU",
    //   "JOS",
    //   "JDG",
    //   "RUT",
    //   "1SA",
    //   "2SA",
    //   "1KI",
    //   "2KI",
    //   "1CH",
    //   "2CH",
    //   "EZR",
    //   "NEH",
    //   "EST",
    //   "JOB",
    //   "PSA",
    //   "PRO",
    //   "ECC",
    //   "SNG",
    //   "ISA",
    //   "JER",
    //   "LAM",
    //   "EZK",
    //   "DAN",
    //   "HOS",
    //   "JOL",
    //   "AMO",
    //   "OBA",
    //   "JON",
    //   "MIC",
    //   "NAM",
    //   "HAB",
    //   "ZEP",
    //   "HAG",
    //   "ZEC",
    //   "MAL",
    //   "MAT",
    //   "MRK",
    //   "LUK",
    //   "JHN",
    //   "ACT",
    //   "ROM",
    //   "1CO",
    //   "2CO",
    //   "GAL",
    //   "EPH",
    //   "PHP",
    //   "COL",
    //   "1TH",
    //   "2TH",
    //   "1TI",
    //   "2TI",
    //   "TIT",
    //   "PHM",
    //   "HEB",
    //   "JAS",
    //   "1PE",
    //   "2PE",
    //   "1JN",
    //   "2JN",
    //   "3JN",
    //   "JUD",
    //   "REV",
    // ];

    console.log(`  Total books to process: ${generatedBookList.length}`);
    result_detail.books_usfm = generatedBookList;

    // Create tab pool with limit of 4
    const MAX_CONCURRENT_TABS = 4;
    const tabPool: Page[] = [];

    // Create initial tabs
    for (
      let i = 0;
      i < Math.min(MAX_CONCURRENT_TABS, generatedBookList.length);
      i++
    ) {
      const newTab = await browser.newPage();
      tabPool.push(newTab);
    }

    // Process books in parallel with semaphore
    const processBook = async (
      bookUsfm: string,
      bookNumber: number,
      tabPage: Page
    ) => {
      console.log(`  [Tab ${bookNumber}] Starting book: ${bookUsfm}`);

      const bookResult = {
        verses: new Array(),
        cv_count: {} as ChapterVerseCount,
        cv_v_key: {} as { [key: number]: number },
      };

      // Navigate to first chapter of the book
      const bookUrl = `https://www.bible.com/bible/${BIBLE_VERSION_IDS[VERSION_TO_GET]}/${bookUsfm}.1.${VERSION_TO_GET}`;
      await tabPage.goto(bookUrl, { waitUntil: "networkidle2" });
      await waitTillHTMLRendered(tabPage);

      let current_chapter = 0;
      let current_chapter_string = "0";
      let nextChapterButtonFound = true;

      // Process all chapters in this book
      while (nextChapterButtonFound) {
        const current_page_url = await tabPage.url();
        console.log(`    [Book ${bookNumber}] Scraping: ${current_page_url}`);

        const segments = new URL(current_page_url).pathname.split("/");
        const last_part_of_url = segments.pop() || segments.pop();
        let skip = false;

        if (last_part_of_url) {
          const middle_part = last_part_of_url.split(".")[1];
          if (middle_part.length >= 5 && middle_part.slice(0, 5) == "INTRO") {
            skip = true;
            console.log(
              `    [Book ${bookNumber}] INTRO detected, skipping parse..`
            );
          } else {
            current_chapter = getNumberFromChapter(middle_part);
            current_chapter_string = middle_part;
            console.log(
              `    [Book ${bookNumber}] Chapter: ${current_chapter} (${current_chapter_string})`
            );
          }

          // Check for page errors
          try {
            const not_available = await tabPage.waitForSelector(
              `span[class*='ChapterContent_not-avaliable']`,
              { timeout: 500 }
            );

            if (not_available) {
              console.log(
                `    [Book ${bookNumber}] Content not available, skipping..`
              );
              skip = true;
            }
          } catch (err: any) {
            // pass
          }
        }

        if (skip == false) {
          const chapterContainer = await tabPage.waitForSelector(
            `div[data-usfm*='${bookUsfm}.${current_chapter_string}']`,
            { timeout: 5000 }
          );

          if (chapterContainer) {
            // Process chapter content (same scraping logic as original)
            const chapterChildrens = await chapterContainer.$$(
              `:is(:scope > div, :scope > table)`
            );
            let last_verse_usfm = "";
            let resultVerse = {
              id: "",
              b: bookNumber,
              c: 0,
              v: 0,
              t: "",
              h: "",
              o: 0,
              l: "",
            };

            let saveHeaders: { target_order: number; text: string }[] =
              new Array();
            let chapterVerseOrderCounter = 0;
            let headerOrderCounter = 0;

            // Process each chapter element
            for (let i = 0; i < chapterChildrens.length; i++) {
              const cc = chapterChildrens[i];
              const topParentClassType = cleanChapCon(
                await (await cc.getProperty("className")).jsonValue()
              );

              if (isHeadingTopContainer(topParentClassType)) {
                if (saveHeaders.length) {
                  if (saveHeaders[0].text != "") {
                    saveHeaders[0].text += "\n";
                  }
                }
              }

              let cc_spans = await cc.$$(`:scope > span`);
              if (topParentClassType == "table") {
                cc_spans = await cc.$$(`:scope td.cell > span`);
              }

              for (let j = 0; j < cc_spans.length; j++) {
                const ccsp = cc_spans[j];
                const parentVersesType = cleanChapCon(
                  await (await ccsp.getProperty("className")).jsonValue()
                );

                if (parentVersesType == "heading" || parentVersesType == "nd") {
                  const getHeadingText = await ccsp.evaluate(
                    (el) => el.textContent
                  );
                  if (getHeadingText != null) {
                    let target_order: number = headerOrderCounter + 1;
                    const headers_exist = saveHeaders.find(
                      (el) => el.target_order == target_order
                    );

                    if (parentVersesType == "nd") {
                      if (headers_exist != undefined) {
                        headers_exist.text += getHeadingText.toUpperCase();
                      } else {
                        saveHeaders.push({
                          target_order: target_order,
                          text: getHeadingText.toUpperCase(),
                        });
                      }
                    } else {
                      if (headers_exist != undefined) {
                        headers_exist.text += getHeadingText;
                      } else {
                        saveHeaders.push({
                          target_order: target_order,
                          text: getHeadingText,
                        });
                      }
                    }
                  }
                } else if (parentVersesType == "verse") {
                  const verse_usfm = await ccsp.evaluate((el) =>
                    el.getAttribute("data-usfm")
                  );

                  if (verse_usfm != null) {
                    if (last_verse_usfm === "") {
                      last_verse_usfm = verse_usfm;
                      headerOrderCounter += 1;
                    } else {
                      if (verse_usfm != last_verse_usfm) {
                        chapterVerseOrderCounter += 1;
                        headerOrderCounter += 1;

                        resultVerse.b = bookNumber;
                        resultVerse.o = chapterVerseOrderCounter;
                        resultVerse.id = getVerseId(
                          bookNumber,
                          resultVerse.c,
                          chapterVerseOrderCounter
                        );

                        // Clean text
                        resultVerse.t = resultVerse.t
                          .trim()
                          .split(/[\s]+/)
                          .join(" ");
                        resultVerse.t = resultVerse.t
                          .replaceAll(" .", ".")
                          .replaceAll(" ,", ",");

                        // Add header
                        const headers_exist = saveHeaders.find(
                          (el) => el.target_order == chapterVerseOrderCounter
                        );
                        if (headers_exist != undefined) {
                          resultVerse.h = headers_exist.text.trim();
                          saveHeaders = saveHeaders.filter(
                            (el) => el.target_order != chapterVerseOrderCounter
                          );
                        }

                        bookResult.verses.push(structuredClone(resultVerse));

                        // Reset
                        resultVerse.h = "";
                        resultVerse.t = "";
                        last_verse_usfm = verse_usfm;
                      }
                    }

                    const vusplit = verse_usfm.replaceAll("+", ".").split(".");
                    resultVerse.c = getNumberFromChapter(vusplit[1]);
                    resultVerse.v = Number(vusplit[2]);
                  }

                  const ccsp_spans = await ccsp.$$(`:scope > span`);
                  for (let k = 0; k < ccsp_spans.length; k++) {
                    const ccspsp = ccsp_spans[k];
                    const childVersesType = cleanChapCon(
                      await (await ccspsp.getProperty("className")).jsonValue()
                    );

                    if (childVersesType == "label") {
                      const getLabelText = await ccspsp.evaluate(
                        (el) => el.textContent
                      );
                      if (getLabelText != null) {
                        resultVerse.l = getLabelText;
                      }
                    } else {
                      const getContentText = await ccspsp.evaluate(
                        (el) => el.textContent
                      );
                      if (getContentText != null && getContentText != "") {
                        if (childVersesType == "nd") {
                          resultVerse.t += getContentText.toUpperCase();
                        } else if (childVersesType == "note") {
                          // pass
                        } else {
                          resultVerse.t += " " + getContentText;
                        }
                      }

                      // Handle last verse of chapter
                      if (
                        i == chapterChildrens.length - 1 &&
                        j == cc_spans.length - 1 &&
                        k == ccsp_spans.length - 1
                      ) {
                        chapterVerseOrderCounter += 1;
                        resultVerse.b = bookNumber;
                        resultVerse.o = chapterVerseOrderCounter;
                        resultVerse.id = getVerseId(
                          bookNumber,
                          resultVerse.c,
                          chapterVerseOrderCounter
                        );

                        if (current_chapter in bookResult.cv_v_key) {
                          bookResult.cv_v_key[current_chapter] +=
                            chapterVerseOrderCounter;
                        } else {
                          bookResult.cv_v_key[current_chapter] =
                            chapterVerseOrderCounter;
                        }

                        // Clean text
                        resultVerse.t = resultVerse.t
                          .trim()
                          .split(/[\s]+/)
                          .join(" ");
                        resultVerse.t = resultVerse.t
                          .replaceAll(" .", ".")
                          .replaceAll(" ,", ",");

                        // Add header
                        const headers_exist = saveHeaders.find(
                          (el) => el.target_order == chapterVerseOrderCounter
                        );
                        if (headers_exist != undefined) {
                          resultVerse.h = headers_exist.text.trim();
                          saveHeaders = saveHeaders.filter(
                            (el) => el.target_order != chapterVerseOrderCounter
                          );
                        } else {
                          const headers_exist_on_very_last = saveHeaders.find(
                            (el) =>
                              el.target_order == chapterVerseOrderCounter + 1
                          );
                          if (headers_exist_on_very_last != undefined) {
                            resultVerse.h =
                              headers_exist_on_very_last.text.trim();
                            saveHeaders = saveHeaders.filter(
                              (el) =>
                                el.target_order != chapterVerseOrderCounter + 1
                            );
                          }
                        }

                        bookResult.verses.push(structuredClone(resultVerse));

                        // Reset
                        resultVerse.h = "";
                        resultVerse.t = "";
                      }
                    }
                  }
                }
              }

              // Handle blank paragraph at end
              if (
                i == chapterChildrens.length - 1 &&
                topParentClassType == "b"
              ) {
                chapterVerseOrderCounter += 1;
                resultVerse.b = bookNumber;
                resultVerse.o = chapterVerseOrderCounter;
                resultVerse.id = getVerseId(
                  bookNumber,
                  resultVerse.c,
                  chapterVerseOrderCounter
                );

                if (current_chapter in bookResult.cv_v_key) {
                  bookResult.cv_v_key[current_chapter] +=
                    chapterVerseOrderCounter;
                } else {
                  bookResult.cv_v_key[current_chapter] =
                    chapterVerseOrderCounter;
                }

                // Clean text
                resultVerse.t = resultVerse.t.trim().split(/[\s]+/).join(" ");
                resultVerse.t = resultVerse.t
                  .replaceAll(" .", ".")
                  .replaceAll(" ,", ",");

                // Add header
                const headers_exist = saveHeaders.find(
                  (el) => el.target_order == chapterVerseOrderCounter
                );
                if (headers_exist != undefined) {
                  resultVerse.h = headers_exist.text.trim();
                  saveHeaders = saveHeaders.filter(
                    (el) => el.target_order != chapterVerseOrderCounter
                  );
                } else {
                  const headers_exist_on_very_last = saveHeaders.find(
                    (el) => el.target_order == chapterVerseOrderCounter + 1
                  );
                  if (headers_exist_on_very_last != undefined) {
                    resultVerse.h = headers_exist_on_very_last.text.trim();
                    saveHeaders = saveHeaders.filter(
                      (el) => el.target_order != chapterVerseOrderCounter + 1
                    );
                  }
                }

                bookResult.verses.push(structuredClone(resultVerse));

                // Reset
                resultVerse.h = "";
                resultVerse.t = "";
              }
            }

            // Wait before next page
            await new Promise((r) => setTimeout(r, 300));
          }
        } else {
          console.log(
            `!!! [Book ${bookNumber}] SKIPPED PAGE: ${bookUsfm}.${current_chapter}`
          );
          skip = false;
        }

        // Try to get next chapter
        try {
          const nextChapterAnchor = await tabPage.$eval(
            `main > div:nth-child(1) > div:nth-last-child(1) > div:nth-last-child(1) > a`,
            (anchor) => anchor.getAttribute("href")
          );

          if (nextChapterAnchor) {
            await tabPage.goto(`https://www.bible.com/${nextChapterAnchor}`, {
              waitUntil: "networkidle2",
            });
            await waitTillHTMLRendered(tabPage);

            // Check if we've moved to a different book
            const new_page_url = await tabPage.url();
            const new_segments = new URL(new_page_url).pathname.split("/");
            const new_last_part_of_url =
              new_segments.pop() || new_segments.pop();

            if (new_last_part_of_url) {
              const new_url_book = new_last_part_of_url.split(".")[0];

              // If book has changed, we've completed the current book
              if (new_url_book !== bookUsfm) {
                console.log(
                  `  [Book ${bookNumber}] Book changed from ${bookUsfm} to ${new_url_book} - marking as completed`
                );
                nextChapterButtonFound = false;

                // Final chapter verse count
                let cv_v: number[] = new Array();
                for (let key in bookResult.cv_v_key) {
                  cv_v.push(bookResult.cv_v_key[key]);
                }
                bookResult.cv_count = {
                  c: current_chapter,
                  v: cv_v,
                };
              }
            }
          }
        } catch (err: any) {
          console.log(
            `  [Book ${bookNumber}] ERROR: cannot found next chapter button.`
          );
          nextChapterButtonFound = false;

          // Final chapter verse count
          let cv_v: number[] = new Array();
          for (let key in bookResult.cv_v_key) {
            cv_v.push(bookResult.cv_v_key[key]);
          }
          bookResult.cv_count = {
            c: current_chapter,
            v: cv_v,
          };
        }
      }

      console.log(
        `  [Book ${bookNumber}] Completed: ${bookUsfm} with ${bookResult.verses.length} verses`
      );
      return bookResult;
    };

    // Process books with limited concurrency using Promise.all with chunking
    const results: { bookNumber: number; bookUsfm: string; result: any }[] = [];

    for (let i = 0; i < generatedBookList.length; i += MAX_CONCURRENT_TABS) {
      const chunk = generatedBookList.slice(i, i + MAX_CONCURRENT_TABS);
      const chunkPromises = chunk.map(async (bookUsfm, index) => {
        const bookNumber = i + index + 1;
        const tabIndex = index % tabPool.length;
        const result = await processBook(
          bookUsfm,
          bookNumber,
          tabPool[tabIndex]
        );
        return { bookNumber, bookUsfm, result };
      });

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);

      console.log(
        `Completed chunk ${Math.floor(i / MAX_CONCURRENT_TABS) + 1}/${Math.ceil(
          generatedBookList.length / MAX_CONCURRENT_TABS
        )}`
      );
    }

    // Sort results by book number to maintain order
    results.sort((a, b) => a.bookNumber - b.bookNumber);

    // Combine all results in order
    let finalResult = new Array();
    let cv_count: { [key: number]: ChapterVerseCount } = {};

    for (const { bookNumber, bookUsfm, result } of results) {
      // Write individual book files
      console.log(
        `  Writing book_verses to output/${VERSION_TO_GET}/${bookNumber}_${bookUsfm}.json`
      );
      await Bun.write(
        `output/${VERSION_TO_GET}/${bookNumber}_${bookUsfm}.json`,
        JSON.stringify(result.verses, null, 2)
      );

      // Add to final result
      finalResult.push(...result.verses);
      cv_count[bookNumber] = result.cv_count;
    }

    // Write final results
    console.log(`  Writing detail to ${OUTPUT_FILE_DETAIL}..`);
    result_detail.cv_count = cv_count;
    await Bun.write(OUTPUT_FILE_DETAIL, JSON.stringify(result_detail, null, 2));

    console.log(
      `  Writing [compacted] verses output to ${OUTPUT_FILE_VERSES}..`
    );
    await Bun.write(OUTPUT_FILE_VERSES, JSON.stringify(finalResult));

    console.log(`Scrape process completed successfully!`);
    console.log(`Total verses scraped: ${finalResult.length}`);
  } catch (err) {
    console.log("  browser error!");
    console.log(err);
  } finally {
    console.log("  task finished, closing browser..");
    await browser.close();
  }
})();
