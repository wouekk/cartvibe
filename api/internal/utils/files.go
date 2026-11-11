package utils

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/gabriel-vasile/mimetype"
)

func WriteFile(path string, data []byte) error {
	// 0o644: the owner (the API's user) can rewrite the file. This was the decimal 777 (octal 1411), which left every
	// new file read-only to its owner, so a file written twice (the shop logo index) failed on its second write.
	err := os.WriteFile(path, data, 0o644)
	if err != nil {
		return err
	}

	return nil
}

func ReadFile(path string) ([]byte, error) {
	bytes, err := os.ReadFile(path)
	if err != nil {
		return nil, nil
	}

	return bytes, nil
}

func FileExists(path string) bool {
	_, err := os.Stat(path)
	return !os.IsNotExist(err)
}

func DirectoryExists(dir string, createIfNotExist bool) error {
	_, err := os.Stat(dir)
	if errors.Is(err, os.ErrNotExist) && createIfNotExist {
		err = MakeDirectory(dir)
		if err != nil {
			return err
		}
	}

	if errors.Is(err, os.ErrNotExist) {
		return err
	}

	return nil
}

func MakeDirectory(dir string) error {
	err := os.Mkdir(dir, os.ModePerm)
	if err != nil {
		return err
	}

	return nil
}

func ReadLastFileLine(filePath string) (string, error) {
	readFile, err := os.Open(filePath)
	if err != nil {
		if os.Getenv("ENV") == "test" {
			return "", nil
		}

		return "", err
	}

	fileScanner := bufio.NewScanner(readFile)
	fileScanner.Split(bufio.ScanLines)
	var fileLines []string

	for fileScanner.Scan() {
		fileLines = append(fileLines, fileScanner.Text())
	}

	err = readFile.Close()
	if err != nil {
		return "", err
	}

	if len(fileLines) == 0 {
		return "", nil
	}

	return fileLines[len(fileLines)-1], nil
}

// BuildGroupPathString is a household's folder of receipt files: data/<groupId>. The name is the numeric id only,
// so nothing a person typed reaches the path. (Until 2026-11 the folder was data/<groupId>-<groupName>: a rename
// had to move it, and every path built from it had to be checked against a crafted name.)
func BuildGroupPathString(groupId string) (string, error) {
	if !isNumericId(groupId) {
		return "", fmt.Errorf("group id %q is not a number", groupId)
	}

	dataDir, err := GetDataDir()
	if err != nil {
		return "", err
	}

	groupPath := filepath.Join(dataDir, groupId)
	if err := AssertWithinDataDir(groupPath); err != nil {
		return "", err
	}

	return groupPath, nil
}

// BuildReceiptFilePathString is one receipt file: data/<groupId>/<fileId>. Both are numeric ids, and the file has
// no extension: what it is is read from its bytes (FileData.FileType), and the name it was uploaded under lives in
// the database only (FileData.Name).
func BuildReceiptFilePathString(groupId string, fileId string) (string, error) {
	if !isNumericId(fileId) {
		return "", fmt.Errorf("file id %q is not a number", fileId)
	}

	groupPath, err := BuildGroupPathString(groupId)
	if err != nil {
		return "", err
	}

	path := filepath.Join(groupPath, fileId)
	if err := AssertWithinDataDir(path); err != nil {
		return "", err
	}

	return path, nil
}

// isNumericId reports a non-empty string of digits.
func isNumericId(id string) bool {
	if id == "" {
		return false
	}
	for _, character := range id {
		if character < '0' || character > '9' {
			return false
		}
	}
	return true
}

func GetMimeType(bytes []byte) *mimetype.MIME {
	return mimetype.Detect(bytes)
}
