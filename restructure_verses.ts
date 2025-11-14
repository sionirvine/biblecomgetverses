import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error(
    "Usage: bun run restructure_verses.ts <verses-file-path> <_id-value>"
  );
  console.error(
    "Example: bun run restructure_verses.ts output/ESV_verses.json ESV"
  );
  process.exit(1);
}

const filePath = resolve(args[0]);
const idValue = args[1];

try {
  // Read the verses file
  console.log(`Reading file: ${filePath}`);
  const fileContent = readFileSync(filePath, "utf-8");
  const data = JSON.parse(fileContent);

  let versesArray: any[];
  let existingId: string | undefined;

  // Check if the content is already in the new structure or is a plain array
  if (Array.isArray(data)) {
    versesArray = data;
  } else if (
    data &&
    typeof data === "object" &&
    "verses" in data &&
    Array.isArray(data.verses)
  ) {
    console.log("File already has the wrapped structure, processing verses...");
    versesArray = data.verses;
    existingId = data._id;
  } else {
    console.error(
      "Error: The file content is not an array or valid structure. No changes made."
    );
    process.exit(1);
  }

  // Convert id fields from string to number in each verse
  const processedVerses = versesArray.map((verse) => {
    if (verse && typeof verse === "object" && "id" in verse) {
      return {
        ...verse,
        id: typeof verse.id === "string" ? parseInt(verse.id, 10) : verse.id,
      };
    }
    return verse;
  });

  // Create the new structure
  const newStructure = {
    _id: idValue,
    verses: processedVerses,
  };

  // Write back to the file
  writeFileSync(filePath, JSON.stringify(newStructure, null, 2), "utf-8");
  console.log(`✓ Successfully restructured ${filePath}`);
  console.log(`  - _id: ${idValue}`);
  console.log(`  - verses count: ${processedVerses.length}`);
} catch (error) {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exit(1);
}
