package services

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/imagetool"
	"cartvibe/api/internal/logging"
	"context"
	"fmt"
	"gorm.io/gorm"
	"os"
	"path/filepath"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/utils"
	"strings"
	"time"
)

// ocrImageMaxSide is the longest edge, in pixels, of an image prepared for Tesseract.
const ocrImageMaxSide = 3000

type OcrService struct {
	BaseService
	ReceiptProcessingSettings models.ReceiptProcessingSettings
}

func NewOcrService(tx *gorm.DB, receiptProcessingSettings models.ReceiptProcessingSettings) OcrService {
	service := OcrService{
		BaseService: BaseService{
			DB: repositories.GetDB(),
			TX: tx,
		},
		ReceiptProcessingSettings: receiptProcessingSettings,
	}

	return service
}

func (service OcrService) ReadImage(path string) (string, commands.UpsertSystemTaskCommand, error) {
	var text string
	startTime := time.Now()
	systemTaskCommand := commands.UpsertSystemTaskCommand{
		Type:                 models.OCR_PROCESSING,
		Status:               models.SYSTEM_TASK_SUCCEEDED,
		AssociatedEntityType: models.RECEIPT_PROCESSING_SETTINGS,
		AssociatedEntityId:   service.ReceiptProcessingSettings.ID,
		StartedAt:            time.Now(),
	}

	imageBytes, err := service.prepareImage(path)
	if err != nil {
		systemTaskCommand.Status = models.SYSTEM_TASK_FAILED
		systemTaskCommand.ResultDescription = err.Error()
		return "", systemTaskCommand, err
	}

	// Tesseract reads every image. EasyOCR is no longer in the image (it brought PyTorch, OpenCV and a bundled ffmpeg,
	// and started a new Python process per image): a setting that still names it is read with Tesseract.
	text, err = service.ReadImageWithTesseract(imageBytes)
	if err != nil {
		systemTaskCommand.Status = models.SYSTEM_TASK_FAILED
		systemTaskCommand.ResultDescription = err.Error()
		return "", systemTaskCommand, err
	}
	endTime := time.Now()
	elapsedTime := endTime.Sub(startTime)
	logging.LogStd(logging.LOG_LEVEL_INFO, "OCR and Image processing took: ", elapsedTime)

	systemSettingsRepository := repositories.NewSystemSettingsRepository(service.TX)
	systemSettings, err := systemSettingsRepository.GetSystemSettings()
	if err != nil {
		systemTaskCommand.Status = models.SYSTEM_TASK_FAILED
		systemTaskCommand.ResultDescription = err.Error()
		return "", systemTaskCommand, err
	}

	if systemSettings.DebugOcr {
		err = service.writeDebuggingFiles(text, path, imageBytes, elapsedTime)
		if err != nil {
			return "", commands.UpsertSystemTaskCommand{}, err
		}
	}

	ocrEndTime := time.Now()
	systemTaskCommand.EndedAt = &ocrEndTime
	systemTaskCommand.ResultDescription = text

	return text, systemTaskCommand, nil
}

// ocrCharBlacklist names the characters Tesseract may not output: the ones that only ever appear on a receipt as
// misread smudges and folds. Everything a receipt is written with stays readable, the separators above all: "-" and
// "/" in dates and negative amounts, ":" in times, "." and "," in amounts, "%" in VAT rates and discounts, currency
// signs, "&" and "'" in shop names, "*" and "#" beside items. An earlier list removed most of those, so a date reached
// the AI as "09112026" and "-20%" as "20".
const ocrCharBlacklist = "|~`^_{}[]<>\\"

// ocrLanguages are the languages Tesseract reads a receipt in: the five the app ships in, whose data the image
// installs (docker/checks/runtime-check.sh proves each). With English alone, as before, a Polish, German, French
// or Spanish receipt lost its accented letters, and with them shop and product names. All five are always asked
// for: a household buys abroad, and a receipt does not say which language it is in.
var ocrLanguages = []string{"eng", "pol", "deu", "fra", "spa"}

func (service OcrService) ReadImageWithTesseract(preparedImageBytes []byte) (string, error) {
	return imagetool.ReadText(context.Background(), preparedImageBytes, ocrLanguages, map[string]string{
		"tessedit_char_blacklist": ocrCharBlacklist,
	})
}

func (service OcrService) writeDebuggingFiles(ocrText string, path string, imageBytes []byte, ocrDuration time.Duration) error {
	fileRepository := repositories.NewFileRepository(nil)
	pathParts := strings.Split(path, "/")
	filename := pathParts[len(pathParts)-1]

	tempPath := fileRepository.GetTempDirectoryPath()
	textFilePath := filepath.Join(tempPath, filename+".txt")
	// The prepared image is a PNG (prepareImage); it is written as it was read.
	imageFilePath := filepath.Join(tempPath, filename+".png")

	textBytes := []byte(ocrText)

	os.Remove(textFilePath)
	err := utils.WriteFile(textFilePath, textBytes)
	if err != nil {
		return err
	}

	os.Remove(imageFilePath)
	err = utils.WriteFile(imageFilePath, imageBytes)
	if err != nil {
		return err
	}

	fmt.Println("OCR Text saved to: ", textFilePath)
	fmt.Println("OCR Image saved to: ", imageFilePath)
	fmt.Println("OCR and image processing duration: ", ocrDuration)

	return nil
}

// prepareImage makes a photo easier for Tesseract to read: trimmed to the paper, black on white, straightened.
// The result is a PNG whatever the photo was (a bilevel picture is small without loss, and Tesseract reads it).
func (service OcrService) prepareImage(path string) ([]byte, error) {
	// The bytes are handed over, never the path: it holds the household's folder name, which a person chose, and
	// ImageMagick reads meaning into a file name (imagetool's rules).
	original, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	// The filters below cost time per pixel; a 12 MP phone photo is shrunk first. ocrImageMaxSide keeps receipt
	// print well above the size Tesseract needs.
	operations := imagetool.ShrinkToFit(ocrImageMaxSide)
	operations = append(operations,
		"-trim", "+repage",
		"-type", "bilevel",
		"-blur", "0x1.5",
		"-sharpen", "0x1",
		"-enhance",
		// "+contrast" lowers the contrast one step, as the library call did with sharpen=false.
		"+contrast",
		// The threshold the library call was given, in the same unit (an absolute value, not a percentage).
		"-deskew", "0.4",
	)

	return imagetool.Convert(context.Background(), original, imagetool.Conversion{Operations: operations, Format: "png"})
}
