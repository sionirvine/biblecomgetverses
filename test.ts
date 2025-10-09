import { mkdir } from "node:fs/promises";

const BIBLE_VERSION_IDS: { [key: string]: number } = {
  // indonesian
  TB: 306, // Alkitab Terjemahan Baru ✔️
  TSI: 320, // Terjemahan Sederhana Indonesia ✔️
  FAYH: 2727, // Firman Allah Yang Hidup ✔️
  BIMK: 27, // Bahasa Indonesia Masa Kini ✔️
  AMD: 199, // Alkitab Mudah Dibaca

  // english
  KJV: 1, // ✔️
  NKJV: 114, // New King James Version ✔️
  MSG: 97, // The Message ✔️
  NET: 107, // New English Translation
  NIV: 111, // New International Version ✔️
  NLT: 116, // New Living Translation ✔️
  AMP: 1588, // Amplified Bible ✔️
  NASB1995: 100, // New American Standard Bible, 1995 ✔️
  GNT: 68, // Good News Translation, for checking JOB.3.GNT

  // deutsch
  HFA: 73, // Hoffnung Fur Alle ✔️

  // chinese
  RCUV: 139, // Revised Chinese Union Version ✔️
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

const VERSION_TO_GET: string = "FAYH";
const INPUT_FILE_DETAIL = `output/${VERSION_TO_GET}_detail.json`;
const INPUT_FILE_VERSES = `output/${VERSION_TO_GET}_verses.json`;
const OUTPUT_FILE_DETAIL = `output_fix/${VERSION_TO_GET}_detail.json`;
const OUTPUT_FILE_VERSES = `output_fix/${VERSION_TO_GET}_verses.json`;

// prepare directory for output
await mkdir(`output_fix/`, { recursive: true });

const bible_detail = Bun.file(INPUT_FILE_DETAIL, {
  type: "application/json",
});

console.log(`opening ${INPUT_FILE_VERSES}`);
let bible_detail_contents = JSON.parse(await bible_detail.text());

const original_cv_count = bible_detail_contents["cv_count"];

// ===============================================

console.log(`opening ${INPUT_FILE_VERSES}`);
const bible_verses = Bun.file(INPUT_FILE_VERSES, {
  type: "application/json",
});
const bible_verses_contents = JSON.parse(await bible_verses.text());

type cvCount = {
  c: number;
  v: number[];
};

let result: { [key: string]: cvCount } = {};
let current_book = 0;
let current_chapter = 0;
let current_order = 0;

let next_book = 0;
let next_chapter = 0;
let next_order = 0;

let order_count_container: number[] = [];
let order_count: number = 0;

for (let i = 0; i < bible_verses_contents.length; i++) {
  const verses = bible_verses_contents[i];

  if (verses["id"].length == 7) {
    // 1001001
    next_book = Number(verses["id"].slice(0, 1));
    next_chapter = Number(verses["id"].slice(1, 4));
    next_order = Number(verses["id"].slice(4, 7));
  } else if (verses["id"].length > 7) {
    next_book = Number(verses["id"].slice(0, 2));
    next_chapter = Number(verses["id"].slice(2, 5));
    next_order = Number(verses["id"].slice(5, 8));
  }

  console.log(next_book, next_chapter, next_order);

  if (current_book != next_book) {
    if (current_book != 0) {
      order_count_container.push(current_order);
      order_count += current_order;

      // add current book to result
      result[`${current_book}`] = {
        c: current_chapter,
        v: order_count_container,
      };

      console.log(current_book, result[`${current_book}`]);
    }

    // reset counter
    current_chapter = 0;
    order_count_container = [];

    // get ready for the next book
    current_book = next_book;
  }

  if (current_chapter != next_chapter) {
    if (current_chapter != 0) {
      // add current order to container
      order_count_container.push(current_order);
      order_count += current_order;
    }

    current_chapter = next_chapter;
  }

  // get ready for the next order
  current_order = next_order;

  // if on the last of the stack, push no matter what
  if (i == bible_verses_contents.length - 1) {
    order_count_container.push(current_order);
    order_count += current_order;

    // add current book to result
    result[`${current_book}`] = {
      c: current_chapter,
      v: order_count_container,
    };

    console.log(current_book, result[`${current_book}`]);
  }
}

// compare
console.log("total verse count: ", order_count);
