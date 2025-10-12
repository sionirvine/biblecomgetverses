import { mkdir } from "node:fs/promises";

(async function main() {
  // contains supported BIBLE_VERSION_ID taken from Bible.com URL.
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

  const VERSION_TO_GET: string = "TB";
  const INPUT_FILE_DETAIL = `output/${VERSION_TO_GET}_detail.json`;
  const INPUT_FILE_VERSES = `output/${VERSION_TO_GET}_verses.json`;
  const OUTPUT_FILE_DETAIL = `output_fix/${VERSION_TO_GET}_detail.json`;
  const OUTPUT_FILE_VERSES = `output_fix/${VERSION_TO_GET}_verses.json`;

  // prepare directory for output
  await mkdir(`output_fix/`, { recursive: true });

  const bible_detail = Bun.file(INPUT_FILE_DETAIL, {
    type: "application/json",
  });

  let bible_detail_contents = JSON.parse(await bible_detail.text());
  const original_cv_count = bible_detail_contents["cv_count"];

  // ===============================================

  const bible_verses = Bun.file(INPUT_FILE_VERSES);
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

  let order_count_container: number[] = new Array();
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
      order_count_container = new Array();

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

  Object.keys(original_cv_count).forEach((bookindex) => {
    const original_c = original_cv_count[bookindex]["c"];

    // Check if the book exists in result before accessing it
    if (!result[bookindex]) {
      console.log(
        `WARNING: BOOK ${bookindex} exists in original data but not in verses data - skipping`
      );
      return;
    }

    const new_c = result[bookindex]["c"];

    if (original_c !== new_c) {
      console.log(
        `DIFF ON BOOK: ${bookindex}\nORIGINAL CHAPTER COUNT = ${original_c}\nNEW CHAPTER COUNT = ${new_c}`
      );
    }

    const original_v = original_cv_count[bookindex]["v"].length;
    const new_v = result[bookindex]["v"].length;

    if (original_v !== new_v) {
      console.log(
        `BOOK: ${bookindex}\nORIGINAL VERSE LENGTH = ${original_v}\nNEW VERSE LENGTH = ${new_v}\n`
      );
    }

    if (original_c !== original_v) {
      console.log(
        `ERROR: BOOK ${bookindex}, has ${original_v} verse length, should be: ${original_c}\n==========`
      );
    }

    // check if chapter does not match verse length
    if (new_c !== new_v) {
      console.log(
        `DIFFERENT CHAPTER AND VERSE LENGTH DETECTED: BOOK ${bookindex}`
      );
    }
  });

  // replace bible detail cv_count with the new result
  bible_detail_contents["cv_count"] = result;

  // PouchDB compatibility
  bible_detail_contents["_id"] = bible_detail_contents["abbreviation"];

  console.log(`writing new corrected detail to ${OUTPUT_FILE_DETAIL}..`);
  Bun.write(OUTPUT_FILE_DETAIL, JSON.stringify(bible_detail_contents, null, 2));

  const newVerses = bible_verses_contents.map((v: any) => {
    let bibleText: string = v.t;
    let bibleHeading: string = v.h;

    if (VERSION_TO_GET == "NASB1995" || VERSION_TO_GET == "AMP") {
      //40012018

      bibleText = bibleText.replaceAll("L ord", "Lord");
      bibleText = bibleText.replaceAll("G od", "God");
      bibleText = bibleText.replaceAll("A nd", "And");
      bibleText = bibleText.replaceAll("H e ", "He ");
      bibleText = bibleText.replaceAll(" H is ", " His ");
      bibleText = bibleText.replaceAll("I n ", "In ");
      bibleText = bibleText.replaceAll("B ehold", "Behold");
      bibleText = bibleText.replaceAll("T hen", "Then");
      bibleText = bibleText.replaceAll("I saac", "Isaac");
      bibleText = bibleText.replaceAll("J acob", "Jacob");
      bibleText = bibleText.replaceAll("M idian", "Midian");
      bibleText = bibleText.replaceAll("W ho ", "Who ");
      bibleText = bibleText.replaceAll("S abaoth", "Sabaoth");
      bibleText = bibleText.replaceAll("G omorrah", "Gomorrah");
      bibleText = bibleText.replaceAll("M y ", "My ");
      bibleText = bibleText.replaceAll("B eloved", "Beloved");
      bibleText = bibleText.replaceAll("S ervant", "Servant");
      bibleText = bibleText.replaceAll("S pirit", "Spirit");
      bibleText = bibleText.replaceAll(" H im", " Him");
      bibleText = bibleText.replaceAll("Y ou ", "You ");
      bibleText = bibleText.replaceAll("E ven ", "Even ");
      bibleText = bibleText.replaceAll(" T he ", " The ");
      bibleText = bibleText.replaceAll(" Y our ", " Your ");
      bibleText = bibleText.replaceAll("B ecause", "Because");
      bibleText = bibleText.replaceAll("Z eal", "Zeal");
      bibleText = bibleText.replaceAll("T hey", "They");
      bibleText = bibleText.replaceAll("T here", "There"); // wai(t here) -> if not case sensitive
      bibleText = bibleText.replaceAll("Z ebulun", "Zebulun");
      bibleText = bibleText.replaceAll("N aphtali", "Naphtali");
      bibleText = bibleText.replaceAll("T he", "The");
      bibleText = bibleText.replaceAll("U pon", "Upon");
      bibleText = bibleText.replaceAll("L ight", "Light");
      bibleText = bibleText.replaceAll("G alilee", "Galilee");
      bibleText = bibleText.replaceAll("G entiles", "Gentiles");
      bibleText = bibleText.replaceAll("B y", "By");
      bibleText = bibleText.replaceAll("M ake", "Make");
      bibleText = bibleText.replaceAll("M en", "Men");
      bibleText = bibleText.replaceAll("Z ion", "Zion");
      bibleText = bibleText.replaceAll("S ay", "Say");
      bibleText = bibleText.replaceAll("S arah", "Sarah");
      bibleText = bibleText.replaceAll("J ordan", "Jordan");
      bibleText = bibleText.replaceAll("J oseph", "Joseph");
      bibleText = bibleText.replaceAll("I srael", "Israel");
      bibleText = bibleText.replaceAll("J esse", "Jesse");
      bibleText = bibleText.replaceAll("A gainst", "Against");
      bibleText = bibleText.replaceAll("C hrist", "Christ");
      bibleText = bibleText.replaceAll("J udah", "Judah");
      bibleText = bibleText.replaceAll("L ike", "Like");
      bibleText = bibleText.replaceAll("W ith", "With");
      bibleText = bibleText.replaceAll("S on", "Son");
      bibleText = bibleText.replaceAll("Y ou", "You");
      bibleText = bibleText.replaceAll("H oly", "Holy");
      bibleText = bibleText.replaceAll("O ne", "One");
      bibleText = bibleText.replaceAll("H ades", "Hades");
      bibleText = bibleText.replaceAll("N or", "Nor");
      bibleText = bibleText.replaceAll("F or", "For");
      bibleText = bibleText.replaceAll("B ethlehem", "Bethlehem");
      bibleText = bibleText.replaceAll("A re ", "Are ");
      bibleText = bibleText.replaceAll("R uler", "Ruler");
      bibleText = bibleText.replaceAll("W hose", "Whose");
      bibleText = bibleText.replaceAll("W hoever", "Whoever");
      bibleText = bibleText.replaceAll("G o ", "Go ");
      bibleText = bibleText.replaceAll("O therwise", "Otherwise");
      bibleText = bibleText.replaceAll("P raise", "Praise");
      bibleText = bibleText.replaceAll("G reat", "Great");
      bibleText = bibleText.replaceAll("K ing", "King");
      bibleText = bibleText.replaceAll("G entle", "Gentle");
      bibleText = bibleText.replaceAll("B lessed", "Blessed");
      bibleText = bibleText.replaceAll("B ut", "But");
      bibleText = bibleText.replaceAll("B lood", "Blood");
      bibleText = bibleText.replaceAll("B efore", "Before");
      bibleText = bibleText.replaceAll("B abylon", "Babylon");
      bibleText = bibleText.replaceAll("M oloch", "Moloch");
      bibleText = bibleText.replaceAll("B aal", "Baal");
      bibleText = bibleText.replaceAll("B reak", "Break");
      bibleText = bibleText.replaceAll("B e", "Be");
      bibleText = bibleText.replaceAll("C ursed", "Cursed");
      bibleText = bibleText.replaceAll("C ast", "Cast");
      bibleText = bibleText.replaceAll("D avid", "David");
      bibleText = bibleText.replaceAll("D estruction", "Destruction");
      bibleText = bibleText.replaceAll("D o", "Do");
      bibleText = bibleText.replaceAll("D eliverer", "Deliverer");
      bibleText = bibleText.replaceAll("D eath", "Death");
      bibleText = bibleText.replaceAll("D aring", "Daring");
      bibleText = bibleText.replaceAll("O ut", "Out");
      bibleText = bibleText.replaceAll("E gypt", "Egypt");
      bibleText = bibleText.replaceAll("E very", "Every");
      bibleText = bibleText.replaceAll("A aron", "Aaron");
      bibleText = bibleText.replaceAll("E sau", "Esau");
      bibleText = bibleText.replaceAll("E yes", "Eyes");
      bibleText = bibleText.replaceAll("F ield", "Field");
      bibleText = bibleText.replaceAll("P otter ’ s", "Potter’s");
      bibleText = bibleText.replaceAll("F ear", "Fear");
      bibleText = bibleText.replaceAll("F aith", "Faith");
      bibleText = bibleText.replaceAll("F ather", "Father");
      bibleText = bibleText.replaceAll("F rom", "From");
      bibleText = bibleText.replaceAll("M e", "Me");
      bibleText = bibleText.replaceAll("K now", "Know");
      bibleText = bibleText.replaceAll("I t ", "it ");
      bibleText = bibleText.replaceAll("G race", "Grace");
      bibleText = bibleText.replaceAll("G ive", "Give");
      bibleText = bibleText.replaceAll("H ear", "Hear");
      bibleText = bibleText.replaceAll("H eaven", "Heaven");
      bibleText = bibleText.replaceAll("H ow", "How");
      bibleText = bibleText.replaceAll("H onor", "Honor");
      bibleText = bibleText.replaceAll("H allelujah", "Hallelujah");
      bibleText = bibleText.replaceAll("H er", "Her");
      bibleText = bibleText.replaceAll("L et", "Let");
      bibleText = bibleText.replaceAll("L eave", "Leave");
      bibleText = bibleText.replaceAll("M oreover", "Moreover");
      bibleText = bibleText.replaceAll("M yself", "Myself");
      bibleText = bibleText.replaceAll("M oses", "Moses");
      bibleText = bibleText.replaceAll("M ount", "Mount");
      bibleText = bibleText.replaceAll("M ine", "Mine");
      bibleText = bibleText.replaceAll("V engeance", "Vengeance");
      bibleText = bibleText.replaceAll("M ust", "Must");
      bibleText = bibleText.replaceAll("N ow", "Now");
      bibleText = bibleText.replaceAll("N o", "No");
      bibleText = bibleText.replaceAll("P eace", "Peace");
      bibleText = bibleText.replaceAll("R amah", "Ramah");
      bibleText = bibleText.replaceAll("W eeping", "Weeping");
      bibleText = bibleText.replaceAll("R achel", "Rachel");
      bibleText = bibleText.replaceAll("R ompha", "Rompha");
      bibleText = bibleText.replaceAll("R ejoice", "Rejoice");
      bibleText = bibleText.replaceAll("R emove", "Remove");
      bibleText = bibleText.replaceAll("S o", "So");
      bibleText = bibleText.replaceAll("S it", "Sit");
      bibleText = bibleText.replaceAll("S ince", "Since");
      bibleText = bibleText.replaceAll("S odom", "Sodom");
      bibleText = bibleText.replaceAll("S ee", "See");
      bibleText = bibleText.replaceAll("S acrifice", "Sacrifice");
      bibleText = bibleText.replaceAll("S alvation", "Salvation");
      bibleText = bibleText.replaceAll("T ell", "Tell");
      bibleText = bibleText.replaceAll("T hus", "Thus");
      bibleText = bibleText.replaceAll("T o", "To");
      bibleText = bibleText.replaceAll("T his", "This");
      bibleText = bibleText.replaceAll("T hat", "That");
      bibleText = bibleText.replaceAll("T ake", "Take");
      bibleText = bibleText.replaceAll("T hough", "Though");
      bibleText = bibleText.replaceAll("A ll", "All");
      bibleText = bibleText.replaceAll("T hings", "Things");
      bibleText = bibleText.replaceAll("T han", "Than");
      bibleText = bibleText.replaceAll("U nless", "Unless");
      bibleText = bibleText.replaceAll("U ntil", "Until");
      bibleText = bibleText.replaceAll("Y et", "Yet");
      bibleText = bibleText.replaceAll("Y es", "Yes");
      bibleText = bibleText.replaceAll("W hen", "When");
      bibleText = bibleText.replaceAll("W hy", "Why");
      bibleText = bibleText.replaceAll("W hat", "What");
      bibleText = bibleText.replaceAll("W as", "Was");
      bibleText = bibleText.replaceAll("W e", "We");
      bibleText = bibleText.replaceAll("W here", "Where");
      bibleText = bibleText.replaceAll("A men", "Amen");
      // bibleText = bibleText.replaceAll("REPLACE", "REPLACEWITH");
      // bibleText = bibleText.replaceAll("REPLACE", "REPLACEWITH");
      // bibleText = bibleText.replaceAll("REPLACE", "REPLACEWITH");
      // bibleText = bibleText.replaceAll("REPLACE", "REPLACEWITH");
      // bibleText = bibleText.replaceAll("REPLACE", "REPLACEWITH");
      // bibleText = bibleText.replaceAll("REPLACE", "REPLACEWITH");
      // bibleText = bibleText.replaceAll("REPLACE", "REPLACEWITH");

      // bibleText = bibleText.replaceAll("REPLACE", "REPLACEWITH");

      bibleText = bibleText.replaceAll(" ;", ";");
      bibleText = bibleText.replaceAll(" !", "!");
      bibleText = bibleText.replaceAll(" ?", "?");

      bibleText = bibleText.replaceAll("( ", "(");
      bibleText = bibleText.replaceAll(" )", ")");
      bibleText = bibleText.replaceAll("[ ", "[");
      bibleText = bibleText.replaceAll(" ]", "]");

      bibleHeading = bibleHeading.replaceAll("the L", "the Lord ");
      bibleHeading = bibleHeading.replaceAll("the L,", "the Lord,");
      bibleHeading = bibleHeading.replaceAll("the L.", "the Lord.");

      bibleHeading = bibleHeading.replaceAll(
        "The LPraised",
        "The Lord Praised"
      );
      bibleHeading = bibleHeading.replaceAll(
        "The LImplored",
        "The Lord Implored"
      );
      bibleHeading = bibleHeading.replaceAll("The Lthe", "The Lord the");
      bibleHeading = bibleHeading.replaceAll("The L,", "The Lord,");
    }

    return {
      id: Number(v.id),
      b: v.b,
      c: v.c,
      v: v.v,
      t: bibleText,
      h: bibleHeading,
      o: v.o,
      l: v.l,
    };
  }); // convert id to number for FASTER querying

  // pouchDB compatibility
  const newVersesDetail = {
    _id: bible_detail_contents["abbreviation"],
    verses: newVerses,
  };

  console.log(`writing new corrected detail to ${OUTPUT_FILE_VERSES}..`);
  Bun.write(OUTPUT_FILE_VERSES, JSON.stringify(newVersesDetail));
})();
