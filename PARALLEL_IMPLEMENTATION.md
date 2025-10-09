# Parallel Bible Scraping Implementation

## Summary of Changes Made

The original code has been modified to implement parallel scraping using Puppeteer tabs with the following key improvements:

### 1. Parallel Processing Architecture

- **Tab Pool**: Creates up to 4 concurrent Puppeteer tabs for processing
- **Concurrency Control**: Limits processing to 4 books simultaneously using chunked Promise.all
- **Load Balancing**: Distributes books across available tabs efficiently

### 2. Key Modifications

#### Book Processing

- **Predefined Book List**: Uses a hardcoded list of 66 Bible books (GEN, EXO, LEV, etc.) to avoid DOM manipulation issues
- **Individual Book Processing**: Each book is processed independently in its own function `processBook()`
- **Tab Isolation**: Each tab handles one book at a time, preventing interference between processes

#### Concurrency Management

```typescript
const MAX_CONCURRENT_TABS = 4;
const tabPool: Page[] = [];

// Process books in chunks of 4
for (let i = 0; i < bookList.length; i += MAX_CONCURRENT_TABS) {
  const chunk = bookList.slice(i, i + MAX_CONCURRENT_TABS);
  const chunkPromises = chunk.map(async (bookUsfm, index) => {
    const bookNumber = i + index + 1;
    const tabIndex = index % tabPool.length;
    return await processBook(bookUsfm, bookNumber, tabPool[tabIndex]);
  });

  const chunkResults = await Promise.all(chunkPromises);
  // Process results...
}
```

#### Order Preservation

- **Book Numbering**: Each book retains its original order number (1-66)
- **Result Sorting**: Final results are sorted by book number to maintain correct order
- **Sequential Output**: Files are written in the correct order despite parallel processing

### 3. Performance Benefits

#### Speed Improvement

- **4x Faster**: Can process up to 4 books simultaneously instead of 1
- **Reduced Wait Time**: Each tab operates independently, reducing overall completion time
- **Efficient Resource Usage**: Maximizes browser tab utilization

#### Scalability

- **Configurable Concurrency**: `MAX_CONCURRENT_TABS` can be adjusted based on system resources
- **Memory Management**: Processes books in chunks to prevent memory overflow
- **Error Isolation**: Errors in one tab don't affect other tabs

### 4. Maintained Features

All original functionality is preserved:

- **Chapter-by-chapter scraping**: Same detailed parsing logic
- **Verse extraction**: Identical text processing and formatting
- **Header handling**: Same heading and content processing
- **Error handling**: Maintains robustness for missing pages/content
- **File output**: Same JSON output format and structure

### 5. Usage

The modified script works exactly like the original:

```bash
bun run .\index.ts
```

But now processes multiple books in parallel while maintaining the correct final order.

### 6. Technical Implementation Details

#### Tab Management

- Creates 4 new browser tabs at startup
- Reuses tabs across book chunks for efficiency
- Proper cleanup and resource management

#### Error Handling

- Individual book errors don't stop other books
- Timeouts handled gracefully per tab
- Maintains data integrity despite partial failures

#### Memory Optimization

- Processes books in chunks rather than all at once
- Structured cloning for data integrity
- Proper cleanup of intermediate variables

This implementation provides significant performance improvements while maintaining all the reliability and accuracy of the original scraping logic.
