package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"receipt-wrangler/api/internal/logging"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
	"receipt-wrangler/api/internal/structs"
	"receipt-wrangler/api/internal/utils"

	"github.com/shopspring/decimal"
)

// productExtractionPromptTemplate asks for a receipt's shop and product lines, with each product's
// category, health and season in the same answer (Phase 3 feedback: no separate classification wait).
// The %s slots are the region, the month, the category rules and the household's earlier corrections.
const productExtractionPromptTemplate = `You read shop receipts. List every purchased product line on this receipt and classify each product for a household in %s. The current month is %s.

Return ONLY valid JSON in plain text, never in a code block, exactly in this shape:
{"shop": "...", "products": [{"name": "...", "displayName": "...", "amount": 0.0, "quantity": "...", "health": "...", "foodGroup": "...", "seasonality": "..."}]}

"shop": the name of the shop as printed on the receipt, the brand only, for example "Auchan", "Edeka" or "Rewe" (not the street, branch number or slogan). Use "" if it cannot be read.

For each product line:
- "name": the line exactly as printed on the receipt.
- "displayName": a short, plain English name for the product, for example "Semi-skimmed milk 1 L" for "LAIT DEMI-ECR 1L".
- "amount": what the line cost in total, as a number, after any discount printed for that line. Omit it if the line shows no price.
- "quantity": the quantity or weight if printed, for example "2" or "1.25 kg"; otherwise "".
- "health": "HEALTHY", "MEDIUM", "UNHEALTHY", or "NOT_FOOD" for anything that is not food or drink.
  HEALTHY: fresh fruit and vegetables, legumes, whole grains, plain dairy, eggs, fish, lean meat, nuts, water, plain tea and coffee.
  MEDIUM: white bread, plain pasta and rice, cheese, butter, fruit juice, processed or red meat, breakfast cereals, sauces.
  UNHEALTHY: sweets, chocolate, biscuits and pastries, crisps and salty snacks, sugary or energy drinks, alcohol, fast food, ready meals high in fat, sugar or salt, tobacco.
- "foodGroup": the product's category, a short lowercase name, for example "fresh produce", "dairy", "bakery", "meat", "fish", "drinks", "sweets & snacks", "alcohol", "frozen", "pantry", "household".
- "seasonality": only for fresh fruit and vegetables: "SEASONAL" if it is in season in %s in %s, or "OUT_OF_SEASON" if in that month it is most likely imported from another continent or frozen. "NOT_PRODUCE" for everything else, including frozen and canned produce.
%s%s
Do not list totals, subtotals, taxes, payment lines, change given, loyalty points, bottle deposits or coupons as products.
If this is not a shop receipt, or it has no product lines, return {"shop": "", "products": []}.`

// buildProductExtractionPrompt fills the template for a receipt bought in the given month.
func buildProductExtractionPrompt(month time.Time, categoryBlock string, corrections map[string]string) string {
	monthName := month.Format("January 2006")

	if categoryBlock != "" {
		categoryBlock += "\n"
	}

	examples := ""
	if len(corrections) > 0 {
		names := make([]string, 0, len(corrections))
		for name := range corrections {
			names = append(names, name)
		}
		sort.Strings(names)
		if len(names) > foodClassificationMaxExamples {
			names = names[:foodClassificationMaxExamples]
		}

		lines := make([]string, len(names))
		for i, name := range names {
			lines[i] = fmt.Sprintf("- %s: %s", name, corrections[name])
		}
		examples = fmt.Sprintf(foodClassificationCorrections, strings.Join(lines, "\n"))
	}

	return fmt.Sprintf(
		productExtractionPromptTemplate,
		foodClassificationRegion, monthName, foodClassificationRegion, monthName, categoryBlock, examples,
	)
}

const (
	// How long a receipt waits after the AI could not be reached before it is tried again.
	productExtractionRetryAfterOutage = time.Hour
	// How long a receipt waits after an unreadable answer before it is tried again.
	productExtractionRetryAfterBadAnswer = 10 * time.Minute
	// Unreadable answers allowed before giving up.
	productExtractionMaxBadAnswers = 3
	// After this long without success, an outage stops being retried.
	productExtractionRetryWindow = 14 * 24 * time.Hour
	// Receipts one sweep reads at most, so a big backfill drips through instead of hogging the worker.
	productExtractionBatchSize = 5
)

// errNoAiConfigured marks the "nothing to call" outage, which is retried like any other.
var errNoAiConfigured = errors.New("no AI is configured in the receipt processing settings")

type ReceiptProductExtractionService struct {
	BaseService
}

func NewReceiptProductExtractionService(tx *gorm.DB) ReceiptProductExtractionService {
	service := ReceiptProductExtractionService{BaseService: BaseService{
		DB: repositories.GetDB(),
		TX: tx,
	}}
	return service
}

// ProcessDueExtractions reads the products of up to a batch of receipts that are due, one at a time.
// It is what the periodic sweep runs. A failure on one receipt is recorded on that receipt and never
// stops the batch; only a database error does.
func (service ReceiptProductExtractionService) ProcessDueExtractions() (int, error) {
	repository := repositories.NewReceiptProductRepository(service.TX)
	processed := 0

	for processed < productExtractionBatchSize {
		extraction, ok, err := repository.ClaimDueExtraction(time.Now())
		if err != nil {
			return processed, err
		}
		if !ok {
			break
		}

		err = service.extract(extraction)
		if err != nil {
			return processed, err
		}
		processed++
	}

	return processed, nil
}

// extract reads one claimed receipt and records the outcome on its extraction row.
func (service ReceiptProductExtractionService) extract(extraction models.ReceiptProductExtraction) error {
	repository := repositories.NewReceiptProductRepository(service.TX)

	receipt, err := repositories.NewReceiptRepository(service.TX).GetReceiptById(utils.UintToString(extraction.ReceiptId))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		// Deleted since it was queued; nothing left to read.
		return repository.DeleteReceiptProducts(extraction.ReceiptId)
	}
	if err != nil {
		return err
	}

	imagePaths, err := service.receiptImagePaths(receipt)
	if err != nil {
		return err
	}
	if len(imagePaths) == 0 {
		return repository.UpdateExtraction(extraction.ReceiptId, models.PRODUCT_EXTRACTION_FAILED, time.Now(), extraction.Attempts, "The receipt has no image to read")
	}

	resolver, err := newFoodGroupResolver(service.TX)
	if err != nil {
		return err
	}
	corrections, err := repositories.NewFoodClassificationRepository(service.TX).CorrectionsForGroup(receipt.GroupId)
	if err != nil {
		return err
	}

	// The receipt's own month, as a calendar day stored as midnight UTC.
	boughtOn := receipt.Date.UTC()
	month := time.Date(boughtOn.Year(), boughtOn.Month(), 1, 0, 0, 0, 0, time.UTC)
	prompt := buildProductExtractionPrompt(month, resolver.PromptBlock(), corrections)

	products, shopName, aiErr, answerErr := service.readProducts(receipt.GroupId, imagePaths, prompt)
	switch {
	case aiErr != nil:
		return service.recordOutage(extraction, aiErr)
	case answerErr != nil:
		return service.recordBadAnswer(extraction, answerErr)
	}

	for i := range products {
		products[i].ReceiptId = extraction.ReceiptId
		products[i].Position = i

		// A product the answer classified is finished: the household's earlier corrections win over
		// the AI on health, and its category goes through the Manage Categories list.
		if products[i].Health != "" {
			if health, corrected := corrections[models.NormalizeProductName(productClassificationName(products[i]))]; corrected {
				products[i].Health = health
			}
			products[i].FoodGroup = resolver.Resolve(products[i].FoodGroup)
			classifiedAt := time.Now()
			products[i].ClassifiedAt = &classifiedAt
		}
	}

	err = repository.ReplaceProducts(extraction.ReceiptId, products)
	if err != nil {
		return err
	}

	return service.applyReadResult(receipt, shopName)
}

func (service ReceiptProductExtractionService) recordOutage(extraction models.ReceiptProductExtraction, aiErr error) error {
	repository := repositories.NewReceiptProductRepository(service.TX)
	message := truncateRunes("The AI was not available: "+aiErr.Error(), 500)

	if time.Since(extraction.CreatedAt) > productExtractionRetryWindow {
		return repository.UpdateExtraction(extraction.ReceiptId, models.PRODUCT_EXTRACTION_FAILED, time.Now(), extraction.Attempts, message)
	}

	return repository.UpdateExtraction(
		extraction.ReceiptId,
		models.PRODUCT_EXTRACTION_UNAVAILABLE,
		time.Now().Add(productExtractionRetryAfterOutage),
		extraction.Attempts,
		message,
	)
}

func (service ReceiptProductExtractionService) recordBadAnswer(extraction models.ReceiptProductExtraction, answerErr error) error {
	repository := repositories.NewReceiptProductRepository(service.TX)
	attempts := extraction.Attempts + 1
	message := truncateRunes("The AI's answer could not be read: "+answerErr.Error(), 500)

	if attempts >= productExtractionMaxBadAnswers {
		return repository.UpdateExtraction(extraction.ReceiptId, models.PRODUCT_EXTRACTION_FAILED, time.Now(), attempts, message)
	}

	return repository.UpdateExtraction(
		extraction.ReceiptId,
		models.PRODUCT_EXTRACTION_PENDING,
		time.Now().Add(productExtractionRetryAfterBadAnswer),
		attempts,
		message,
	)
}

// receiptImagePaths loads the receipt's files itself, in upload order: GetReceiptById preloads none.
func (service ReceiptProductExtractionService) receiptImagePaths(receipt models.Receipt) ([]string, error) {
	files := []models.FileData{}
	err := service.GetDB().Where("receipt_id = ?", receipt.ID).Order("id ASC").Find(&files).Error
	if err != nil {
		return nil, err
	}

	fileRepository := repositories.NewFileRepository(service.TX)
	paths := make([]string, 0, len(files))

	for _, file := range files {
		path, err := fileRepository.BuildFilePath(utils.UintToString(receipt.ID), utils.UintToString(file.ID), file.Name)
		if err != nil {
			return nil, err
		}
		paths = append(paths, path)
	}

	return paths, nil
}

// readProducts asks the group's AI, then its fallback, for the products. aiErr means no AI could be
// reached at all (retry later); answerErr means one answered with something unreadable.
func (service ReceiptProductExtractionService) readProducts(
	groupId uint,
	imagePaths []string,
	prompt string,
) (products []models.ReceiptProduct, shopName string, aiErr error, answerErr error) {
	processingService, err := NewSystemReceiptProcessingService(service.TX, utils.UintToString(groupId))
	if err != nil || processingService.ReceiptProcessingSettings.ID == 0 {
		return nil, "", errNoAiConfigured, nil
	}

	candidates := []models.ReceiptProcessingSettings{processingService.ReceiptProcessingSettings}
	if processingService.FallbackReceiptProcessingSettings.ID > 0 {
		candidates = append(candidates, processingService.FallbackReceiptProcessingSettings)
	}

	for _, settings := range candidates {
		response, callErr := service.askAi(processingService, settings, imagePaths, prompt)
		if callErr != nil {
			aiErr = callErr
			logging.LogStd(logging.LOG_LEVEL_ERROR, "receipt products: AI call failed: "+callErr.Error())
			continue
		}

		cleaned := processingService.cleanResponse(response)
		parsed, parseErr := parseProductResponse(cleaned)
		if parseErr != nil {
			answerErr = parseErr
			continue
		}

		return parsed, parseShopName(cleaned), nil, nil
	}

	// An answer, even an unreadable one, means the AI was reachable: count it as a bad answer.
	if answerErr != nil {
		return nil, "", nil, answerErr
	}
	return nil, "", aiErr, nil
}

// askAi sends the receipt the same way receipt scanning does: the images themselves to a vision
// model, or their OCR text otherwise.
func (service ReceiptProductExtractionService) askAi(
	processingService ReceiptProcessingService,
	settings models.ReceiptProcessingSettings,
	imagePaths []string,
	prompt string,
) (string, error) {
	message := structs.AiClientMessage{Role: "user", Content: prompt}

	if settings.IsVisionModel {
		for _, path := range imagePaths {
			encoded, err := processingService.encodeImageForAi(path, settings)
			if err != nil {
				return "", err
			}
			message.Images = append(message.Images, encoded)
		}
	} else {
		ocrService := NewOcrService(service.TX, settings)
		texts := make([]string, 0, len(imagePaths))
		for _, path := range imagePaths {
			text, _, err := ocrService.ReadImage(path)
			if err != nil {
				return "", err
			}
			texts = append(texts, text)
		}
		message.Content += "\n\nReceipt text:\n" + strings.Join(texts, "\n\n")
	}

	aiService := AiService{ReceiptProcessingSettings: settings}
	response, _, err := aiService.CreateChatCompletion(structs.AiChatCompletionOptions{
		Messages:   []structs.AiClientMessage{message},
		DecryptKey: true,
	})

	return response, err
}

type productResponse struct {
	Shop     json.RawMessage `json:"shop"`
	Products []struct {
		Name        string          `json:"name"`
		DisplayName string          `json:"displayName"`
		Amount      json.RawMessage `json:"amount"`
		Quantity    json.RawMessage `json:"quantity"`
		Health      string          `json:"health"`
		FoodGroup   string          `json:"foodGroup"`
		Seasonality string          `json:"seasonality"`
	} `json:"products"`
}

// parseProductResponse turns the AI's JSON into products, tolerating the usual model sloppiness: an
// amount given as text ("1,09 €"), a number for a quantity, over-long strings. A line without a
// name is dropped. Only JSON that is not the asked-for shape is an error.
func parseProductResponse(cleanedResponse string) ([]models.ReceiptProduct, error) {
	var response productResponse
	err := json.Unmarshal([]byte(cleanedResponse), &response)
	if err != nil {
		return nil, err
	}
	if response.Products == nil {
		return nil, errors.New(`the answer has no "products" list`)
	}

	products := make([]models.ReceiptProduct, 0, len(response.Products))
	for _, line := range response.Products {
		name := strings.TrimSpace(line.Name)
		if name == "" {
			continue
		}

		product := models.ReceiptProduct{
			Name:        truncateRunes(name, models.MaxReceiptProductNameLength),
			DisplayName: truncateRunes(strings.TrimSpace(line.DisplayName), models.MaxReceiptProductNameLength),
			Amount:      parseLooseAmount(line.Amount),
			Quantity:    truncateRunes(strings.TrimSpace(looseString(line.Quantity)), models.MaxReceiptProductQuantityLength),
		}

		// The same answer may classify the product (Phase 3 feedback); without a usable health the
		// product is left for the classification sweep.
		if health := strings.ToUpper(strings.TrimSpace(line.Health)); models.IsHealthRating(health) {
			seasonality := strings.ToUpper(strings.TrimSpace(line.Seasonality))
			if !models.IsSeasonality(seasonality) {
				seasonality = models.SEASONALITY_NOT_PRODUCE
			}
			product.Health = health
			product.FoodGroup = truncateRunes(strings.ToLower(strings.TrimSpace(line.FoodGroup)), 50)
			product.Seasonality = seasonality
		}

		products = append(products, product)
	}

	return products, nil
}

var amountCharacters = regexp.MustCompile(`[^0-9,.\-]`)

// parseLooseAmount reads a number or a numeric string ("1.09", "1,09 €", "-0.50"); nil when absent
// or unreadable, rather than failing the whole receipt over one price.
func parseLooseAmount(raw json.RawMessage) *decimal.Decimal {
	text := strings.TrimSpace(looseString(raw))
	if text == "" {
		return nil
	}

	text = amountCharacters.ReplaceAllString(text, "")
	// A lone comma is a decimal separator ("1,09"); with both, the comma groups thousands ("1,234.50").
	if strings.Contains(text, ",") && !strings.Contains(text, ".") {
		text = strings.ReplaceAll(text, ",", ".")
	} else {
		text = strings.ReplaceAll(text, ",", "")
	}

	amount, err := decimal.NewFromString(text)
	if err != nil {
		return nil
	}

	rounded := amount.Round(2)
	return &rounded
}

// looseString reads a JSON string or number as text; empty for null, absent or anything else.
func looseString(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}

	var text string
	if json.Unmarshal(raw, &text) == nil {
		return text
	}

	var number json.Number
	if json.Unmarshal(raw, &number) == nil {
		return number.String()
	}

	return ""
}

func truncateRunes(text string, max int) string {
	if utf8.RuneCountInString(text) <= max {
		return text
	}
	return string([]rune(text)[:max])
}

// RequestReceiptProductRead queues one receipt to be (re-)read, e.g. after its read failed.
func RequestReceiptProductRead(receiptId uint) error {
	return repositories.NewReceiptProductRepository(nil).MarkReceiptProductsPending(receiptId)
}

// parseShopName reads the optional "shop" of the AI's answer; "" when absent or unreadable.
func parseShopName(cleanedResponse string) string {
	var response productResponse
	if err := json.Unmarshal([]byte(cleanedResponse), &response); err != nil {
		return ""
	}

	return truncateRunes(strings.TrimSpace(looseString(response.Shop)), models.MaxReceiptShopNameLength)
}

// applyReadResult is what a finished read does to the receipt itself (Phase 3 feedback): it fills in the
// shop name when the receipt has none, and a receipt still "To check" becomes Done, since the AI has
// read it. A person's own shop name is never overwritten, and a receipt already Done or Declined keeps
// its status.
func (service ReceiptProductExtractionService) applyReadResult(receipt models.Receipt, shopName string) error {
	db := service.GetDB()

	if shopName != "" && receipt.ShopName == "" {
		err := db.Model(&models.Receipt{}).Where("id = ?", receipt.ID).Update("shop_name", shopName).Error
		if err != nil {
			return err
		}
	}

	if receipt.Status != models.OPEN && receipt.Status != models.NEEDS_ATTENTION && receipt.Status != models.DRAFT {
		return nil
	}

	receipt.Status = models.RESOLVED
	err := db.Model(&models.Receipt{}).Where("id = ?", receipt.ID).Update("status", models.RESOLVED).Error
	if err != nil {
		return err
	}

	// Stamps the resolved date and settles the receipt's items, as every other way of resolving does.
	return repositories.NewReceiptRepository(service.TX).AfterReceiptUpdated(&receipt)
}

// productClassificationName is the name a product's correction is remembered under: its plain name.
func productClassificationName(product models.ReceiptProduct) string {
	if product.DisplayName != "" {
		return product.DisplayName
	}
	return product.Name
}
