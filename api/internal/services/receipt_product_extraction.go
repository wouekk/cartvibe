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
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"

	"github.com/shopspring/decimal"
)

// The prompts are kept short (input tokens) and ask for minified JSON that leaves out empty optional keys
// (output tokens, which set most of a read's latency). The parsers default what is left out: no quantity
// is "", no seasonality is NOT_PRODUCE.

// productExtractionPromptTemplate asks for a receipt's shop and product lines, with each product's
// category, health and season in the same answer (Phase 3 feedback: no separate classification wait).
// The %s slots are the region, the month and the product rules (productLineRulesTemplate).
const productExtractionPromptTemplate = `List every purchased line on this receipt or bill and classify each for a household in %s; the current month is %s.
Reply with minified JSON only, no code block:
{"shop":"...","currency":"...","products":[{"name":"...","displayName":"...","amount":0.0,"quantity":"...","health":"...","foodGroup":"...","seasonality":"..."}]}
- "shop": the brand only (Auchan, Uber, Ryanair), not street or branch; "" if unreadable.
- "currency": ` + currencyRule + `
%s
Not a receipt or bill: {"shop":"","currency":"","products":[]}.`

// inlineProductPromptTemplate is added to the receipt prompt of a quick scan, so the one answer carries the
// products too (ApplyInlineRead). The %s slots are the region, the month and the product rules.
const inlineProductPromptTemplate = `

Also add a "products" key to the same JSON object: every purchased line, classified for a household in %s; the current month is %s.
"products":[{"name":"...","displayName":"...","amount":0.0,"quantity":"...","health":"...","foodGroup":"...","seasonality":"..."}]
%s
Not a receipt or bill: "products":[].`

// currencyRule is how both receipt prompts read the currency.
const currencyRule = `ISO 4217 code as printed: zł/zl/PLN=PLN, £/pounds=GBP, CHF/Fr./SFr.=CHF, $=USD, €=EUR; "" if none. Give every amount exactly as printed, never converted.`

// healthRules is the one definition of the health ratings, for the product read and the classification sweep.
const healthRules = `HEALTHY, MEDIUM, UNHEALTHY, or NOT_FOOD (not food or drink).
  HEALTHY: fresh fruit and vegetables, legumes, whole grains, plain dairy, eggs, fish, lean meat, nuts, water, plain tea and coffee.
  MEDIUM: white bread, plain pasta and rice, cheese, butter, fruit juice, processed or red meat, breakfast cereals, sauces.
  UNHEALTHY: sweets, chocolate, biscuits and pastries, crisps and salty snacks, sugary or energy drinks, alcohol, fast food, ready meals high in fat, sugar or salt, tobacco.`

// seasonalityRuleTemplate: the %s slots are the region and the month.
const seasonalityRuleTemplate = `only for fresh fruit and vegetables: SEASONAL if in season in %s in %s, OUT_OF_SEASON if then most likely imported from another continent; leave it out for everything else (also frozen and canned).`

// foodGroupExamples names example categories only for a household without a category list: with one, English
// examples would tempt the AI to answer outside it, and every unknown name becomes a new category.
const foodGroupExamples = `a short lowercase category, e.g. "fresh produce", "dairy", "bakery", "meat", "drinks", "sweets & snacks", "alcohol", "household", "restaurant", "taxi", "airlines", "bills".`

const foodGroupFromList = `the category, from the list below.`

// foodGroupRule picks the "foodGroup" line for a category block (see foodGroupResolver.PromptBlock).
func foodGroupRule(categoryBlock string) string {
	if categoryBlock == "" {
		return foodGroupExamples
	}
	return foodGroupFromList
}

// productLineRulesTemplate describes one product line. The %s slots are the food group rule, the seasonality
// rule, the category rules and the household's earlier corrections.
const productLineRulesTemplate = `For each product line:
- "name": the line exactly as printed.
- "displayName": a short plain English name, e.g. "Semi-skimmed milk 1 L" for "LAIT DEMI-ECR 1L".
- "amount": the line's total as a number, after its own printed discount; leave it out if the line has no price.
- "quantity": the quantity or weight if printed ("2", "1.25 kg"); leave it out otherwise.
- "health": ` + healthRules + `
- "foodGroup": %s
- "seasonality": %s
%s%s
A bill for a service (ride, flight, ticket, toll, stay, meal, utility) is one line per service charged, at the amount paid with its own taxes and fees.
Skip totals, subtotals, separately printed tax summaries, payments, change, loyalty points, bottle deposits and coupons.`

// buildProductExtractionPrompt fills the template for a receipt bought in the given month.
func buildProductExtractionPrompt(month time.Time, categoryBlock string, corrections map[string]string) string {
	monthName := month.Format("January 2006")
	return fmt.Sprintf(
		productExtractionPromptTemplate,
		foodClassificationRegion, monthName, productLineRules(monthName, categoryBlock, corrections),
	)
}

// buildInlineProductPrompt is the part a quick scan adds to its receipt prompt (see inlineProductPromptTemplate).
func buildInlineProductPrompt(month time.Time, categoryBlock string, corrections map[string]string) string {
	monthName := month.Format("January 2006")
	return fmt.Sprintf(
		inlineProductPromptTemplate,
		foodClassificationRegion, monthName, productLineRules(monthName, categoryBlock, corrections),
	)
}

func productLineRules(monthName string, categoryBlock string, corrections map[string]string) string {
	foodGroup := foodGroupRule(categoryBlock)
	if categoryBlock != "" {
		categoryBlock += "\n"
	}

	return fmt.Sprintf(
		productLineRulesTemplate,
		foodGroup, fmt.Sprintf(seasonalityRuleTemplate, foodClassificationRegion, monthName), categoryBlock, correctionExamples(corrections),
	)
}

// correctionExamples lists the household's remembered health corrections for a prompt; "" without any.
func correctionExamples(corrections map[string]string) string {
	if len(corrections) == 0 {
		return ""
	}

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
	return fmt.Sprintf(foodClassificationCorrections, strings.Join(lines, "\n"))
}

// InlineProductPrompt is the products part of a quick scan's prompt for one group: its categories and its
// remembered corrections, for a receipt bought this month (app time zone).
func InlineProductPrompt(tx *gorm.DB, groupId uint) (string, error) {
	resolver, err := newFoodGroupResolver(tx)
	if err != nil {
		return "", err
	}
	corrections, err := repositories.NewFoodClassificationRepository(tx).CorrectionsForGroup(groupId)
	if err != nil {
		return "", err
	}
	now := time.Now().In(repositories.GetAppLocation())
	month := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	return buildInlineProductPrompt(month, resolver.PromptBlock(), corrections), nil
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

	products, shopName, currency, aiErr, answerErr := service.readProducts(receipt.GroupId, imagePaths, prompt)
	switch {
	case aiErr != nil:
		return service.recordOutage(extraction, aiErr)
	case answerErr != nil:
		return service.recordBadAnswer(extraction, answerErr)
	}

	return service.applyProducts(receipt, products, shopName, currency, resolver, corrections)
}

// ApplyInlineRead applies the products a quick scan's own answer carried, so a scanned receipt needs one AI
// call instead of two and is finished the moment it is saved. false means nothing was applied (the answer had
// no products list, or a sweep already took the receipt) and the sweep reads the receipt as before.
func (service ReceiptProductExtractionService) ApplyInlineRead(receiptId uint, response string) (bool, error) {
	cleaned := ReceiptProcessingService{}.cleanResponse(response)

	var keys map[string]json.RawMessage
	if err := json.Unmarshal([]byte(cleaned), &keys); err != nil {
		return false, nil
	}
	if _, hasProducts := keys["products"]; !hasProducts {
		return false, nil
	}
	products, err := parseProductResponse(cleaned)
	if err != nil {
		return false, nil
	}

	repository := repositories.NewReceiptProductRepository(service.TX)
	_, claimed, err := repository.ClaimPendingExtraction(receiptId, time.Now())
	if err != nil || !claimed {
		return false, err
	}

	receipt, err := repositories.NewReceiptRepository(service.TX).GetReceiptById(utils.UintToString(receiptId))
	if err != nil {
		return false, err
	}
	resolver, err := newFoodGroupResolver(service.TX)
	if err != nil {
		return false, err
	}
	corrections, err := repositories.NewFoodClassificationRepository(service.TX).CorrectionsForGroup(receipt.GroupId)
	if err != nil {
		return false, err
	}

	return true, service.applyProducts(receipt, products, parseShopName(cleaned), parseCurrency(cleaned), resolver, corrections)
}

// applyProducts stores a finished read: amounts converted like the receipt's, corrections and categories
// applied, then the receipt itself updated (applyReadResult).
func (service ReceiptProductExtractionService) applyProducts(
	receipt models.Receipt,
	products []models.ReceiptProduct,
	shopName string,
	currency string,
	resolver *foodGroupResolver,
	corrections map[string]string,
) error {
	repository := repositories.NewReceiptProductRepository(service.TX)

	// A receipt in another currency has its product amounts converted at the same rate as the receipt
	// (Phase 3 currencies): the rate it already carries, else the table's. Without a rate they stay as read.
	currencies, currencyErr := loadCurrencyContext()
	if currencyErr != nil {
		return currencyErr
	}
	currency, rate := currencies.receiptRate(receipt, currency)
	if rate != nil {
		for i := range products {
			if products[i].Amount != nil {
				converted := ConvertAmount(*products[i].Amount, *rate)
				products[i].Amount = &converted
			}
		}
	}

	for i := range products {
		products[i].ReceiptId = receipt.ID
		products[i].Position = i

		// A product the answer classified is finished: the household's earlier corrections win over
		// the AI on health, and its category goes through the Manage Categories list.
		if products[i].Health != "" {
			if health, corrected := corrections[models.NormalizeProductName(productClassificationName(products[i]))]; corrected {
				products[i].Health = health
			}
			products[i].FoodGroup, products[i].CategoryId = resolver.ResolveCategory(products[i].FoodGroup)
			classifiedAt := time.Now()
			products[i].ClassifiedAt = &classifiedAt
		}
	}

	err := repository.ReplaceProducts(receipt.ID, products)
	if err != nil {
		return err
	}

	return service.applyReadResult(receipt, shopName, currencies, currency, rate)
}

func (service ReceiptProductExtractionService) recordOutage(extraction models.ReceiptProductExtraction, aiErr error) error {
	repository := repositories.NewReceiptProductRepository(service.TX)
	message := truncateRunes("The AI was not available: "+aiErr.Error(), 500)

	if time.Since(extraction.CreatedAt) > productExtractionRetryWindow {
		return repository.UpdateExtraction(extraction.ReceiptId, models.PRODUCT_EXTRACTION_FAILED, time.Now(), extraction.Attempts, message)
	}

	// Nothing was called, so nothing is spent: wait for someone to configure the AI.
	if errors.Is(aiErr, errNoAiConfigured) {
		return repository.UpdateExtraction(
			extraction.ReceiptId,
			models.PRODUCT_EXTRACTION_UNAVAILABLE,
			time.Now().Add(productExtractionRetryAfterOutage),
			extraction.Attempts,
			message,
		)
	}

	// A failed call may still cost tokens, so outages count toward the same cap as unreadable answers (the AI
	// page promises at most three tries). "Read with AI" on a failed receipt starts the count again.
	attempts := extraction.Attempts + 1
	if attempts >= productExtractionMaxBadAnswers {
		return repository.UpdateExtraction(extraction.ReceiptId, models.PRODUCT_EXTRACTION_FAILED, time.Now(), attempts, message)
	}

	return repository.UpdateExtraction(
		extraction.ReceiptId,
		models.PRODUCT_EXTRACTION_UNAVAILABLE,
		time.Now().Add(productExtractionRetryAfterOutage),
		attempts,
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
) (products []models.ReceiptProduct, shopName string, currency string, aiErr error, answerErr error) {
	processingService, err := NewSystemReceiptProcessingService(service.TX, utils.UintToString(groupId))
	if err != nil || processingService.ReceiptProcessingSettings.ID == 0 {
		return nil, "", "", errNoAiConfigured, nil
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

		return parsed, parseShopName(cleaned), parseCurrency(cleaned), nil, nil
	}

	// An answer, even an unreadable one, means the AI was reachable: count it as a bad answer.
	if answerErr != nil {
		return nil, "", "", nil, answerErr
	}
	return nil, "", "", aiErr, nil
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
	Currency json.RawMessage `json:"currency"`
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
func (service ReceiptProductExtractionService) applyReadResult(
	receipt models.Receipt,
	shopName string,
	currencies currencyContext,
	currency string,
	rate *decimal.Decimal,
) error {
	db := service.GetDB()

	// A receipt read in another currency records it, and is converted once a rate is known (Phase 3
	// currencies). A receipt that already carries its original keeps it, and only gains a rate that was
	// missing, so a rate edited later never silently changes a converted receipt.
	if currency != "" && currencies.foreign(currency) {
		updates := map[string]any{}
		if receipt.OriginalCurrency == "" {
			updates["original_amount"] = receipt.Amount
			updates["original_currency"] = currency
			if rate != nil {
				updates["amount"] = ConvertAmount(receipt.Amount, *rate)
				updates["exchange_rate"] = *rate
			}
		} else if receipt.ExchangeRate == nil && rate != nil && receipt.OriginalAmount != nil {
			updates["amount"] = ConvertAmount(*receipt.OriginalAmount, *rate)
			updates["exchange_rate"] = *rate
		}

		if len(updates) > 0 {
			err := db.Model(&models.Receipt{}).Where("id = ?", receipt.ID).Updates(updates).Error
			if err != nil {
				return err
			}
		}
	}

	if shopName != "" && receipt.ShopName == "" {
		err := db.Model(&models.Receipt{}).Where("id = ?", receipt.ID).Update("shop_name", shopName).Error
		if err != nil {
			return err
		}
	}

	// A receipt still called "Receipt 20 Oct 2026" takes the shop's name once it is known; a name a person
	// typed is left alone.
	shop := receipt.ShopName
	if shop == "" {
		shop = shopName
	}
	if shop != "" && IsPlaceholderReceiptName(receipt.Name) {
		err := db.Model(&models.Receipt{}).Where("id = ?", receipt.ID).Update("name", shop).Error
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

// parseCurrency reads the optional "currency" of the AI's answer as an ISO code; "" when absent or unknown.
func parseCurrency(cleanedResponse string) string {
	var response productResponse
	if err := json.Unmarshal([]byte(cleanedResponse), &response); err != nil {
		return ""
	}

	return NormalizeCurrencyCode(looseString(response.Currency))
}
