package backup

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

// utf8BOM opens every CSV so a spreadsheet reads Polish and other non-ASCII text as UTF-8.
const utf8BOM = string(rune(0xFEFF))

var plainNumber = regexp.MustCompile(`^[+-]?[0-9]+(\.[0-9]+)?$`)

// Escape guards a cell against formula injection reversibly. A value starting with = + - @ tab or
// CR (unless it is a plain number, such as a discount of -2.50) or with an apostrophe gets one
// leading apostrophe; Unescape takes exactly one off. Because every value that starts with an
// apostrophe is escaped, an escaped cell is the only kind that starts with one, so the round trip
// is exact. render.SanitizeCSVField is not used here: it cannot be undone.
func Escape(value string) string {
	if value == "" {
		return value
	}

	switch value[0] {
	case '\'':
		return "'" + value
	case '=', '+', '-', '@', '\t', '\r':
		if plainNumber.MatchString(value) {
			return value
		}
		return "'" + value
	}

	return value
}

// Unescape reverses Escape.
func Unescape(value string) string {
	return strings.TrimPrefix(value, "'")
}

// tableWriter writes one CSV file into memory with a header row.
type tableWriter struct {
	buffer  bytes.Buffer
	writer  *csv.Writer
	columns []string
	rows    int
}

func newTableWriter(columns []string) (*tableWriter, error) {
	table := &tableWriter{columns: columns}
	table.buffer.WriteString(utf8BOM)
	table.writer = csv.NewWriter(&table.buffer)
	table.writer.UseCRLF = true

	if err := table.writer.Write(columns); err != nil {
		return nil, err
	}

	return table, nil
}

func (table *tableWriter) write(values ...string) error {
	if len(values) != len(table.columns) {
		return fmt.Errorf("backup: %d values for %d columns", len(values), len(table.columns))
	}

	escaped := make([]string, len(values))
	for i, value := range values {
		escaped[i] = Escape(value)
	}

	table.rows++
	return table.writer.Write(escaped)
}

func (table *tableWriter) bytes() ([]byte, error) {
	table.writer.Flush()
	if err := table.writer.Error(); err != nil {
		return nil, err
	}

	return table.buffer.Bytes(), nil
}

// readTable reads a CSV written by tableWriter into rows keyed by header name, unescaped. Columns
// are matched by name, so a file from another version with more or fewer columns still reads.
func readTable(reader io.Reader) ([]map[string]string, error) {
	content, err := io.ReadAll(reader)
	if err != nil {
		return nil, err
	}

	csvReader := csv.NewReader(bytes.NewReader(bytes.TrimPrefix(content, []byte(utf8BOM))))
	csvReader.FieldsPerRecord = -1

	records, err := csvReader.ReadAll()
	if err != nil {
		return nil, err
	}

	rows := []map[string]string{}
	if len(records) == 0 {
		return rows, nil
	}

	header := records[0]
	for _, record := range records[1:] {
		row := make(map[string]string, len(header))
		for i, column := range header {
			if i < len(record) {
				row[column] = Unescape(record[i])
			}
		}
		rows = append(rows, row)
	}

	return rows, nil
}

func formatUint(value uint) string {
	return strconv.FormatUint(uint64(value), 10)
}

func formatUintPtr(value *uint) string {
	if value == nil {
		return ""
	}
	return formatUint(*value)
}

func formatIntPtr(value *int) string {
	if value == nil {
		return ""
	}
	return strconv.Itoa(*value)
}

func formatBool(value bool) string {
	return strconv.FormatBool(value)
}

func formatBoolPtr(value *bool) string {
	if value == nil {
		return ""
	}
	return formatBool(*value)
}

func formatDecimalPtr(value *decimal.Decimal) string {
	if value == nil {
		return ""
	}
	return value.String()
}

func formatStringPtr(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

// formatDay writes a calendar day. Receipt dates are stored as midnight UTC, so the day is read in UTC.
func formatDay(value time.Time) string {
	return value.UTC().Format(time.DateOnly)
}

// formatInstant writes a moment in UTC with its full precision.
func formatInstant(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339Nano)
}

func formatInstantPtr(value *time.Time) string {
	if value == nil {
		return ""
	}
	return formatInstant(*value)
}
