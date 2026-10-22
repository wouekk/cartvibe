package services

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/reporting/render"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"strings"
	"time"
)

type ReceiptCsvService struct {
	CsvService

	// Location is the app time zone Added At and Resolved Date are printed in.
	// Nil reads it from System Settings when the CSV is built. A receipt's own
	// Date is a calendar day and is always printed in UTC.
	Location *time.Location
}

func NewReceiptCsvService() ReceiptCsvService {
	service := ReceiptCsvService{
		CsvService: NewCsvService(),
	}
	return service
}

func (service *ReceiptCsvService) BuildReceiptCsv(receipts []models.Receipt) (structs.ReceiptCsvResult, error) {
	csvResult := structs.ReceiptCsvResult{}

	headers := []string{
		"Id",
		"Added At",
		"Receipt Date",
		"Name",
		"Paid By",
		"Amount",
		"Status",
		"Categories",
		"Tags",
		"Resolved Date",
	}
	rowData := make([][]string, 0, len(receipts))
	dateFormat := "2006-01-02"
	location := service.Location
	if location == nil {
		location = repositories.GetAppLocation()
	}

	for _, receipt := range receipts {
		resolvedDateString := ""
		if receipt.ResolvedDate != nil {
			resolvedDateString = receipt.ResolvedDate.In(location).Format(dateFormat)
		}

		newRow := []string{
			utils.UintToString(receipt.ID),
			receipt.CreatedAt.In(location).Format(dateFormat),
			receipt.Date.UTC().Format(dateFormat),
			render.SanitizeCSVField(receipt.Name),
			render.SanitizeCSVField(receipt.PaidByUser.DisplayName),
			receipt.Amount.String(),
			string(receipt.Status),
			render.SanitizeCSVField(service.BuildCategoryString(receipt.Categories)),
			render.SanitizeCSVField(service.BuildTagString(receipt.Tags)),
			resolvedDateString,
		}
		rowData = append(rowData, newRow)
	}

	buffer, err := service.CsvService.BuildCsv(headers, rowData)
	if err != nil {
		return structs.ReceiptCsvResult{}, err
	}
	csvResult.ReceiptCsvBytes = buffer.Bytes()

	return csvResult, nil
}

func (service *ReceiptCsvService) BuildCategoryString(categories []models.Category) string {
	categoryNames := make([]string, 0, len(categories))
	for _, category := range categories {
		categoryNames = append(categoryNames, category.Name)
	}

	return strings.Join(categoryNames, ",")
}

func (service *ReceiptCsvService) BuildTagString(tags []models.Tag) string {
	tagNames := make([]string, 0, len(tags))
	for _, tag := range tags {
		tagNames = append(tagNames, tag.Name)
	}

	return strings.Join(tagNames, ",")
}

func (service *ReceiptCsvService) GetZippedCsvFiles(receipts []models.Receipt) ([]byte, error) {
	csvResult, err := service.BuildReceiptCsv(receipts)
	if err != nil {
		return nil, err
	}

	fileRepository := repositories.NewFileRepository(nil)
	zip, err := fileRepository.ZipFiles(
		[]string{"receipts.csv"},
		[][]byte{csvResult.ReceiptCsvBytes},
	)
	if err != nil {
		return nil, err
	}

	return zip, nil
}
