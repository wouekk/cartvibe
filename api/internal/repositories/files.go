package repositories

import (
	"archive/zip"
	"bytes"
	"cartvibe/api/internal/constants"
	config "cartvibe/api/internal/env"
	"cartvibe/api/internal/imagetool"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/gabriel-vasile/mimetype"
	"gorm.io/gorm"
)

type FileRepository struct {
	BaseRepository
}

func NewFileRepository(tx *gorm.DB) FileRepository {
	repository := FileRepository{BaseRepository: BaseRepository{
		DB: GetDB(),
		TX: tx,
	}}
	return repository
}

// BuildFilePath is where a receipt's file is stored: data/<groupId>/<fileId>, the household being the receipt's.
// Ids only: no name a person typed is part of it. The receipt is looked up for its household, on the repository's
// transaction when it has one (a receipt created in it is not visible outside yet).
func (repository FileRepository) BuildFilePath(receiptId string, receiptImageId string) (string, error) {
	db := repository.GetDB()
	var receipt models.Receipt

	err := db.Model(models.Receipt{}).Where("id = ?", receiptId).Select("group_id").Find(&receipt).Error
	if err != nil {
		return "", err
	}

	return utils.BuildReceiptFilePathString(utils.UintToString(receipt.GroupId), receiptImageId)
}

// BuildGroupPath is a household's folder of receipt files: data/<groupId>.
func (repository FileRepository) BuildGroupPath(groupId uint) (string, error) {
	return utils.BuildGroupPathString(utils.UintToString(groupId))
}

func (repository FileRepository) GetBytesForFileData(fileData models.FileData) ([]byte, error) {
	path, err := repository.BuildFilePath(utils.UintToString(fileData.ReceiptId), utils.UintToString(fileData.ID))

	if err != nil {
		return nil, err
	}

	fileBytes, err := utils.ReadDataFile(path)
	if err != nil {
		return nil, err
	}

	resultBytes, err := repository.GetBytesFromImageBytes(fileBytes)
	if err != nil {
		return nil, err
	}

	return resultBytes, nil
}

func (repository FileRepository) GetBytesFromImageBytes(imageData []byte) ([]byte, error) {
	var bytes []byte
	validatedType, err := repository.ValidateFileType(imageData)
	if err != nil {
		return nil, err
	}

	if validatedType == constants.ApplicationPdf {
		bytes, err = repository.ConvertPdfToJpg(imageData)
		if err != nil {
			return nil, err
		}
	} else if validatedType == constants.ImageHeic {
		bytes, err = repository.ConvertHeicToJpg(imageData)
		if err != nil {
			return nil, err
		}
	} else {
		bytes = imageData
	}

	return bytes, nil
}

// BuildDisplayImageString turns raw file bytes into a data URI a browser can
// render in an <img>: a PDF rasterizes, HEIC transcodes, anything else passes
// through.
//
// Every browser-facing image response goes through this. Calling
// BuildEncodedImageString on unconverted bytes is the trap it closes — GetFileType
// relabels a PDF as image/jpeg WITHOUT converting it, so the result is a
// well-formed data URI carrying bytes the browser cannot decode: a broken image
// with no error anywhere.
//
// Reading the bytes stays the caller's job, because that half is a trust boundary
// and legitimately differs — data/ goes through the containment-checked
// utils.ReadDataFile, temp/ through os.ReadFile plus AssertWithinTempDirectory,
// and a multipart upload has no path at all. This half is identical everywhere.
func (repository FileRepository) BuildDisplayImageString(raw []byte) (string, error) {
	converted, err := repository.GetBytesFromImageBytes(raw)
	if err != nil {
		return "", err
	}

	return repository.BuildEncodedImageString(converted)
}

func (repository FileRepository) IsImage(imageData []byte) (bool, error) {
	validatedFileType, err := repository.ValidateFileType(imageData)
	if err != nil {
		return false, err
	}

	isImage, err := regexp.Match(constants.AnyImage, []byte(validatedFileType))
	if err != nil {
		return false, err
	}

	return isImage, nil
}

func (repository FileRepository) IsPdf(imageData []byte) (bool, error) {
	validatedFileType, err := repository.ValidateFileType(imageData)
	if err != nil {
		return false, err
	}

	isPdf, err := regexp.Match(constants.ApplicationPdf, []byte(validatedFileType))
	if err != nil {
		return false, err
	}

	return isPdf, nil
}

// receiptFileTypes are the formats a receipt file may have, detected from its bytes. ImageMagick reads every upload,
// so this list matches the modules docker/imagemagick/policy.xml allows; keep the two in step. Anything else (BMP,
// PSD, SVG, JPEG 2000, ICO and the rest) never reaches a decoder.
var receiptFileTypes = map[string]bool{
	"image/jpeg":             true,
	"image/png":              true,
	"image/webp":             true,
	"image/gif":              true,
	"image/tiff":             true,
	"image/heic":             true,
	"image/heic-sequence":    true,
	"image/heif":             true,
	"image/heif-sequence":    true,
	constants.ApplicationPdf: true,
}

func (repository FileRepository) ValidateFileType(bytes []byte) (string, error) {
	fileType := utils.GetMimeType(bytes).String()
	if receiptFileTypes[fileType] {
		return fileType, nil
	}

	return "", errors.New("invalid file type")
}

func (repository FileRepository) ValidateJsonFileType(bytes []byte) (string, error) {
	fileType := mimetype.Detect(bytes).String()
	acceptedFileTypes := []string{constants.ApplicationJson}

	for _, acceptedFileType := range acceptedFileTypes {
		matched, _ := regexp.Match(acceptedFileType, []byte(fileType))

		if matched {
			return fileType, nil
		}
	}

	return "", errors.New("invalid file type")
}

// ConvertHeicToJpg turns an iPhone photo into a JPEG a browser shows. The picture is the file's first image; a
// HEIC may carry more (a depth map, a burst).
func (repository FileRepository) ConvertHeicToJpg(bytes []byte) ([]byte, error) {
	return imagetool.Convert(context.Background(), bytes, imagetool.Conversion{
		Operations: []string{"-quality", "95"},
		Format:     "jpeg",
	})
}

// visionImageMaxSide is the longest edge, in pixels, of an image sent to a vision model. Receipts stay readable well
// below it, and it keeps the request small enough for local models.
const (
	visionImageMaxSide = 2048
	visionImageQuality = 85
)

// NormalizeImageForVision turns whatever a camera or a scanner produced into the one thing every vision model takes: a
// baseline sRGB JPEG, upright, on an opaque white background, no larger than visionImageMaxSide on its long edge.
// HEIC/HEIF, PNG with transparency, WebP, TIFF, CMYK JPEG and multi-frame files all come out the same. The first frame
// is used. The stored original is never touched; this runs on the copy that is sent to the model.
func (repository FileRepository) NormalizeImageForVision(bytes []byte) ([]byte, error) {
	return repository.toOpaqueJpeg(bytes, visionImageMaxSide, visionImageQuality)
}

// toOpaqueJpeg is the conversion behind NormalizeImageForVision and the stored display copies: the first frame,
// upright, on white, sRGB, its long edge at most maxSide (never enlarged), as a JPEG of the given quality.
func (repository FileRepository) toOpaqueJpeg(bytes []byte, maxSide uint, quality uint) ([]byte, error) {
	operations := []string{
		"-auto-orient",
		// Flatten any transparency onto white: JPEG has no alpha, and a black background hides dark receipt text.
		"-background", "white", "-alpha", "remove",
		"-colorspace", "sRGB",
	}
	operations = append(operations, imagetool.ShrinkToFit(maxSide)...)
	operations = append(operations, "-strip", "-quality", strconv.FormatUint(uint64(quality), 10))

	return imagetool.Convert(context.Background(), bytes, imagetool.Conversion{Operations: operations, Format: "jpeg"})
}

// pdfRasterizationDpi returns the DPI used to rasterize PDFs into images. It is
// configured via the PdfDpi system setting; when unset (0) or out of the
// supported range it falls back to defaultPdfDpi. 300 DPI is a common
// document-scanning resolution that preserves small receipt text for OCR and
// vision models while keeping output sizes and memory use reasonable.
const (
	defaultPdfDpi = 300.0
	minPdfDpi     = 72.0
	maxPdfDpi     = 1200.0
)

func (repository FileRepository) pdfRasterizationDpi() float64 {
	systemSettingsRepository := NewSystemSettingsRepository(repository.DB)
	systemSettings, err := systemSettingsRepository.GetSystemSettings()
	if err != nil {
		return defaultPdfDpi
	}

	dpi := float64(systemSettings.PdfDpi)
	if dpi < minPdfDpi || dpi > maxPdfDpi {
		return defaultPdfDpi
	}
	return dpi
}

// ConvertPdfToJpg draws every page of a PDF and stacks them, top to bottom, into one JPEG.
func (repository FileRepository) ConvertPdfToJpg(bytes []byte) ([]byte, error) {
	// PDFs are vector documents with no inherent pixel resolution. ImageMagick
	// rasterizes them at a default of 72 DPI unless a resolution is set BEFORE
	// the file is read, which produces low-resolution images that degrade OCR
	// and vision-model accuracy. Set the rasterization density first; it is
	// configurable via the PdfDpi system setting (default 300).
	dpi := strconv.FormatFloat(repository.pdfRasterizationDpi(), 'f', -1, 64)

	return imagetool.Convert(context.Background(), bytes, imagetool.Conversion{
		ReadSettings: []string{"-density", dpi},
		AllFrames:    true,
		Operations: []string{
			// A page comes back transparent where nothing is drawn, and JPEG has no alpha: put each page on white.
			"-background", "white", "-alpha", "remove", "-alpha", "off",
			"-append",
		},
		Format: "jpeg",
	})
}

func (repository FileRepository) WriteTempFile(data []byte) (string, error) {
	tempPath := repository.GetTempDirectoryPath()
	utils.MakeDirectory(tempPath)

	validatedFileType, err := repository.ValidateFileType(data)
	if err != nil {
		return "", err
	}

	parts := strings.Split(validatedFileType, "/")
	if len(parts) != 2 {
		return "", errors.New("malformed mime type")
	}

	fileType := parts[1]

	filePath, err := repository.BuildTempFilePath(fileType)
	if err != nil {
		return "", err
	}

	err = utils.WriteFile(filePath, data)
	if err != nil {
		os.Remove(filePath)
		return "", err
	}

	return filePath, nil
}

func (repository FileRepository) BuildTempFilePath(fileType string) (string, error) {
	tempPath := repository.GetTempDirectoryPath()
	// Ensure the temp directory exists before returning a path under it.
	// ConvertPdfToJpg writes here directly, and on a fresh checkout/runtime the
	// directory may not exist yet, which would fail the subsequent write.
	utils.MakeDirectory(tempPath)

	filename, err := utils.GetRandomString(10)
	if err != nil {
		return "", err
	}

	filePath := tempPath + "/" + filename
	filePath = filePath + "." + fileType
	return filePath, nil
}

func (repository FileRepository) GetFileType(bytes []byte) (string, error) {
	fileType, err := repository.ValidateFileType(bytes)
	if err != nil {
		return "", err
	}

	isPdf, err := repository.IsPdf(bytes)
	if err != nil {
		return "", err
	}

	if isPdf {
		fileType = "image/jpeg"
	}

	return fileType, nil
}

func (repository FileRepository) BuildEncodedImageString(bytes []byte) (string, error) {
	fileType, err := repository.GetFileType(bytes)
	if err != nil {
		return "", err
	}

	return utils.BuildDataURI(fileType, bytes), nil
}

func (repository FileRepository) CreateZipFromTempFiles(zipFilename string, filenames []string) (string, error) {
	tempPath := repository.GetTempDirectoryPath()
	zipPath := filepath.Join(tempPath, zipFilename)

	zipFile, err := os.Create(zipPath)
	if err != nil {
		return "", err
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	for _, filename := range filenames {
		filePath := filepath.Join(tempPath, filename)
		file, err := os.Open(filePath)
		if err != nil {
			return "", err
		}
		defer file.Close()

		info, err := file.Stat()
		if err != nil {
			return "", err
		}

		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return "", err
		}

		header.Name = filename
		header.Method = zip.Deflate

		writer, err := zipWriter.CreateHeader(header)
		if err != nil {
			return "", err
		}

		if _, err = io.Copy(writer, file); err != nil {
			return "", err
		}
	}

	return zipPath, nil
}

func (repository FileRepository) ZipFiles(filenames []string, fileContents [][]byte) ([]byte, error) {
	if len(filenames) != len(fileContents) {
		return nil, errors.New("number of filenames does not match number of file contents")
	}

	if len(filenames) == 0 {
		return nil, errors.New("no files to zip")
	}

	zipBuffer := new(bytes.Buffer)
	zipWriter := zip.NewWriter(zipBuffer)

	for i, filename := range filenames {
		file, err := zipWriter.Create(filename)
		if err != nil {
			return nil, fmt.Errorf("error creating file %s in zip: %w", filename, err)
		}

		_, err = file.Write(fileContents[i])
		if err != nil {
			return nil, fmt.Errorf("error writing content for file %s in zip: %w", filename, err)
		}
	}

	err := zipWriter.Close()
	if err != nil {
		return nil, fmt.Errorf("error closing zip writer: %w", err)
	}

	return zipBuffer.Bytes(), nil
}

func (repository FileRepository) GetTempDirectoryPath() string {
	return filepath.Join(config.GetBasePath(), "temp")
}

// AssertWithinTempDirectory returns an error when path resolves outside temp/.
//
// temp/ is deliberately exempt from the data-scoped helpers (see api/CLAUDE.md →
// "3. Security invariants", Paths): those resolve against data/ and
// would reject every temp path. That exemption holds for paths the server builds
// itself, but a temp path read back out of a job's payload is attacker-adjacent
// — the payload is JSON on the job's row — so anything sourced from one must come
// through here before it is opened or served.
func (repository FileRepository) AssertWithinTempDirectory(path string) error {
	return utils.AssertWithinDir(repository.GetTempDirectoryPath(), path)
}
