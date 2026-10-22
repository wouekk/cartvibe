package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
	"receipt-wrangler/api/internal/commands"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
)

const (
	// How many products of each kind one sweep looks at; batched per group and month into AI calls.
	foodClassificationSweepSize = 60
	// Corrections given to the AI as examples, newest first.
	foodClassificationMaxExamples = 40
	// The region seasonality is judged for (the user's choice, design doc decision 1).
	foodClassificationRegion = "Western Europe"
)

// foodClassificationPrompt shares its rules with the product read (healthRules, foodGroupRule, the seasonality
// rule). The %s slots are the region, the month, the food group rule, the seasonality rule, the category
// block with the corrections, and the products.
const foodClassificationPrompt = `Classify these shop products for a household in %s; the current month is %s.
For each product:
- "health": ` + healthRules + `
- "foodGroup": %s
- "seasonality": %s
%s
Reply with minified JSON only, no code block, one entry per product with its id:
{"products":[{"id":"1","health":"...","foodGroup":"...","seasonality":"..."}]}
Products: %s`

const foodClassificationCorrections = `
This household has corrected these before; follow their view for these and similar products:
%s
`

type FoodClassificationService struct {
	BaseService
}

func NewFoodClassificationService(tx *gorm.DB) FoodClassificationService {
	return FoodClassificationService{BaseService: BaseService{DB: repositories.GetDB(), TX: tx}}
}

// classificationBatch is one AI call: candidates of one group, bought in one month.
type classificationBatch struct {
	groupId    uint
	month      time.Time
	candidates []repositories.ClassificationCandidate
}

// ProcessPending classifies what is waiting. It is what the periodic sweep runs. An AI that is missing
// or unreachable leaves everything waiting for the next sweep; only a database error is returned.
func (service FoodClassificationService) ProcessPending() (int, error) {
	repository := repositories.NewFoodClassificationRepository(service.TX)

	if classificationOutages.paused(time.Now()) {
		return 0, nil
	}

	products, err := repository.UnclassifiedProducts(foodClassificationSweepSize)
	if err != nil {
		return 0, err
	}
	items, err := repository.UnclassifiedItems(foodClassificationSweepSize)
	if err != nil {
		return 0, err
	}

	classified := 0
	for _, batch := range buildClassificationBatches(append(products, items...), time.Now()) {
		count, err := service.classifyBatch(batch)
		if err != nil {
			return classified, err
		}
		classified += count
	}

	return classified, nil
}

// buildClassificationBatches groups candidates by group and by the month they were bought in: a
// receipt product's receipt month, or this month (in the app time zone) for a list item.
func buildClassificationBatches(candidates []repositories.ClassificationCandidate, now time.Time) []classificationBatch {
	appNow := now.In(repositories.GetAppLocation())
	thisMonth := time.Date(appNow.Year(), appNow.Month(), 1, 0, 0, 0, 0, time.UTC)

	batches := map[string]*classificationBatch{}
	keys := []string{}
	for _, candidate := range candidates {
		month := thisMonth
		if candidate.Kind == repositories.ClassificationKindProduct {
			// A receipt date is a calendar day stored as midnight UTC.
			date := candidate.ReceiptDate.UTC()
			month = time.Date(date.Year(), date.Month(), 1, 0, 0, 0, 0, time.UTC)
		}

		key := fmt.Sprintf("%d|%s", candidate.GroupId, month.Format("2006-01"))
		if batches[key] == nil {
			batches[key] = &classificationBatch{groupId: candidate.GroupId, month: month}
			keys = append(keys, key)
		}
		batches[key].candidates = append(batches[key].candidates, candidate)
	}

	sort.Strings(keys)
	result := make([]classificationBatch, 0, len(keys))
	for _, key := range keys {
		result = append(result, *batches[key])
	}
	return result
}

func (service FoodClassificationService) classifyBatch(batch classificationBatch) (int, error) {
	repository := repositories.NewFoodClassificationRepository(service.TX)

	corrections, err := repository.CorrectionsForGroup(batch.groupId)
	if err != nil {
		return 0, err
	}

	resolver, err := newFoodGroupResolver(service.TX)
	if err != nil {
		return 0, err
	}

	var answers map[string]repositories.ClassificationResult
	outcome, _ := askTextAi(service.TX, batch.groupId, buildClassificationPrompt(batch, corrections, resolver.PromptBlock()), "food classification",
		func(cleaned string) error {
			parsed, parseErr := parseClassificationResponse(cleaned)
			answers = parsed
			return parseErr
		})

	if outcome == textAiNotConfigured {
		// No AI: nothing is called, nothing counts against the products.
		return 0, nil
	}
	if outcome == textAiUnreachable {
		// An outage counts against no product, but the sweep backs off so a long one is not hammered.
		classificationOutages.recordFailure(time.Now())
		return 0, nil
	}
	classificationOutages.recordSuccess()

	now := time.Now()
	classified := 0
	changedItems := []repositories.ClassificationCandidate{}
	for index, candidate := range batch.candidates {
		answer, ok := answers[strconv.Itoa(index+1)]
		if !ok {
			err = repository.CountUnusableAnswer(candidate)
			if err != nil {
				return classified, err
			}
			continue
		}

		if health, corrected := corrections[models.NormalizeProductName(candidate.ClassificationName())]; corrected {
			answer.Health = health
		}

		answer.FoodGroup, answer.CategoryId = resolver.ResolveCategory(answer.FoodGroup)
		err = repository.SaveClassification(candidate, answer, now)
		if err != nil {
			return classified, err
		}
		classified++
		if candidate.Kind == repositories.ClassificationKindItem {
			changedItems = append(changedItems, candidate)
		}
	}

	service.publishClassifiedItems(batch.groupId, changedItems)
	return classified, nil
}

// publishClassifiedItems sends the updated items to the group's open shopping lists, so the tags
// appear without a refetch.
func (service FoodClassificationService) publishClassifiedItems(groupId uint, candidates []repositories.ClassificationCandidate) {
	shoppingListRepository := repositories.NewShoppingListRepository(service.TX)
	for _, candidate := range candidates {
		item, err := shoppingListRepository.GetShoppingListItemById(candidate.Id)
		if err != nil {
			continue
		}
		publishShoppingListEvent(models.ShoppingListEvent{
			Type:           models.ShoppingListEventItemUpdated,
			GroupId:        groupId,
			ShoppingListId: item.ShoppingListId,
			Item:           &item,
		})
	}
}

// CorrectShoppingListItem applies a person's correction to a list item, remembers it for the group,
// and sends the item to the group's open lists.
func (service FoodClassificationService) CorrectShoppingListItem(
	groupId uint,
	itemId uint,
	command commands.SetFoodClassificationCommand,
) (models.ShoppingListItem, error) {
	shoppingListRepository := repositories.NewShoppingListRepository(service.TX)
	item, err := shoppingListRepository.GetShoppingListItemById(itemId)
	if err != nil {
		return models.ShoppingListItem{}, err
	}

	err = service.saveCorrection(repositories.ClassificationKindItem, itemId, groupId, item.Name, command)
	if err != nil {
		return models.ShoppingListItem{}, err
	}

	item, err = shoppingListRepository.GetShoppingListItemById(itemId)
	if err != nil {
		return models.ShoppingListItem{}, err
	}

	publishShoppingListEvent(models.ShoppingListEvent{
		Type:           models.ShoppingListEventItemUpdated,
		GroupId:        groupId,
		ShoppingListId: item.ShoppingListId,
		Item:           &item,
	})
	return item, nil
}

// CorrectReceiptProduct applies a person's correction to a receipt product and remembers it.
func (service FoodClassificationService) CorrectReceiptProduct(
	groupId uint,
	product models.ReceiptProduct,
	command commands.SetFoodClassificationCommand,
) (models.ReceiptProduct, error) {
	name := product.DisplayName
	if name == "" {
		name = product.Name
	}

	err := service.saveCorrection(repositories.ClassificationKindProduct, product.ID, groupId, name, command)
	if err != nil {
		return models.ReceiptProduct{}, err
	}

	var updated models.ReceiptProduct
	err = service.GetDB().First(&updated, product.ID).Error
	return updated, err
}

// saveCorrection writes the correction and remembers it, in one transaction.
func (service FoodClassificationService) saveCorrection(
	kind string,
	id uint,
	groupId uint,
	name string,
	command commands.SetFoodClassificationCommand,
) error {
	return service.GetDB().Transaction(func(tx *gorm.DB) error {
		repository := repositories.NewFoodClassificationRepository(tx)

		err := repository.SaveCorrection(kind, id, command.Health, command.Seasonality, time.Now())
		if err != nil {
			return err
		}

		return repository.RememberCorrection(groupId, name, command.Health)
	})
}

func buildClassificationPrompt(batch classificationBatch, corrections map[string]string, categoryBlock string) string {
	month := batch.month.Format("January 2006")

	foodGroup := foodGroupRule(categoryBlock)
	examples := correctionExamples(corrections)
	if categoryBlock != "" {
		examples = categoryBlock + "\n" + examples
	}

	products := make([]map[string]string, len(batch.candidates))
	for i, candidate := range batch.candidates {
		products[i] = map[string]string{"id": strconv.Itoa(i + 1), "name": candidate.ClassificationName()}
	}
	productJson, _ := json.Marshal(products)

	return fmt.Sprintf(
		foodClassificationPrompt,
		foodClassificationRegion, month, foodGroup, fmt.Sprintf(seasonalityRuleTemplate, foodClassificationRegion, month),
		examples, string(productJson),
	)
}

type classificationResponse struct {
	Products []struct {
		Id          json.RawMessage `json:"id"`
		Health      string          `json:"health"`
		FoodGroup   string          `json:"foodGroup"`
		Seasonality string          `json:"seasonality"`
	} `json:"products"`
}

// parseClassificationResponse reads the AI's answer into results keyed by the ids it was given. Values
// outside the allowed sets become UNKNOWN health or NOT_PRODUCE seasonality rather than failing the
// batch; only JSON of the wrong shape is an error.
func parseClassificationResponse(cleanedResponse string) (map[string]repositories.ClassificationResult, error) {
	var response classificationResponse
	err := json.Unmarshal([]byte(cleanedResponse), &response)
	if err != nil {
		return nil, err
	}
	if response.Products == nil {
		return nil, errors.New(`the answer has no "products" list`)
	}

	results := make(map[string]repositories.ClassificationResult, len(response.Products))
	for _, product := range response.Products {
		id := strings.TrimSpace(looseString(product.Id))
		if id == "" {
			continue
		}

		health := strings.ToUpper(strings.TrimSpace(product.Health))
		if !models.IsHealthRating(health) {
			health = models.HEALTH_UNKNOWN
		}

		seasonality := strings.ToUpper(strings.TrimSpace(product.Seasonality))
		if !models.IsSeasonality(seasonality) {
			seasonality = models.SEASONALITY_NOT_PRODUCE
		}

		results[id] = repositories.ClassificationResult{
			Health:      health,
			FoodGroup:   truncateRunes(strings.ToLower(strings.TrimSpace(product.FoodGroup)), 50),
			Seasonality: seasonality,
		}
	}

	return results, nil
}
