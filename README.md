# Bible.com Verse Scraper

An advanced, configurable Bible verse scraper for Bible.com that extracts verses from various Bible translations and saves them as structured JSON files.

## Recent Updates

### Latest Changes (October 2025)

- ✨ **PouchDB Output Format**: Added `--pouchdb` flag for database-ready JSON structure
- ✨ **Chapter Count Validation**: Automatically validates expected vs actual chapter count per book
- ✨ **Split Verse Detection**: Handles verses with multiple labels (e.g., 4a, 4b) correctly
- ✨ **Queue-Based Parallel Processing**: Optimized tab management for immediate book continuation
- ✨ **Memory Management**: Automatic tab cleanup after each book and after book list extraction
- ✨ **Book Metadata**: Returns complete book information (names and USFM codes)

## Features

- ✅ **66+ Bible Versions**: Support for multiple languages (English, Indonesian, Chinese, German, French, Dutch, Japanese)
- ✅ **Specific Book Processing**: Process individual books or custom book lists
- ✅ **Individual Book Files**: Each book saved separately for easy resume/access
- ✅ **Parallel Processing**: Configurable concurrent tabs (1-100) for faster scraping
- ✅ **PouchDB Format Support**: Optional database-ready JSON output format
- ✅ **Chapter Count Validation**: Ensures all expected chapters are scraped
- ✅ **Split Verse Handling**: Correctly processes verses with labels (4a, 4b, etc.)
- ✅ **Resume Capability**: Continue from where you left off
- ✅ **Chapter 1_1 Fallback**: Handles special chapter numbering (e.g., ESG.1_1)
- ✅ **Comprehensive Error Handling**: Retry mechanisms and graceful failure recovery
- ✅ **Debug Mode**: Detailed logging for troubleshooting
- ✅ **Metrics Tracking**: Processing statistics and time estimates

## Output Structure

The scraper creates organized JSON files in the `output` directory:

### Standard Format

```
output/
├── ESV/
│   ├── 1_GEN.json      # Genesis verses (array of verse objects)
│   ├── 2_EXO.json      # Exodus verses
│   ├── 3_LEV.json      # Leviticus verses
│   └── ...
├── ESV_detail.json     # Bible metadata (includes books array and USFM codes)
└── ESV_verses.json     # Combined verses
```

### PouchDB Format (with `--pouchdb` flag)

```
output/
├── ESV/
│   ├── 1_GEN.json      # {"_id": "ESV.GEN", "verses": [...]}
│   ├── 2_EXO.json      # {"_id": "ESV.EXO", "verses": [...]}
│   └── ...
├── ESV_detail.json     # Bible metadata
└── ESV_verses.json     # Combined verses
```

**Note**: In PouchDB format, verse IDs are numeric instead of strings for database compatibility.

## Installation

```bash
bun install
```

## Usage

### Basic Usage

```bash
# Scrape entire Bible
bun run index.ts --version ESV

# Show help and available options
bun run index.ts --help
```

### Advanced Options

```bash
# Process specific books
bun run index.ts --version NIV --books GEN,EXO,LEV

# Multiple book flags
bun run index.ts --version KJV -b GEN -b PSA -b MAT

# Parallel processing with debug mode
bun run index.ts --version ESV --parallel 6 --debug --headless

# Custom output directory
bun run index.ts --version NLT --output ./my-output --books JHN,ACT,ROM
```

### CLI Options

| Option       | Short | Description                                        | Default    |
| ------------ | ----- | -------------------------------------------------- | ---------- |
| `--version`  | `-v`  | Bible version to scrape (required)                 | -          |
| `--books`    | `-b`  | Specific books (comma-separated or multiple flags) | All books  |
| `--parallel` | `-p`  | Number of parallel tabs (1-100)                    | 4          |
| `--output`   | `-o`  | Output directory                                   | `./output` |
| `--pouchdb`  |       | Output in PouchDB JSON structure format            | false      |
| `--debug`    | `-d`  | Enable debug logging                               | false      |
| `--headless` |       | Run browser in headless mode                       | false      |
| `--config`   | `-c`  | Configuration file path                            | -          |
| `--help`     | `-h`  | Show help message                                  | -          |

## Supported Bible Versions

### English

- **ESV** - English Standard Version 2016
- **NIV** - New International Version
- **NLT** - New Living Translation
- **KJV** - King James Version
- **NKJV** - New King James Version
- **NASB1995** - New American Standard Bible 1995
- **AMP** - Amplified Bible
- **MSG** - The Message
- **NET** - New English Translation
- **GNT** - Good News Translation
- **AFV** - A Faithful Version

### Indonesian

- **TB** - Alkitab Terjemahan Baru
- **TSI** - Terjemahan Sederhana Indonesia
- **FAYH** - Firman Allah Yang Hidup
- **BIMK** - Bahasa Indonesia Masa Kini
- **AMD** - Alkitab Mudah Dibaca
- **PBTB2** - Perjanjian Baru Terjemahan Baru 2

### Chinese

- **RCUV** - Revised Chinese Union Version
- **RCUVSS** - Revised Chinese Union Version, Simplified
- **CUNP-神** - Chinese Union Version, Shén version
- **CUNPSS-神** - Chinese Union Version, Shén version, Simplified
- **CUNP-上帝** - Chinese Union Version, Shàngdì version
- **CUNPSS-上帝** - Chinese Union Version, Shàngdì version, Simplified

### Other Languages

- **HFA** - Hoffnung Für Alle (German)
- **PDV2017** - Parole de Vie 2017 (French)
- **HTB** - Het Boek (Dutch)
- **聖書新共同訳** - Seisho Shinkyoudoyaku (Japanese)

## Examples

```bash
# Process New Testament books only
bun run index.ts --version ESV --books MAT,MRK,LUK,JHN,ACT,ROM,1CO,2CO,GAL,EPH,PHP,COL,1TH,2TH,1TI,2TI,TIT,PHM,HEB,JAS,1PE,2PE,1JN,2JN,3JN,JUD,REV

# Quick test with single book
bun run index.ts --version NIV --books GEN --debug

# Fast parallel processing (up to 100 tabs)
bun run index.ts --version KJV --parallel 20 --headless

# Process Psalms and Proverbs only
bun run index.ts --version NLT -b PSA -b PRO

# Output in PouchDB format for database import
bun run index.ts --version TB --pouchdb

# High-speed parallel processing with PouchDB format
bun run index.ts --version ESV --parallel 50 --pouchdb --headless
```

## Notes

- First-time scraping may encounter some failures - simply re-run the script
- Individual book files allow you to resume processing without starting over
- Use `--debug` flag for detailed processing information
- The scraper handles special cases like chapter numbering variations (1_1, 1_2, etc.)
- Chapter count validation ensures all expected chapters are processed
- Split verses (e.g., John 16:4a, 16:4b) are correctly handled as separate verse entries
- Memory is automatically cleared after processing each book and after extracting book list
- Queue-based parallel processing ensures optimal tab utilization
- PouchDB format uses numeric IDs and structured documents for easy database import
- Supports up to 100 parallel tabs for maximum performance (recommended: 10-20)
- Built with Bun runtime for optimal performance

## Technical Details

This project uses:

- **Puppeteer** for web scraping
- **Bun** as the JavaScript runtime
- **TypeScript** for type safety
- **Queue-based parallel processing** for optimal performance
- **Robust error handling** and retry mechanisms
- **Memory management** with automatic tab cleanup
- **Chapter count validation** for data integrity
- **Split verse detection** for accurate verse parsing

### Data Processing Features

- **Book Metadata Extraction**: Extracts book names and USFM codes during initialization
- **Chapter Count Tracking**: Records expected chapter count per book for validation
- **Split Verse Handling**: Detects and correctly processes verses with different labels (e.g., 4a vs 4b)
- **INTRO Page Detection**: Automatically adjusts chapter counts when INTRO pages are present
- **Memory Optimization**: Closes and recreates tabs after each book to prevent memory leaks
- **Immediate Continuation**: Queue-based workers pick up next book immediately without waiting for chunk completion

### Good testing pages

headers:

- JOB.3.GNT -> there is 1 header text after title.
- GEN.10.NLT -> many headers on one page
- GEN.4.NLT -> 1 header title, many headers after, too.
- ZEC.4.HFA -> header after verse 14, but the following verse is 6.
- GEN.1.HFA -> 3 headers on the title.
- NEH.7.NIV -> very last verse ALSO contains header in the middle.

ordering:

- ZEC.4.HFA -> verse 6 after verse 14

special formatting:

- GEN.2.NIV -> LORD text is a special `nd` tag
- GEN.15.NLT -> header text contains special `nd` tag (LORD)
- NEH.7.8.NIV -> contains TABLES
- ESG.1_1.PDV2017 -> has like "1_1" and "1_2" as chapter URL. not a standard number.

notes:

- /306/JHN.16.TB -> there is split verse on verse 4 (4a, 4b..)
- /133/GEN.INTRO1.PDV2017 -> there is INTRO page
- /97/GEN.1.MSG -> multiple verses are combined into one (1-2, 3-4)
- ACT.8.37.HFA -> is missing on the page, but ACT.8.36 contains notes about verse 37.

common error:

- GEN.14.HFA -> MISSING PAGE, but "GEN.14" (without HFA) is available (this is currently fixed).
- PSA.22.RCUV -> the NEXT CHAPTER button, when clicked, points to GEN.1.RCUV. causing parser to goes on an infinite loop. (this is currently fixed now)
