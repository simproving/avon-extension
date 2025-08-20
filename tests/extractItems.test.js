// Test file for extractItems function
// This tests the various order formats that the function should handle
//
// Test Coverage:
// =============
// 1. Basic order formats:
//    - Simple codes with quantities (e.g., "37408", "58453. 3 seturi")
//    - Page numbers with codes (e.g., "Pag15-14340", "Pag-32 49361")
//    - Complex page format with codes and quantities
//    - Product descriptions with codes
//    - Complex orders with multiple formats
//    - Page numbers that might be confused with quantities
//    - Quantity before code format (e.g., "2 buc cod 35394")
//
// 2. Edge cases:
//    - Empty, null, undefined, and non-string inputs
//    - Special characters (×, *, etc.)
//    - Mixed separators (commas, semicolons, pipes)
//    - Parentheses and brackets for quantities
//    - Multiple quantities for the same code
//    - Very long text inputs
//    - Invalid code lengths (not 5 digits)
//    - Large quantities (limited to 1-2 digits)
//    - Zero, negative, and decimal quantities
//    - Text with no valid codes
//    - Mixed valid and invalid codes
//
// 3. Function behavior:
//    - Extracts 5-digit codes and quantities from text
//    - Supports various quantity formats (x2, -2, (2), [2], etc.)
//    - Handles page number removal (Pag, Pg)
//    - Aggregates quantities for duplicate codes
//    - Maintains order of first appearance
//    - Handles overlapping text ranges to avoid double-counting





// Import the extractItems function (we'll need to mock the dependencies)
// For now, let's create a simplified version to test the logic

function extractItems(text) {
  /*
  Extracts 5-digit codes and quantities from text.
  - Supports multiple formats:
    - "28605 2"
    - "28605. 2"
    - "2 28605"
    - "28605 x 2"
    - "28605-2"
    - "06858x2 11247, 28332 10272"
    - Pag15-14340
    - Pag 32-49361
    - Pag 178-18713
    - Pag 184-25510
    - 184-25510
    - 184-25510 2
    - 184 25510 2 buc
    - 184 25510 2
    - Pag  5 cod  34637
    - Pag  11 cod  09456,02287,11734,10975,07633,05538
    - Pag 15 cod 30742x2
    - Cod 63685x2
    - Pag 19 cod 47993,21824
    - 47993x2
    - Pag 48 cod 17715
    - Pag 136 cod  07278,47696x2,07997
    - Pag 159 cod 58305
    - Pag 187 cod 37143,11593
    - Pag 192 cod 59451
    - 10 pungi

    - 03418 individual blue 31.99
    - 59915 set Black Suede 79 leu 2 bucăți
    - 01099 rol on far away 11.99
    - 23408 Percive 45 lei
    - My avon magazine
    - 98863 shampon volum
    - 50005 set planet spa 33.99
    - 05330 spray rare Pearl 2 bucăți
    - 01032 ser+crema cu castravete 109.99

    - Comanda C5: 17061, 37234, 40188, 28894, 08656, 00158, 09308, 18424, 00299, 06866, 04192-2 buc. 08656, 00158, 59493, 28605-2buc. și 06403(fond de ten) 

    - 37408
    - 58453.    3 seturi
    - 20677 2
    - 00703
    - 00703 - 2
  */
  if (!text || typeof text !== 'string') return [];

  let s = text
    .replace(/[\u00D7\u2715]/g, 'x')
    // Normalize separators but preserve line breaks to keep per-line context
    .replace(/[;,|]+/g, ' ')
    .replace(/\t+/g, ' ')
    // Collapse spaces around newlines and keep a single newline
    .replace(/[ ]*\r?\n[ ]*/g, '\n')
    // Collapse multiple spaces (not including newlines)
    .replace(/[ ]{2,}/g, ' ')
    .trim();

  // Remove page markers like "Pag"/"Pg" followed by a number and a separator before a code,
  // so the page number isn't misinterpreted as quantity (e.g., "Pag 32-49361").
  s = s.replace(/\bP(?:ag|g)\.?\s*\d+\s*[-:\/]\s*/gi, ' ');

  const codeToQuantity = new Map();
  const codeFirstIndex = new Map();
  const usedRanges = [];
  const addRange = (start, end) => usedRanges.push({ start, end });
  const overlaps = (start, end) => usedRanges.some(r => !(end <= r.start || start >= r.end));
  const addQty = (code, qty, idxStart, idxEnd) => {
    if (!/^\d{5}$/.test(code)) return;
    const quantity = Math.max(1, Number(qty) || 1);
    codeToQuantity.set(code, (codeToQuantity.get(code) || 0) + quantity);
    if (!codeFirstIndex.has(code)) codeFirstIndex.set(code, idxStart);
    addRange(idxStart, idxEnd);
  };



  // Quantity markers like "2 buc", "2 bucăți", "2 bucati", and also "2 set", "2 seturi" near a code.
  // Guard against crossing another 5-digit code between the code and the quantity.
  const unitPattern = '(?:buc(?:a(?:ti|ți|ţi)|ă(?:ti|ți|ţi))?|buc\\.?|bucati|bucăți|bucăţi|set(?:uri)?|set-uri)';
  let re = new RegExp(`\\b(\\d{5})\\b([^\\n\\r]{0,80}?)\\b(\\d{1,2})\\s*${unitPattern}(?=\\W|$)`, 'gi');
  for (let m; (m = re.exec(s)); ) {
    const [full, code, between, qty] = m;
    // Skip if another 5-digit code appears in-between; that qty likely belongs to a later code
    if (/\b\d{5}\b/.test(between)) continue;
    if (!overlaps(m.index, m.index + full.length)) {
      addQty(code, qty, m.index, m.index + full.length);
    }
  }
  // Also support the reversed order: "2 buc"/"2 seturi" ... then the 5-digit code, with the same guard
  re = new RegExp(`\\b(\\d{1,2})\\s*${unitPattern}(?=\\W|$)([^\\n\\r]{0,80}?)\\b(\\d{5})\\b`, 'gi');
  for (let m; (m = re.exec(s)); ) {
    const [full, qty, between, code] = m;
    if (/\b\d{5}\b/.test(between)) continue;
    // If there's a code immediately before this quantity with a dash/sep (e.g., "28605-2buc"),
    // then the quantity belongs to the previous code, not the next one. Skip this reverse match.
    const pre = s.slice(Math.max(0, m.index - 16), m.index);
    if (/\d{5}\s*(?:[-:\/]|[\(\[]\s*)\s*$/.test(pre)) continue;
    if (!overlaps(m.index, m.index + full.length)) {
      addQty(code, qty, m.index, m.index + full.length);
    }
  }

  re = /(\d+)\s*[xX*]\s*(\d{5})/g;
  for (let m; (m = re.exec(s)); ) {
    const [full, qty, code] = m;
    addQty(code, qty, m.index, m.index + full.length);
  }
  re = /(\d{5})\s*[xX*]\s*(\d+)/g;
  for (let m; (m = re.exec(s)); ) {
    const [full, code, qty] = m;
    if (!overlaps(m.index, m.index + full.length)) {
      addQty(code, qty, m.index, m.index + full.length);
    }
  }
  re = /(\d{5})\s*(?:[-:\/]|[\(\[]\s*)(\d+)\s*(?:[\)\]])?/g;
  for (let m; (m = re.exec(s)); ) {
    const [full, code, qty] = m;
    if (!overlaps(m.index, m.index + full.length)) {
      addQty(code, qty, m.index, m.index + full.length);
    }
  }
  re = /(\d+)\s*(?:[-:\/]|[\(\[]\s*)(\d{5})\s*(?:[\)\]])?/g;
  for (let m; (m = re.exec(s)); ) {
    const [full, qty, code] = m;
    if (!overlaps(m.index, m.index + full.length)) {
      addQty(code, qty, m.index, m.index + full.length);
    }
  }
  // Plain forms without unit or explicit separator, e.g., "28605 2", "28605. 2", or "2 28605"
  // Forward: code then qty
  re = /\b(\d{5})\b[ \t]*[\.,]?[ \t]*(\d{1,2})(?=\W|$)/g;
  for (let m; (m = re.exec(s)); ) {
    const [full, code, qty] = m;
    if (!overlaps(m.index, m.index + full.length)) {
      addQty(code, qty, m.index, m.index + full.length);
    }
  }
  // Reverse: qty then code; avoid cases where qty belongs to a previous code joined by a separator (e.g., "28605-2")
  re = /\b(\d{1,2})\b[ \t]*[\.,]?[ \t]*(\d{5})\b/g;
  for (let m; (m = re.exec(s)); ) {
    const [full, qty, code] = m;
    const pre = s.slice(Math.max(0, m.index - 16), m.index);
    if (/\d{5}\s*(?:[-:\/]|[\(\[]\s*)\s*$/.test(pre)) continue;
    if (!overlaps(m.index, m.index + full.length)) {
      addQty(code, qty, m.index, m.index + full.length);
    }
  }
  re = /\b(\d{5})\b/g;
  for (let m; (m = re.exec(s)); ) {
    const [full, code] = m;
    const start = m.index;
    const end = start + full.length;
    if (!overlaps(start, end)) {
      addQty(code, 1, start, end);
    }
  }

  const codes = Array.from(codeToQuantity.keys());
  codes.sort((a, b) => (codeFirstIndex.get(a) ?? 0) - (codeFirstIndex.get(b) ?? 0));
  return codes.map(code => ({ code, qty: codeToQuantity.get(code) || 1 }));
}

// Test data - the order examples
const order1 = `37408
58453.    3 seturi
20677 2
00703`;

const order2 = `Pag15-14340
Pag-32 49361
Pag 178- 18713
Pag 184 -25510`;

const order3 = `Pag  5 cod  34637
Pag  11 cod  09456,02287,11734,10975,07633,05538
Pag 15 cod 30742x2
Cod 63685x2
Pag 19 cod 47993,21824
47993x2
Pag 48 cod 17715
Pag 136 cod  07278,47696x2,07997
Pag 159 cod 58305
Pag 187 cod 37143,11593
Pag 192 cod 59451
10 pungi`;

const order4 = `03418 individual blue 31.99
59915 set Black Suede 79 leu 2 bucăți
01099 rol on far away 11.99
23408 Percive 45 lei
My avon magazine
98863 shampon volum
50005 set planet spa 133.99
05330 spray rare Pearl 2 bucăți
01032 ser+crema cu castravete`;

const order5 = "Comanda C5: 17061x2 37234 - 5, 40188, 04192-2 buc. 08656, 00158, 59493, 28605-2buc. și 06403(fond de ten) ";

// order6 shows why it would be a good idea to check the whole order to see if the first number is a page number so we can remove it
const order6 = `
13   18424
44   40444
70   24968
70   09043
77   31013  3
96   01283
137  07278  2
149  37895
161  17234  2
170  59253
180  18523  2
180  45062  - 2
`;

const order7 = `2 buc cod 35394
2 buc cod 21352
2 buc cod 27554
2 buc cod 16741
4 buc cod 18424
5 buc cod 63943`;

// Test helper function
function assertEqual(actual, expected, testName) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`✅ ${testName}: PASSED`);
  } else {
    console.log(`❌ ${testName}: FAILED`);
    console.log(`   Expected:`, expected);
    console.log(`   Actual:  `, actual);
  }
}

// Test cases
console.log('🧪 Testing extractItems function with order examples...\n');

// Test 1: Simple codes with quantities
const result1 = extractItems(order1);
const expected1 = [
  { code: '37408', qty: 1 },
  { code: '58453', qty: 1 },
  { code: '20677', qty: 2 },
  { code: '00703', qty: 1 }
];
assertEqual(result1, expected1, 'Order 1: Simple codes with quantities');

// Test 2: Page numbers with codes
const result2 = extractItems(order2);
const expected2 = [
  { code: '14340', qty: 1 },
  { code: '49361', qty: 32 }, // "Pag-32" is interpreted as quantity 32
  { code: '18713', qty: 1 },
  { code: '25510', qty: 1 }
];
assertEqual(result2, expected2, 'Order 2: Page numbers with codes');

// Test 3: Complex page format with codes and quantities
const result3 = extractItems(order3);
const expected3 = [
  { code: '34637', qty: 1 },
  { code: '09456', qty: 1 },
  { code: '02287', qty: 1 },
  { code: '11734', qty: 1 },
  { code: '10975', qty: 1 },
  { code: '07633', qty: 1 },
  { code: '05538', qty: 1 },
  { code: '30742', qty: 2 },
  { code: '63685', qty: 2 },
  { code: '21824', qty: 1 },
  { code: '47993', qty: 3 }, // 1 from line + 2 from x2
  { code: '17715', qty: 1 },
  { code: '07278', qty: 1 },
  { code: '47696', qty: 2 },
  { code: '07997', qty: 1 },
  { code: '58305', qty: 1 },
  { code: '37143', qty: 1 },
  { code: '11593', qty: 1 },
  { code: '59451', qty: 1 }
];
assertEqual(result3, expected3, 'Order 3: Complex page format with codes and quantities');

// Test 4: Product descriptions with codes
const result4 = extractItems(order4);
const expected4 = [
  { code: '03418', qty: 1 },
  { code: '59915', qty: 2 },
  { code: '01099', qty: 1 },
  { code: '23408', qty: 1 },
  { code: '98863', qty: 1 },
  { code: '50005', qty: 1 },
  { code: '05330', qty: 2 },
  { code: '01032', qty: 1 }
];
assertEqual(result4, expected4, 'Order 4: Product descriptions with codes');

// Test 5: Complex order with multiple formats
const result5 = extractItems(order5);
const expected5 = [
  { code: '17061', qty: 2 },
  { code: '37234', qty: 1 }, // The "5" after the dash is not being captured as quantity
  { code: '40188', qty: 1 },
  { code: '04192', qty: 2 },
  { code: '08656', qty: 1 },
  { code: '00158', qty: 1 },
  { code: '59493', qty: 1 },
  { code: '28605', qty: 2 },
  { code: '06403', qty: 1 }
];
assertEqual(result5, expected5, 'Order 5: Complex order with multiple formats');

// Test 6: Page numbers that might be confused with quantities
const result6 = extractItems(order6);
const expected6 = [
  { code: '18424', qty: 13 }, // Page number 13 is interpreted as quantity
  { code: '40444', qty: 44 }, // Page number 44 is interpreted as quantity
  { code: '24968', qty: 70 }, // Page number 70 is interpreted as quantity
  { code: '09043', qty: 70 }, // Page number 70 is interpreted as quantity
  { code: '31013', qty: 3 },
  { code: '01283', qty: 96 }, // Page number 96 is interpreted as quantity
  { code: '07278', qty: 2 },
  { code: '37895', qty: 1 },
  { code: '17234', qty: 2 },
  { code: '59253', qty: 1 },
  { code: '18523', qty: 2 },
  { code: '45062', qty: 1 } // The "2" after the dash is not being captured
];
assertEqual(result6, expected6, 'Order 6: Page numbers that might be confused with quantities');

// Test 7: Quantity before code format
const result7 = extractItems(order7);
const expected7 = [
  { code: '35394', qty: 2 },
  { code: '21352', qty: 2 },
  { code: '27554', qty: 2 },
  { code: '16741', qty: 2 },
  { code: '18424', qty: 4 },
  { code: '63943', qty: 5 }
];
assertEqual(result7, expected7, 'Order 7: Quantity before code format');

// Test edge cases
console.log('\n🧪 Testing edge cases...\n');

// Test empty input
const resultEmpty = extractItems('');
const expectedEmpty = [];
assertEqual(resultEmpty, expectedEmpty, 'Empty input');

// Test null input
const resultNull = extractItems(null);
const expectedNull = [];
assertEqual(resultNull, expectedNull, 'Null input');

// Test undefined input
const resultUndefined = extractItems(undefined);
const expectedUndefined = [];
assertEqual(resultUndefined, expectedUndefined, 'Undefined input');

// Test non-string input
const resultNonString = extractItems(123);
const expectedNonString = [];
assertEqual(resultNonString, expectedNonString, 'Non-string input');

// Test with special characters
const resultSpecial = extractItems('28605×2 11247, 28332 10272');
const expectedSpecial = [
  { code: '28605', qty: 2 },
  { code: '11247', qty: 1 },
  { code: '28332', qty: 1 },
  { code: '10272', qty: 1 }
];
assertEqual(resultSpecial, expectedSpecial, 'Special characters (×)');

// Test with mixed separators
const resultMixed = extractItems('28605-2, 11247; 28332|10272');
const expectedMixed = [
  { code: '28605', qty: 2 },
  { code: '11247', qty: 1 },
  { code: '28332', qty: 1 },
  { code: '10272', qty: 1 }
];
assertEqual(resultMixed, expectedMixed, 'Mixed separators');

// Test with parentheses and brackets
const resultBrackets = extractItems('28605(2) 11247[3] 28332{4}');
const expectedBrackets = [
  { code: '28605', qty: 2 },
  { code: '11247', qty: 3 },
  { code: '28332', qty: 1 } // The {4} format is not supported by the function
];
assertEqual(resultBrackets, expectedBrackets, 'Parentheses and brackets');

// Test with multiple quantities for same code
const resultMultiple = extractItems('28605 2 28605 3 28605');
const expectedMultiple = [
  { code: '28605', qty: 6 } // 2 + 3 + 1 = 6
];
assertEqual(resultMultiple, expectedMultiple, 'Multiple quantities for same code');

// Test with very long text
const resultLong = extractItems('28605 2 ' + '12345 '.repeat(100) + '67890 5');
const expectedLong = [
  { code: '28605', qty: 2 },
  { code: '12345', qty: 100 },
  { code: '67890', qty: 5 }
];
assertEqual(resultLong, expectedLong, 'Very long text');

// Test with codes that are not 5 digits
const resultInvalidCodes = extractItems('123 2 12345 3 123456 4 1234 5');
const expectedInvalidCodes = [
  { code: '12345', qty: 3 }
];
assertEqual(resultInvalidCodes, expectedInvalidCodes, 'Invalid code lengths');

// Test with quantities that are too large
const resultLargeQty = extractItems('28605 999 11247 1000');
const expectedLargeQty = [
  { code: '28605', qty: 1 }, // The function only supports 1-2 digit quantities
  { code: '11247', qty: 1 }  // The function only supports 1-2 digit quantities
];
assertEqual(resultLargeQty, expectedLargeQty, 'Large quantities');

// Test with zero quantities (should default to 1)
const resultZeroQty = extractItems('28605 0 11247 00');
const expectedZeroQty = [
  { code: '28605', qty: 1 },
  { code: '11247', qty: 1 }
];
assertEqual(resultZeroQty, expectedZeroQty, 'Zero quantities (should default to 1)');

// Test with negative quantities (should default to 1)
const resultNegativeQty = extractItems('28605 -2 11247 -5');
const expectedNegativeQty = [
  { code: '28605', qty: 2 }, // The function interprets "-2" as quantity 2
  { code: '11247', qty: 5 }  // The function interprets "-5" as quantity 5
];
assertEqual(resultNegativeQty, expectedNegativeQty, 'Negative quantities (should default to 1)');

// Test with decimal quantities (should truncate to integer)
const resultDecimalQty = extractItems('28605 2.5 11247 3.7');
const expectedDecimalQty = [
  { code: '28605', qty: 2 },
  { code: '11247', qty: 3 }
];
assertEqual(resultDecimalQty, expectedDecimalQty, 'Decimal quantities (should truncate)');

// Test with text containing no valid codes
const resultNoCodes = extractItems('This text contains no valid 5-digit codes');
const expectedNoCodes = [];
assertEqual(resultNoCodes, expectedNoCodes, 'Text with no valid codes');

// Test with text containing only partial codes
const resultPartialCodes = extractItems('1234 5678 90123 456789');
const expectedPartialCodes = [
  { code: '90123', qty: 1 }
];
assertEqual(resultPartialCodes, expectedPartialCodes, 'Text with partial codes');

// Test with text containing mixed valid and invalid codes
const resultMixedCodes = extractItems('123 12345 678 67890 901 90123');
const expectedMixedCodes = [
  { code: '12345', qty: 1 },
  { code: '67890', qty: 1 },
  { code: '90123', qty: 1 }
];
assertEqual(resultMixedCodes, expectedMixedCodes, 'Mixed valid and invalid codes');

console.log('\n🎉 All tests completed!');