package repositories

import (
	"bytes"
	"image"
	"os"
	"path/filepath"
	"testing"
	"time"

	"cartvibe/api/internal/imagetool/imagetooltest"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"

	"github.com/gabriel-vasile/mimetype"
)

// storeTestImage creates a household, a receipt and one stored image of the given size.
func storeTestImage(t *testing.T, width, height int) models.FileData {
	t.Helper()
	CreateTestUser()
	CreateTestGroup()
	receipt := models.Receipt{Name: "Corner shop", GroupId: 1, PaidByUserID: 1, Date: time.Now()}
	if err := GetDB().Create(&receipt).Error; err != nil {
		t.Fatal(err)
	}

	fileData, err := NewReceiptImageRepository(nil).CreateReceiptImage(
		models.FileData{Name: "receipt.png", ReceiptId: receipt.ID}, writePng(t, width, height))
	if err != nil {
		t.Fatal(err)
	}
	return fileData
}

func cleanUpImageCopies(t *testing.T) {
	t.Helper()
	t.Cleanup(func() {
		if dir, err := utils.BuildImageCopyDirString(); err == nil {
			os.RemoveAll(dir)
		}
		if dataDir, err := utils.GetDataDir(); err == nil {
			os.RemoveAll(dataDir)
		}
		TruncateTestDb()
	})
}

// Needs ImageMagick, so it runs in CI and not under the Windows stubs.
func TestImageCopyIsMadeOnceAsASmallJpeg(t *testing.T) {
	imagetooltest.RequireMagick(t)

	cleanUpImageCopies(t)
	repository := NewFileRepository(nil)
	fileData := storeTestImage(t, 3000, 1500)

	path, err := repository.ImageCopyPath(fileData, ImageCopyThumb)
	if err != nil {
		t.Fatal(err)
	}
	copyBytes, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if mime := mimetype.Detect(copyBytes).String(); mime != "image/jpeg" {
		t.Fatalf("a copy is a JPEG, got %s", mime)
	}
	decoded, _, err := image.Decode(bytes.NewReader(copyBytes))
	if err != nil {
		t.Fatal(err)
	}
	if decoded.Bounds().Dx() != imageCopyThumbMaxSide || decoded.Bounds().Dy() != imageCopyThumbMaxSide/2 {
		t.Errorf("the thumbnail's long edge is %d and the proportions are kept, got %v", imageCopyThumbMaxSide, decoded.Bounds())
	}

	// The second request reads the file: the original can be gone and the copy still answers.
	original, _ := repository.BuildFilePath(utils.UintToString(fileData.ReceiptId), utils.UintToString(fileData.ID), fileData.Name)
	if err := os.Remove(original); err != nil {
		t.Fatal(err)
	}
	again, err := repository.ImageCopyPath(fileData, ImageCopyThumb)
	if err != nil || again != path {
		t.Errorf("a copy that exists is not made again: %q, %v", again, err)
	}

	repository.RemoveImageCopies(fileData.ID)
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Errorf("RemoveImageCopies deletes the copy, stat says %v", err)
	}
}

func TestImageCopyPathRefusesAnUnknownVariant(t *testing.T) {
	if _, err := NewFileRepository(nil).ImageCopyPath(models.FileData{BaseModel: models.BaseModel{ID: 1}}, "../../etc"); err == nil {
		t.Error("only display and thumb are variants")
	}
}

// The sweep needs no ImageMagick: the copies are plain files named by the image's id.
func TestSweepRemovesTheCopiesOfImagesThatAreGone(t *testing.T) {
	cleanUpImageCopies(t)
	CreateTestUser()
	CreateTestGroup()
	receipt := models.Receipt{Name: "Corner shop", GroupId: 1, PaidByUserID: 1, Date: time.Now()}
	if err := GetDB().Create(&receipt).Error; err != nil {
		t.Fatal(err)
	}
	kept := models.FileData{Name: "kept.png", ReceiptId: receipt.ID}
	if err := GetDB().Create(&kept).Error; err != nil {
		t.Fatal(err)
	}

	dir, err := utils.BuildImageCopyDirString()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	write := func(name string, age time.Duration) string {
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, []byte("x"), 0644); err != nil {
			t.Fatal(err)
		}
		old := time.Now().Add(-age)
		os.Chtimes(path, old, old)
		return path
	}
	keptCopy := write(utils.UintToString(kept.ID)+"-display.jpg", 0)
	goneDisplay := write("987654-display.jpg", 0)
	goneThumb := write("987654-thumb.jpg", 0)
	staleWrite := write("987654-thumb.jpg.1-1.tmp", 2*time.Hour)
	freshWrite := write(utils.UintToString(kept.ID)+"-thumb.jpg.1-2.tmp", 0)

	removed, err := NewFileRepository(nil).SweepOrphanedImageCopies()
	if err != nil {
		t.Fatal(err)
	}
	if removed != 3 {
		t.Errorf("the two copies of the deleted image and the stale write go: %d removed", removed)
	}
	for _, path := range []string{goneDisplay, goneThumb, staleWrite} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Errorf("%s should be gone", filepath.Base(path))
		}
	}
	for _, path := range []string{keptCopy, freshWrite} {
		if _, err := os.Stat(path); err != nil {
			t.Errorf("%s should be kept: %v", filepath.Base(path), err)
		}
	}
}
