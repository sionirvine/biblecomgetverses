# Bible.com Verse Scraper

An advanced, configurable Bible verse scraper for Bible.com that extracts verses from various Bible translations and saves them as structured JSON files.

## Features

- ✅ **66+ Bible Versions**: Support for multiple languages (English, Indonesian, Chinese, German, French, Dutch, Japanese)
- ✅ **Specific Book Processing**: Process individual books or custom book lists
- ✅ **Individual Book Files**: Each book saved separately for easy resume/access
- ✅ **Parallel Processing**: Configurable concurrent tabs for faster scraping
- ✅ **Resume Capability**: Continue from where you left off
- ✅ **Chapter 1_1 Fallback**: Handles special chapter numbering (e.g., ESG.1_1)
- ✅ **Comprehensive Error Handling**: Retry mechanisms and graceful failure recovery
- ✅ **Debug Mode**: Detailed logging for troubleshooting
- ✅ **Metrics Tracking**: Processing statistics and time estimates

## Output Structure

The scraper creates organized JSON files in the `output` directory:

```
output/
├── ESV/
│   ├── 1_GEN.json      # Genesis verses
│   ├── 2_EXO.json      # Exodus verses
│   ├── 3_LEV.json      # Leviticus verses
│   └── ...
├── ESV_detail.json     # Bible metadata
└── ESV_verses.json     # Combined verses
```

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
| `--parallel` | `-p`  | Number of parallel tabs (1-10)                     | 4          |
| `--output`   | `-o`  | Output directory                                   | `./output` |
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

# Fast parallel processing
bun run index.ts --version KJV --parallel 8 --headless

# Process Psalms and Proverbs only
bun run index.ts --version NLT -b PSA -b PRO
```

## Notes

- First-time scraping may encounter some failures - simply re-run the script
- Individual book files allow you to resume processing without starting over
- Use `--debug` flag for detailed processing information
- The scraper handles special cases like chapter numbering variations (1_1, 1_2, etc.)
- Built with Bun runtime for optimal performance

## Technical Details

This project uses:

- **Puppeteer** for web scraping
- **Bun** as the JavaScript runtime
- **TypeScript** for type safety
- **Parallel processing** for improved performance
- **Robust error handling** and retry mechanisms

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
- ESG.1_1.PDV2017 -> has like "1_1" and "1_2" as chapter. not a number.

notes:

- ACT.8.37.HFA -> is missing on the page, but ACT.8.36 contains notes about verse 37.

error:

- GEN.14.HFA -> MISSING PAGE, but GEN.14 is available

wtf's, page error:

- GEN.14.HFA -> MISSING PAGE, but "GEN.14" (without HFA) is available
- PSA.22.RCUV -> the NEXT CHAPTER button, when clicked, points to GEN.1.RCUV. causing parser to goes on an infinite loop. (this is currently fixed now)
