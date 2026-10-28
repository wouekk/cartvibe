package services

// DefaultReceiptPrompt is the prompt every receipt read uses (prompts are code, not rows, and are
// only shaped by the group's categories through @categories). It asks for no tags: tags are
// the household's own labels, set by people (the AI's answer is stripped of any, see dropAiTags).
//
// Short on purpose (fewer input tokens), and the answer is minified JSON (fewer output tokens, which set
// most of the latency). buildPrompt inserts the products part right before "\nReceipt text: ".
const DefaultReceiptPrompt = `
Read this receipt or bill. Reply with minified JSON only, no code block:
{"name":"...","shopName":"...","currency":"...","amount":0.0,"date":"2024-01-31T00:00:00Z","categories":[{"id":1}]}
- "name": the shop or company name; "Default store name" if unreadable.
- "shopName": the brand only (Auchan, Uber, Ryanair), not street or branch; "" if unreadable.
- "currency": ` + currencyRule + `
- "amount": the total paid, a number. A refund, return or credit (money back to the customer) is negative.
- "date": the purchase day at midnight UTC, in exactly that format; the year is @currentYear if not printed.
- "categories": up to 2 category ids from the list below that fit the store and what was bought, using their descriptions; [] if none fits. Never invent an id.
Leave out any other value you cannot read with confidence.

Categories: @categories

Receipt text: @ocrText
`
