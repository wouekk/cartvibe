package repositories

import (
	"strings"

	config "cartvibe/api/internal/env"
	"cartvibe/api/internal/models"

	"gorm.io/gorm"
)

const starterCategoriesMigration = "seed-starter-categories-v1"

// starterCategory is one category a household starts with. covers lists names the AI may already have made for
// the same thing; a household that has any of them keeps its own and does not get this one. A combined name
// ("Meat & Fish") may be covered by more than one starter.
type starterCategory struct {
	name        string
	description string
	covers      []string
}

// starterCategories covers everyday household spending, not only groceries, so the AI files a taxi ride or a
// flight under its own category instead of inventing one or leaving the receipt Uncategorized.
var starterCategories = []starterCategory{
	// Groceries
	{"Fresh Produce", "Fresh fruit and vegetables", []string{"Produce", "Fruit & Vegetables"}},
	{"Dairy", "Milk, yoghurt, cheese, butter, eggs", []string{"Cheese", "Eggs"}},
	{"Bakery", "Bread and pastries", []string{"Bread & Bakery"}},
	{"Meat", "Meat, poultry and cold cuts", []string{"Meat & Poultry", "Deli", "Meat & Fish"}},
	{"Fish & Seafood", "Fish and seafood", []string{"Fish", "Seafood", "Meat & Fish"}},
	{"Drinks", "Water, juice, soft drinks, coffee and tea", []string{"Beverages", "Coffee & Tea"}},
	{"Alcohol", "Beer, wine and spirits", nil},
	{"Sweets & Snacks", "Sweets, chocolate, crisps and snacks", []string{"Sweets", "Snacks"}},
	{"Frozen Food", "Frozen food", []string{"Frozen"}},
	{"Pantry", "Pasta, rice, flour, tins, sauces and spices", []string{"Canned Goods", "Condiments & Sauces", "Spices"}},
	{"Household", "Cleaning products, paper and other household goods", []string{"Cleaning", "Cleaning Supplies"}},
	{"Personal Care", "Toiletries and cosmetics", []string{"Health & Beauty"}},
	{"Baby", "Baby food, nappies and baby products", []string{"Baby Products"}},
	{"Pet Supplies", "Pet food and pet products", []string{"Pet Food"}},
	{"Pharmacy", "Medicines and pharmacy products", nil},
	// Eating out
	{"Restaurant", "Meals in restaurants and bars", nil},
	{"Takeaway & Delivery", "Takeaway and food delivery (Uber Eats, Deliveroo, Glovo)", []string{"Fast Food"}},
	{"Coffee & Cafés", "Cafés and coffee shops", nil},
	// Getting around
	{"Taxi", "Taxis and ride-hailing (Uber, Bolt, FreeNow)", nil},
	{"Public Transport", "Bus, tram, metro and local train tickets", []string{"Transport"}},
	{"Fuel", "Petrol, diesel and charging", nil},
	{"Parking", "Parking fees", nil},
	{"Highway Tolls", "Motorway and road tolls", nil},
	{"Car", "Car repairs, service, insurance and washing", nil},
	// Travel
	{"Airlines", "Flights and airline fees", nil},
	{"Trains", "Long-distance train and coach tickets", nil},
	{"Cruises", "Cruises and ferries", nil},
	{"Hotels", "Hotels and holiday rentals", nil},
	{"Travel", "Other travel costs: tours, travel insurance, visas", nil},
	// Leisure
	{"Museum", "Museums, galleries and attractions", nil},
	{"Cinema", "Cinema tickets and snacks", nil},
	{"Events & Concerts", "Concerts, theatre, shows and events", nil},
	{"Sports", "Sports, gym and sports gear", nil},
	{"Books", "Books, bookstores and magazines", []string{"Stationery"}},
	// Home and life
	{"Bills", "Electricity, gas, water, rent and other household bills", nil},
	{"Phone & Internet", "Mobile, internet and TV plans", nil},
	{"Subscriptions", "Streaming, apps and other subscriptions", nil},
	{"Clothing", "Clothes and shoes", nil},
	{"Electronics", "Electronics and appliances", nil},
	{"Home & Garden", "Furniture, DIY, kitchenware and garden", []string{"Furniture", "Garden", "Kitchenware", "Lighting"}},
	{"Health", "Doctors, dentists and opticians", nil},
	{"Education", "School, courses and tuition", nil},
	{"Gifts", "Presents and donations", nil},
}

// runStarterCategoriesMigration is the ledger entry. Test databases start without categories (every package's
// suite migrates its own, and their tests count and number categories from one), as they start without the
// bootstrap admin.
func runStarterCategoriesMigration(tx *gorm.DB) error {
	if config.GetDeployEnv() == "test" {
		return nil
	}
	return seedStarterCategories(tx)
}

// seedStarterCategories adds the starter categories a household does not have yet. A category is already there
// when any existing name or old name (alias) equals its name or one it covers, in any case, so the AI-made
// categories on an existing install stay as they are and nothing is doubled. Run once through the data
// migration ledger, so a starter category someone deletes stays deleted.
func seedStarterCategories(tx *gorm.DB) error {
	var existing []models.Category
	if err := tx.Select("name", "aliases").Find(&existing).Error; err != nil {
		return err
	}

	taken := map[string]bool{}
	for _, category := range existing {
		taken[strings.ToLower(strings.TrimSpace(category.Name))] = true
		for _, alias := range CategoryAliases(category.Aliases) {
			taken[strings.ToLower(alias)] = true
		}
	}

	for _, starter := range starterCategories {
		if starterIsTaken(starter, taken) {
			continue
		}
		if err := tx.Create(&models.Category{Name: starter.name, Description: starter.description}).Error; err != nil {
			return err
		}
		taken[strings.ToLower(starter.name)] = true
	}

	return nil
}

func starterIsTaken(starter starterCategory, taken map[string]bool) bool {
	for _, name := range append([]string{starter.name}, starter.covers...) {
		if taken[strings.ToLower(name)] {
			return true
		}
	}
	return false
}
