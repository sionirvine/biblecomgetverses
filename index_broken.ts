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

  // old testament maybe not exist in some versions, for example like in FAYH
  // GOOD TESTING PAGES:
  //
  // headers:
  // - JOB.3.GNT -> there is 1 header text after title.
  // - GEN.10.NLT -> many headers on one page
  // - GEN.4.NLT -> 1 header title, many headers after, too.
  // - ZEC.4.HFA -> header after verse 14, but the following verse is 6.
  // - GEN.1.HFA -> 3 headers on the title.
  // - NEH.7.NIV -> very last verse ALSO contains header in the middle.
  //
  // ordering:
  // - ZEC.4.HFA -> verse 6 after verse 14
  //
  // special formatting:
  // - GEN.2.NIV -> LORD text is a special `nd` tag
  // - GEN.15.NLT -> header text contains special `nd` tag (LORD)
  // - NEH.7.8.NIV -> contains TABLES
  // - ESG.1_1.PDV2017 -> has non-standard chapter numbers, like "1_1" and "1_2" as chapter.
  //
  // notes:
  // - ACT.8.37.HFA -> is missing on the page, but ACT.8.36 contains notes about verse 37.
  // - GEN.6.BIMK -> there is notes on the very last verse
  //
  // wtf's, page error:
  // - GEN.14.HFA -> MISSING PAGE, but "GEN.14" (without HFA) is available
  // - PSA.22.RCUV -> the NEXT CHAPTER button, when clicked, points to GEN.1.RCUV. causing parser to goes on an infinite loop.

  const BASE_SCRAPE_URL = `https://www.bible.com/bible/${
    BIBLE_VERSION_IDS[`${VERSION_TO_GET}`]
  }/REV.1.${VERSION_TO_GET}`;

  /**
   * Wait until all elements, including javascript are loaded on a Puppeteer page.
   *
   * @param page
   * @param timeout
   */
  const waitTillHTMLRendered = async (page: Page, timeout = 30000) => {
    // checkDurationMsecs original value: 1000.
    // as this function is used to evaluate javascript-based page change only, faster timing is okay.
    // increaseto higher value if needed, adjusting to internet condition.
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

      // let bodyHTMLSize = await page.evaluate(
      //   () => document.body.innerHTML.length
      // );

      // console.log(
      //   "last: ",
      //   lastHTMLSize,
      //   " <> curr: ",
      //   currentHTMLSize,
      //   " body html size: ",
      //   bodyHTMLSize
      // );

      if (lastHTMLSize != 0 && currentHTMLSize == lastHTMLSize)
        countStableSizeIterations++;
      else countStableSizeIterations = 0; //reset the counter

      if (countStableSizeIterations >= minStableSizeIterations) {
        // console.log("Page rendered fully..");
        break;
      }

      lastHTMLSize = currentHTMLSize;
      // await page.waitForTimeout(checkDurationMsecs);
      await new Promise((r) => setTimeout(r, checkDurationMsecs));
    }
  };

  /**
   * Generate a random number between min and max.
   * @param min
   * @param max
   * @returns
   */
  // function randomIntFromInterval(min: number = 1000, max: number = 3000) {
  //   // min and max included
  //   return Math.floor(Math.random() * (max - min + 1) + min);
  // }

  /**
   *  Clean and trim Bible.com ChapterContent css classes, return the class identifier only.
   * @param chapterContentClass
   * @returns
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
   * verse Id number comprises of {BOOK_NUMBER}{3 zero's padded CHAPTER_NUMBER}{3 zero's padded ORDER_NUMBER}
   * @param book
   * @param chapter
   * @param order
   * @returns
   */
  function getVerseId(book: number, chapter: number, order: number) {
    return `${book}${String(chapter).padStart(3, "0")}${String(order).padStart(
      3,
      "0"
    )}`;
  }

  function isHeadingTopContainer(input: string) {
    let result = false;

    // https://ubsicap.github.io/usfm/titles_headings/index.html#mt

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
      // the D tag is also a verse on HFA
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
  // use with
  // await new Promise((r) => setTimeout(r, randomIntFromInterval()));

  console.log(`starting scrape process for Book ${VERSION_TO_GET}..`);

  // contains ALL the verses of the Bible version.
  let result = new Array();

  // will be flushed after every chapter
  let result_verses_per_books = new Array();

  // setup result_detail, containing the bible books version detail.
  interface ChapterVerseCount {
    c: number;
    v: number[];
  }
  let cv_count: { [key: number]: ChapterVerseCount } = {};
  let cv_v_key: { [key: number]: number } = {};

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

  // const browser = await puppeteer.launch({ headless: true });
  const browser = await puppeteer.launch({ headless: false });

  try {
    const allPages = await browser.pages();
    const page = allPages[0];
    // const page = await browser.newPage();

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

    // GET BIBLE DETAIL ==================================================================================
    console.log(`    getting bible details..`);
    console.log(`      getting bible language info..`);
    const bib_info_arr = await page.$$eval(
      "main div.max-w-full.w-full a h2",
      (el) => {
        return el.map((op) => op.textContent);
      }
    );
    // console.log(bib_info_arr);

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
            .replaceAll(" ", "") // "NASB 1995" => "NASB1995", reason: abbv should have no spaces
            .replace("神", "SHEN") // "CUNP-神" => "CUNP-SHEN", reason: couchdb id cannot have unicode chinese characters.
            .replace("上帝", "SHANGDI") // "CUNP-上帝" => "CUNP-SHANGDI"
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
            .replaceAll(" ", "") // "NASB 1995" => "NASB1995", reason: abbv should have no spaces
            .replace("神", "SHEN") // "CUNP-神" => "CUNP-SHEN", reason: couchdb id cannot have unicode chinese characters.
            .replace("上帝", "SHANGDI") // "CUNP-上帝" => "CUNP-SHANGDI"
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
      }
    }
    console.log("==============================================");
    console.log(result_detail);
    console.log("==============================================");

    // click the first book, first chapter button

    // reset menu
    const blank_space = await page.waitForSelector(`header > div`);
    blank_space?.click();

    await new Promise((r) => setTimeout(r, 200));

    // click on menu
    // console.log("  clicking selectbooks button..");
    selectBooksButton?.click();

    const li_elem_chp = await page.waitForSelector(
      `div[id^="headlessui-popover-panel-"] > div[class*="overflow-y-auto"] > ul li:nth-child(1)`
    );
    li_elem_chp?.click();
    await new Promise((r) => setTimeout(r, 200));

    // select first chapter
    const li_of_chp = await page.waitForSelector(
      `div[id^="headlessui-popover-panel-"] > div[class*="overflow-y-auto"] > ul > li:nth-child(1)`
    );

    li_of_chp?.click();

    // TIMING IS VERY IMPORTANT; TOO FAST AND THE PAGE WILL NOT READY YET.
    await waitTillHTMLRendered(page);

    // and only after then, start the scrape process.

    // /GET BIBLE DETAIL ==================================================================================

    let current_chapter = 0;
    let current_chapter_string = "0"; // for storing weird versions like ESG.1_1.PDV2017 => 1_1
    let current_usfm_book = "";
    let skip = false;
    let end = false;
    let nextChapterButtonFound = true;
    let bookCounter = 0;

    // Extract all books from the URL structure to process in parallel
    console.log("  Extracting book list from navigation...");
    const bookList: string[] = [];
    
    // Get all books by examining the book navigation
    for (let i = 0; i < result_detail.books.length; i++) {
      // Click through each book to get the USFM book code
      await selectBooksButton?.click();
      await new Promise((r) => setTimeout(r, 200));
      
      const bookItem = await page.waitForSelector(
        `div[id^="headlessui-popover-panel-"] > div[class*="overflow-y-auto"] > ul li:nth-child(${i + 1})`
      );
      
      if (bookItem) {
        await bookItem.click();
        await new Promise((r) => setTimeout(r, 200));
        
        // Get first chapter to extract book USFM code
        const firstChapter = await page.waitForSelector(
          `div[id^="headlessui-popover-panel-"] > div[class*="overflow-y-auto"] > ul > li:nth-child(1)`
        );
        
        if (firstChapter) {
          await firstChapter.click();
          await waitTillHTMLRendered(page);
          
          const current_page_url = await page.url();
          const segments = new URL(current_page_url).pathname.split("/");
          const last_part_of_url = segments.pop() || segments.pop();
          
          if (last_part_of_url) {
            const url_book = last_part_of_url.split(".")[0];
            bookList.push(url_book);
            console.log(`    Found book: ${url_book}`);
          }
        }
      }
    }

    console.log(`  Total books to process: ${bookList.length}`);
    result_detail.books_usfm = bookList;

    // Create parallel processing function for each book
    const processBook = async (bookUsfm: string, bookNumber: number, tabPage: Page) => {
      console.log(`  [Tab] Starting book ${bookNumber}: ${bookUsfm}`);
      
      const bookResult = {
        verses: new Array(),
        cv_count: {} as ChapterVerseCount,
        cv_v_key: {} as { [key: number]: number }
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
            console.log(`    [Book ${bookNumber}] INTRO detected, skipping parse..`);
          } else {
            current_chapter = getNumberFromChapter(middle_part);
            current_chapter_string = middle_part;
            console.log(`    [Book ${bookNumber}] Chapter: ${current_chapter} (${current_chapter_string})`);
          }

          // Check for page errors
          try {
            const not_available = await tabPage.waitForSelector(
              `span[class*='ChapterContent_not-avaliable']`,
              { timeout: 500 }
            );

            if (not_available) {
              console.log(`    [Book ${bookNumber}] Content not available, skipping..`);
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
          // get chapterContainer direct children divs
          // :is -> like OR statement.
          // :scope -> to select THIS node. :scope > div -> "THIS > DIV"
          const chapterChildrens = await chapterContainer.$$(
            `:is(:scope > div, :scope > table)`
          );

          let last_verse_usfm = "";

          let resultVerse = {
            id: "", // verseid
            b: 0, // book number
            c: 0, // chapter number
            v: 0, // verse number
            t: "", // text
            h: "", // heading (if exist)
            o: 0, // order
            l: "", // label
          };

          let saveHeaders: {
            target_order: number;
            text: string;
          }[] = new Array();

          let chapterVerseOrderCounter = 0;
          let headerOrderCounter = 0;

          // for each chapter childrens (paragraphs)
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

            // direct children span only

            let cc_spans = await cc.$$(`:scope > span`);

            if (topParentClassType == "table") {
              cc_spans = await cc.$$(`:scope td.cell > span`);
            }

            for (let j = 0; j < cc_spans.length; j++) {
              const ccsp = cc_spans[j];

              const parentVersesType = cleanChapCon(
                await (await ccsp.getProperty("className")).jsonValue()
              );

              // console.log(parentVersesType);
              if (
                parentVersesType == "heading" ||
                parentVersesType == "nd"
                // ||
                // isHeadingTopContainer(topParentClassType)
              ) {
                const getHeadingText = await ccsp.evaluate(
                  (el) => el.textContent
                );
                if (getHeadingText != null) {
                  let target_order: number = headerOrderCounter + 1;

                  // console.log(
                  //   `      header: target_order: ${target_order} ==> ${getHeadingText}`
                  // );

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
                    // saveHeader.text += getHeadingText.toUpperCase();
                  } else {
                    if (headers_exist != undefined) {
                      headers_exist.text += getHeadingText;
                    } else {
                      saveHeaders.push({
                        target_order: target_order,
                        text: getHeadingText,
                      });
                    }
                    // saveHeader.text += getHeadingText;
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
                      // console.log(`${verse_usfm} != ${last_verse_usfm}`);
                      // must be changing verses, so add them into the array
                      chapterVerseOrderCounter += 1;
                      headerOrderCounter += 1;

                      resultVerse.b = bookCounter;
                      resultVerse.o = chapterVerseOrderCounter;
                      resultVerse.id = getVerseId(
                        bookCounter,
                        resultVerse.c,
                        chapterVerseOrderCounter
                      );

                      // remove space from start & end, also remove double spaces.
                      resultVerse.t = resultVerse.t
                        .trim()
                        .split(/[\s]+/)
                        .join(" ");
                      // remove spaces before a dot. ex. "LORD ." -> "LORD."
                      resultVerse.t = resultVerse.t
                        .replaceAll(" .", ".")
                        .replaceAll(" ,", ",");

                      // add header
                      const headers_exist = saveHeaders.find(
                        (el) => el.target_order == chapterVerseOrderCounter
                      );
                      if (headers_exist != undefined) {
                        resultVerse.h = headers_exist.text.trim();
                        saveHeaders = saveHeaders.filter(
                          (el) => el.target_order != chapterVerseOrderCounter
                        );
                      }

                      result_verses_per_books.push(
                        structuredClone(resultVerse)
                      );
                      result.push(structuredClone(resultVerse));
                      // console.log(resultVerse);

                      // resets
                      resultVerse.h = "";
                      resultVerse.t = "";

                      last_verse_usfm = verse_usfm;
                    }
                  }

                  // some cases the verse_usfm contains multiple verses, e.g "JOB.3.2+JOB.3.3"
                  // this function replaces the "+" with ".", and then split it by "."
                  // the verse
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

                  // https://ubsicap.github.io/usfm/characters/index.html#lit

                  if (childVersesType == "label") {
                    const getLabelText = await ccspsp.evaluate((el) => {
                      return el.textContent;
                    });
                    if (getLabelText != null) {
                      resultVerse.l = getLabelText;
                    }
                  } else {
                    // could be content, nd, lit, and many more
                    const getContentText = await ccspsp.evaluate((el) => {
                      return el.textContent;
                    });
                    if (getContentText != null && getContentText != "") {
                      if (childVersesType == "nd") {
                        resultVerse.t += getContentText.toUpperCase();
                      } else if (childVersesType == "note") {
                        // pass
                      } else {
                        resultVerse.t += " " + getContentText;
                      }

                      // if (childVersesType == "note") {

                      // }
                    }

                    // if on the last of the last content
                    // console.log(`i (${i}) == ${chapterChildrens.length - 1}`);
                    // console.log(`j (${j}) == ${cc_spans.length - 1}`);
                    // console.log(`k (${k}) == ${ccsp_spans.length - 1}`);
                    if (
                      i == chapterChildrens.length - 1 &&
                      j == cc_spans.length - 1 &&
                      k == ccsp_spans.length - 1
                    ) {
                      // console.log("LAST VERSE OF THE CHAPTER");
                      // console.log(resultVerse);

                      chapterVerseOrderCounter += 1;

                      resultVerse.b = bookCounter;
                      resultVerse.o = chapterVerseOrderCounter;
                      resultVerse.id = getVerseId(
                        bookCounter,
                        resultVerse.c,
                        chapterVerseOrderCounter
                      );

                      if (current_chapter in cv_v_key) {
                        cv_v_key[current_chapter] += chapterVerseOrderCounter;
                      } else {
                        cv_v_key[current_chapter] = chapterVerseOrderCounter;
                      }

                      // remove space from start & end, also remove double spaces.
                      resultVerse.t = resultVerse.t
                        .trim()
                        .split(/[\s]+/)
                        .join(" ");
                      // remove spaces before a dot. ex. "LORD ." -> "LORD."
                      resultVerse.t = resultVerse.t
                        .replaceAll(" .", ".")
                        .replaceAll(" ,", ",");

                      // add header
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

                      result_verses_per_books.push(
                        structuredClone(resultVerse)
                      );
                      result.push(structuredClone(resultVerse));
                      // console.log(resultVerse);

                      // resets
                      resultVerse.h = "";
                      resultVerse.t = "";
                    } // if on last verse of chapter
                  }
                } // for ccsp_spans
              } // else if parentVerses == "verse"
            } // for cc_spans

            // on the last chapterchildren which has no child, because
            // type is b = BLANK
            // https://ubsicap.github.io/usfm/paragraphs/index.html#b
            if (i == chapterChildrens.length - 1 && topParentClassType == "b") {
              // console.log("LAST VERSE OF THE CHAPTER");
              // console.log(resultVerse);

              chapterVerseOrderCounter += 1;

              resultVerse.b = bookCounter;
              resultVerse.o = chapterVerseOrderCounter;
              resultVerse.id = getVerseId(
                bookCounter,
                resultVerse.c,
                chapterVerseOrderCounter
              );

              if (current_chapter in cv_v_key) {
                cv_v_key[current_chapter] += chapterVerseOrderCounter;
              } else {
                cv_v_key[current_chapter] = chapterVerseOrderCounter;
              }

              // remove space from start & end, also remove double spaces.
              resultVerse.t = resultVerse.t.trim().split(/[\s]+/).join(" ");
              // remove spaces before a dot. ex. "LORD ." -> "LORD."
              resultVerse.t = resultVerse.t
                .replaceAll(" .", ".")
                .replaceAll(" ,", ",");

              // add header
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

              result_verses_per_books.push(structuredClone(resultVerse));
              result.push(structuredClone(resultVerse));
              // console.log(resultVerse);

              // resets
              resultVerse.h = "";
              resultVerse.t = "";
              // if on last verse of chapter
            }
          } // for chapterChildrens

          // perform wait before loading next page
          // this is somewhat important as some pages wont load properly if not waited.
          await new Promise((r) => setTimeout(r, 300));
        }
      } else {
        console.log(
          `!!! SKIPPED PAGE: ${current_usfm_book}.${current_chapter}`
        );
        skip = false; // reset skip
      }

      // try get next chapter button
      try {
        if (!end) {
          // const nextChapterButton = await page.waitForSelector(
          //   `svg[aria-labelledby*='Next Chapter']`,
          //   { timeout: 3000 }
          // );
          // // click next chapter
          // nextChapterButton?.click();
          // nextChapterButtonFound = true;
          const nextChapterAnchor = await page.$eval(
            `main > div:nth-child(1) > div:nth-last-child(1) > div:nth-last-child(1) > a`,
            (anchor) => anchor.getAttribute("href")
          );

          if (nextChapterAnchor) {
            await page.goto(`https://www.bible.com/${nextChapterAnchor}`, {
              waitUntil: "networkidle2",
            });
            await waitTillHTMLRendered(page);
          }
        } else {
          nextChapterButtonFound = false;
        }
      } catch (err: any) {
        console.log("  ERROR: cannot found next chapter button.");
        nextChapterButtonFound = false;

        // must be on last verse
        console.log(`  writing final Chapter Verse count..`);
        let cv_v: number[] = new Array();
        for (let key in cv_v_key) {
          cv_v.push(cv_v_key[key]);
        }
        cv_count[bookCounter] = {
          c: current_chapter,
          v: cv_v,
        };

        console.log(
          `  Writing result to output/${VERSION_TO_GET}/${bookCounter}_${current_usfm_book}.json`
        );
        Bun.write(
          `output/${VERSION_TO_GET}/${bookCounter}_${current_usfm_book}.json`,
          JSON.stringify(result_verses_per_books, null, 2)
        );
      }
    }

    // save result
    console.log(`  Writing detail to ${OUTPUT_FILE_DETAIL}..`);
    result_detail.cv_count = structuredClone(cv_count);
    Bun.write(OUTPUT_FILE_DETAIL, JSON.stringify(result_detail, null, 2));

    console.log(
      `  writing [compacted] verses output to ${OUTPUT_FILE_VERSES}..`
    );
    await Bun.write(OUTPUT_FILE_VERSES, JSON.stringify(result));

    console.log(`Scrape process completed successfully!`);
  } catch (err) {
    console.log("  browser error!");
    console.log(err);
  } finally {
    console.log("  task finished, closing browser..");
    await browser.close();
  }
})();
