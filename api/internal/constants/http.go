package constants

import "time"

const ApplicationJson = "application/json"
const ApplicationZip = "application/zip"
const ApplicationPdf = "application/pdf"
const ApplicationXlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const ImageHeic = "image/heic"
const AnyImage = "image/*"
const TextPlain = "text/plain"
const TextCsv = "text/csv"
const MultipartFormMaxSize = 50 << 20

// AiHttpTimeout bounds one call to a hosted AI provider (Gemini, Claude, ChatGPT). Reading a receipt takes them
// seconds, a long one with its products well under a minute; three minutes leaves room for a slow day. Scans are read
// one at a time, so a provider that hangs holds every later scan for this long (and once more for the backup AI).
const AiHttpTimeout = 3 * time.Minute

// AiLocalHttpTimeout bounds one call to a model the household runs itself (Ollama, LM Studio or another
// OpenAI-compatible server at a URL they entered). A model on a small machine can take minutes over a photo.
const AiLocalHttpTimeout = 10 * time.Minute
