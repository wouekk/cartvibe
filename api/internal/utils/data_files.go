package utils

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// GetDataDir returns the root directory under which all group and receipt files
// are stored. It is the single source of truth for that location and the trust
// boundary the data-file helpers below enforce.
func GetDataDir() (string, error) {
	basePath, err := os.Getwd()
	if err != nil {
		return "", err
	}

	return filepath.Join(basePath, "data"), nil
}

// AssertWithinDir returns an error when path resolves outside baseDir. It is the
// shared containment primitive behind every path-traversal (CWE-22) check in the
// codebase.
//
// baseDir is a parameter rather than a constant because the trust boundaries
// genuinely differ: the data directory is resolved from the working directory,
// while the temp directory hangs off config.GetBasePath(), which BASE_PATH can
// override. Callers should use one of the scoped wrappers (AssertWithinDataDir
// here, FileRepository.AssertWithinTempDirectory for temp/) rather than naming a
// base themselves, so a new trust boundary is always a deliberate addition.
//
// The check is purely lexical — no EvalSymlinks — which matches how every path
// in the codebase is constructed and keeps the two wrappers from diverging.
func AssertWithinDir(baseDir string, path string) error {
	relativePath, err := filepath.Rel(baseDir, path)
	if err != nil ||
		relativePath == ".." ||
		strings.HasPrefix(relativePath, ".."+string(os.PathSeparator)) {
		return fmt.Errorf("path %q is outside %q", path, baseDir)
	}

	return nil
}

// AssertWithinDataDir returns an error when path resolves outside the data
// directory. It is the containment check that defends every data-file operation
// against path traversal (CWE-22) from untrusted input such as a group name, and
// is exported so path builders can guarantee containment at construction time.
func AssertWithinDataDir(path string) error {
	dataDir, err := GetDataDir()
	if err != nil {
		return err
	}

	return AssertWithinDir(dataDir, path)
}

// MakeDataDirectory creates a directory inside the data directory, refusing any
// path that would escape it.
func MakeDataDirectory(path string) error {
	if err := AssertWithinDataDir(path); err != nil {
		return err
	}

	return MakeDirectory(path)
}

// RemoveDataPath removes a single file or empty directory inside the data
// directory, refusing any path that would escape it.
func RemoveDataPath(path string) error {
	if err := AssertWithinDataDir(path); err != nil {
		return err
	}

	return os.Remove(path)
}

// RemoveAllInDataDir recursively removes a path inside the data directory,
// refusing any path that would escape it.
func RemoveAllInDataDir(path string) error {
	if err := AssertWithinDataDir(path); err != nil {
		return err
	}

	return os.RemoveAll(path)
}

// BuildAvatarPathString is where a person's avatar photo is stored: data/avatars/<userId>. The name is the numeric
// id only, so nothing a person typed reaches the path.
func BuildAvatarPathString(userId uint) (string, error) {
	dataDir, err := GetDataDir()
	if err != nil {
		return "", err
	}

	path := filepath.Join(dataDir, "avatars", UintToString(userId))
	if err := AssertWithinDataDir(path); err != nil {
		return "", err
	}
	return path, nil
}

// DataPathExists reports whether a file or directory exists inside the data
// directory, refusing any path that would escape it.
func DataPathExists(path string) (bool, error) {
	if err := AssertWithinDataDir(path); err != nil {
		return false, err
	}

	_, err := os.Stat(path)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return false, err
}

// RenameDataPath renames a path within the data directory, refusing to move a
// file into or out of a location that would escape it.
func RenameDataPath(oldPath string, newPath string) error {
	if err := AssertWithinDataDir(oldPath); err != nil {
		return err
	}
	if err := AssertWithinDataDir(newPath); err != nil {
		return err
	}

	return os.Rename(oldPath, newPath)
}

// EnsureDataDirectory creates path inside the data directory if it does not
// already exist, refusing any path that would escape it. Unlike
// MakeDataDirectory it is tolerant of an already-existing directory, and it
// makes the data directory itself when that is missing too (a server started
// in a new folder), so a household's first file does not depend on someone
// having made data/ by hand.
func EnsureDataDirectory(path string) error {
	if err := AssertWithinDataDir(path); err != nil {
		return err
	}

	return os.MkdirAll(path, os.ModePerm)
}

// WriteDataFile writes data to a file inside the data directory, refusing any
// path that would escape it.
func WriteDataFile(path string, data []byte) error {
	if err := AssertWithinDataDir(path); err != nil {
		return err
	}

	return WriteFile(path, data)
}

// ReadDataFile reads a file inside the data directory, refusing any path that
// would escape it. Unlike ReadFile, it propagates read errors to the caller.
func ReadDataFile(path string) ([]byte, error) {
	if err := AssertWithinDataDir(path); err != nil {
		return nil, err
	}

	return os.ReadFile(path)
}

// ErrDataFileMissing is returned by DataFileSize for a path that does not exist.
var ErrDataFileMissing = errors.New("data file missing")

// DataFileSize returns the size of a file inside the data directory, refusing any path that would
// escape it, and ErrDataFileMissing when it is not there.
func DataFileSize(path string) (int64, error) {
	if err := AssertWithinDataDir(path); err != nil {
		return 0, err
	}

	info, err := os.Stat(path)
	if errors.Is(err, os.ErrNotExist) {
		return 0, ErrDataFileMissing
	}
	if err != nil {
		return 0, err
	}

	return info.Size(), nil
}

// IsSafePathComponent reports whether name is safe to embed in a single
// filesystem path component: non-empty, no NUL byte, no path separator, and not
// a "." / ".." traversal element. It is used to reject path traversal (CWE-22)
// in user-supplied names before they are persisted or used to build a path.
func IsSafePathComponent(name string) bool {
	if name == "" || strings.ContainsRune(name, 0) {
		return false
	}
	if strings.ContainsRune(name, '/') ||
		strings.ContainsRune(name, '\\') ||
		strings.ContainsRune(name, os.PathSeparator) {
		return false
	}
	if name == "." || name == ".." {
		return false
	}

	return filepath.IsLocal(name)
}

// ImageCopyVariants are the copies of a receipt image the server keeps for a browser: "display" to look at, "thumb"
// for a small preview.
var ImageCopyVariants = map[string]bool{"display": true, "thumb": true}

// BuildImageCopyDirString is where those copies live: data/derived. Outside the household folders on purpose, so a
// household rename (which moves its folder) has nothing to carry along.
func BuildImageCopyDirString() (string, error) {
	dataDir, err := GetDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dataDir, "derived"), nil
}

// BuildImageCopyPathString is one copy: data/derived/<fileId>-<variant>.jpg. The name is the numeric id and a
// variant from ImageCopyVariants only, so nothing a person typed reaches the path.
func BuildImageCopyPathString(fileId uint, variant string) (string, error) {
	if !ImageCopyVariants[variant] {
		return "", errors.New("unknown image variant")
	}
	dir, err := BuildImageCopyDirString()
	if err != nil {
		return "", err
	}

	path := filepath.Join(dir, UintToString(fileId)+"-"+variant+".jpg")
	if err := AssertWithinDataDir(path); err != nil {
		return "", err
	}
	return path, nil
}
