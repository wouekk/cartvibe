package repositories

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"

	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"
)

// A receipt photo used to reach the browser as base64 inside JSON: a third larger than the file, never cached, and
// a HEIC or a PDF was converted again on every view. The server now keeps two JPEG copies of each image and serves
// them as files (GET /receiptImage/{id}/file): "display" for the viewer and "thumb" for a small preview. A copy is
// made the first time it is asked for (and for a new upload, right away), then read from disk.
//
// The copies are a cache, not data: they live in data/derived, are named by the image's id alone, are left out of
// exports, and can be deleted at any time. The original stays the only source and is never changed.
const (
	ImageCopyDisplay = "display"
	ImageCopyThumb   = "thumb"

	// The long edge of each copy, in pixels. A receipt stays readable at 2000; a thumbnail fills a list row.
	imageCopyDisplayMaxSide = 2000
	imageCopyThumbMaxSide   = 320
	imageCopyQuality        = 82
)

// imageCopyWrites numbers the files being written, so two writers never share a pending name.
var imageCopyWrites atomic.Uint64

func isOlderThanAnHour(info os.FileInfo) bool {
	return time.Since(info.ModTime()) > time.Hour
}

func imageCopyMaxSide(variant string) uint {
	if variant == ImageCopyThumb {
		return imageCopyThumbMaxSide
	}
	return imageCopyDisplayMaxSide
}

// ImageCopyPath returns the path of the stored copy of an image, making the copy first when there is none yet.
func (repository FileRepository) ImageCopyPath(fileData models.FileData, variant string) (string, error) {
	path, err := utils.BuildImageCopyPathString(fileData.ID, variant)
	if err != nil {
		return "", err
	}

	exists, err := utils.DataPathExists(path)
	if err != nil {
		return "", err
	}
	if exists {
		return path, nil
	}

	// GetBytesForFileData rasterizes a PDF and transcodes HEIC; the rest passes through.
	original, err := repository.GetBytesForFileData(fileData)
	if err != nil {
		return "", err
	}
	copyBytes, err := repository.toOpaqueJpeg(original, imageCopyMaxSide(variant), imageCopyQuality)
	if err != nil {
		return "", err
	}

	if err := storeImageCopy(path, copyBytes); err != nil {
		return "", err
	}

	return path, nil
}

// storeImageCopy writes a finished copy under its name. The folder of the copies is made with the first copy and
// is there for every later one, so it is ensured, never made: making it failed with "file exists" for every copy
// after the first (2026-11-12). The copy is written beside its final name and renamed, so a request never reads
// half a file, and two requests that make the same copy at once both end with a whole one.
func storeImageCopy(path string, copyBytes []byte) error {
	if err := utils.EnsureDataDirectory(filepath.Dir(path)); err != nil {
		return err
	}

	pending := fmt.Sprintf("%s.%d-%d.tmp", path, os.Getpid(), imageCopyWrites.Add(1))
	if err := utils.WriteDataFile(pending, copyBytes); err != nil {
		return err
	}
	if err := utils.RenameDataPath(pending, path); err != nil {
		utils.RemoveDataPath(pending)
		return err
	}

	return nil
}

// MakeImageCopies makes the display copy of a new upload, so the first view does not wait for it (the thumbnail
// is made when something first asks for one). A failure is logged, never returned: the copy is made again when
// it is asked for.
func (repository FileRepository) MakeImageCopies(fileData models.FileData) {
	for _, variant := range []string{ImageCopyDisplay} {
		if _, err := repository.ImageCopyPath(fileData, variant); err != nil {
			logging.LogStd(logging.LOG_LEVEL_ERROR, "image copies: could not make the "+variant+" copy of image "+utils.UintToString(fileData.ID)+": "+err.Error())
		}
	}
}

// RemoveImageCopies deletes the stored copies of an image that is being removed.
func (repository FileRepository) RemoveImageCopies(fileId uint) {
	for variant := range utils.ImageCopyVariants {
		path, err := utils.BuildImageCopyPathString(fileId, variant)
		if err != nil {
			continue
		}
		if exists, _ := utils.DataPathExists(path); exists {
			utils.RemoveDataPath(path)
		}
	}
}

// SweepOrphanedImageCopies deletes the copies whose image is gone. Deleting a receipt or a household removes its
// images along many paths; rather than teach each of them about the cache, the daily clean-up asks the database
// which copies still have an image. It returns how many files it removed.
func (repository FileRepository) SweepOrphanedImageCopies() (int, error) {
	dir, err := utils.BuildImageCopyDirString()
	if err != nil {
		return 0, err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}

	// <fileId>-<variant>.jpg, and the .tmp files an interrupted write left behind.
	byImage := map[uint][]string{}
	removed := 0
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() {
			continue
		}
		if strings.HasSuffix(name, ".tmp") {
			if info, infoErr := entry.Info(); infoErr == nil && isOlderThanAnHour(info) {
				if utils.RemoveDataPath(filepath.Join(dir, name)) == nil {
					removed++
				}
			}
			continue
		}
		id, err := utils.StringToUint(strings.SplitN(name, "-", 2)[0])
		if err != nil {
			continue
		}
		byImage[id] = append(byImage[id], name)
	}
	if len(byImage) == 0 {
		return removed, nil
	}

	ids := make([]uint, 0, len(byImage))
	for id := range byImage {
		ids = append(ids, id)
	}
	const batch = 500
	for start := 0; start < len(ids); start += batch {
		chunk := ids[start:min(start+batch, len(ids))]
		var existing []uint
		if err := repository.GetDB().Model(&models.FileData{}).Where("id IN ?", chunk).Pluck("id", &existing).Error; err != nil {
			return removed, err
		}
		alive := map[uint]bool{}
		for _, id := range existing {
			alive[id] = true
		}
		for _, id := range chunk {
			if alive[id] {
				continue
			}
			for _, name := range byImage[id] {
				if utils.RemoveDataPath(filepath.Join(dir, name)) == nil {
					removed++
				}
			}
		}
	}

	return removed, nil
}
