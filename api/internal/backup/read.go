package backup

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path"
	"strings"
)

var (
	ErrNotABackup    = errors.New("backup: not a CartVibe export")
	ErrFormatTooNew  = errors.New("backup: made by a newer CartVibe")
	ErrUnsafeEntry   = errors.New("backup: unsafe entry name")
	ErrEntryMismatch = errors.New("backup: entry does not match the manifest")
	ErrMissingEntry  = errors.New("backup: entry missing")
)

const maxManifestBytes = int64(16 << 20)

// Archive is an opened export. Entry names are never used as paths on disk: a reader asks for a
// table by name or for a file by the entry name a table row gives.
type Archive struct {
	Manifest Manifest
	files    map[string]*zip.File
	entries  map[string]ManifestEntry
}

// OpenArchive reads and checks the manifest of an export. It refuses a ZIP whose entry names could
// escape a folder, one that is not a CartVibe export and one made by a newer format version.
func OpenArchive(reader io.ReaderAt, size int64) (*Archive, error) {
	zipReader, err := zip.NewReader(reader, size)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrNotABackup, err)
	}

	archive := &Archive{files: map[string]*zip.File{}, entries: map[string]ManifestEntry{}}
	for _, file := range zipReader.File {
		if !safeEntryName(file.Name) {
			return nil, fmt.Errorf("%w: %q", ErrUnsafeEntry, file.Name)
		}
		archive.files[file.Name] = file
	}

	manifestFile, ok := archive.files[ManifestName]
	if !ok {
		return nil, ErrNotABackup
	}
	manifestBytes, err := readLimited(manifestFile, maxManifestBytes)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(manifestBytes, &archive.Manifest); err != nil || archive.Manifest.Format != FormatName {
		return nil, ErrNotABackup
	}
	if archive.Manifest.FormatVersion > FormatVersion {
		return nil, ErrFormatTooNew
	}

	for _, entry := range archive.Manifest.Entries {
		archive.entries[entry.Name] = entry
	}

	return archive, nil
}

// Verify reads every entry the manifest lists and checks its size and SHA-256, so a truncated or
// altered download is caught before anything is imported.
func (archive *Archive) Verify() error {
	for _, entry := range archive.Manifest.Entries {
		if _, err := archive.read(entry.Name); err != nil {
			return err
		}
	}
	return nil
}

// Table returns a table's rows keyed by column name, or no rows for a table this export does not
// have (a file from an older version).
func (archive *Archive) Table(name string) ([]map[string]string, error) {
	if _, ok := archive.entries[tableEntryName(name)]; !ok {
		return []map[string]string{}, nil
	}

	content, err := archive.read(tableEntryName(name))
	if err != nil {
		return nil, err
	}

	return readTable(strings.NewReader(string(content)))
}

// File returns the bytes of a photo or PDF named by a table row.
func (archive *Archive) File(entryName string) ([]byte, error) {
	return archive.read(entryName)
}

// read returns an entry's bytes after checking them against the manifest; it never reads more than
// the manifest says, so a ZIP bomb stops at the declared size.
func (archive *Archive) read(name string) ([]byte, error) {
	entry, ok := archive.entries[name]
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrMissingEntry, name)
	}
	file, ok := archive.files[name]
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrMissingEntry, name)
	}

	content, err := readLimited(file, entry.Bytes)
	if err != nil {
		return nil, err
	}

	sum := sha256.Sum256(content)
	if int64(len(content)) != entry.Bytes || hex.EncodeToString(sum[:]) != entry.Sha256 {
		return nil, fmt.Errorf("%w: %s", ErrEntryMismatch, name)
	}

	return content, nil
}

func readLimited(file *zip.File, limit int64) ([]byte, error) {
	reader, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer reader.Close()

	content, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(content)) > limit {
		return nil, fmt.Errorf("%w: %s is larger than declared", ErrEntryMismatch, file.Name)
	}

	return content, nil
}

func safeEntryName(name string) bool {
	if name == "" || strings.ContainsAny(name, "\\\x00") || strings.HasPrefix(name, "/") {
		return false
	}
	cleaned := path.Clean(name)
	return cleaned == name && cleaned != ".." && !strings.HasPrefix(cleaned, "../")
}

// Has reports whether the manifest lists an entry (a photo can be listed in a table but missing from
// the ZIP when it was deleted while the export ran).
func (archive *Archive) Has(entryName string) bool {
	_, listed := archive.entries[entryName]
	_, present := archive.files[entryName]
	return listed && present
}
